import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schedule from "effect/Schedule";
import {
  DecisionError,
  type Decision,
  type DecisionEvent,
  type DecisionResponse,
} from "@t3tools/contracts";
import { DecisionStore } from "@seido/decisions/store";
import { flushNotifications } from "@seido/decisions/bridge";
import * as ServerConfig from "../config.ts";

export class Decisions extends Context.Service<
  Decisions,
  {
    readonly list: Effect.Effect<readonly Decision[], DecisionError>;
    readonly detail: (
      id: string,
    ) => Effect.Effect<{ decision: Decision; events: readonly DecisionEvent[] }, DecisionError>;
    readonly respond: (input: DecisionResponse) => Effect.Effect<Decision, DecisionError>;
  }
>()("t3/decisions/Decisions") {}

const make = Effect.gen(function* () {
  const config = yield* ServerConfig.ServerConfig;
  const store = yield* Effect.acquireRelease(
    Effect.sync(() => new DecisionStore(`${config.stateDir}/decisions.sqlite`)),
    (store) => Effect.sync(() => store.close()),
  );
  const call = <A>(fn: () => A) =>
    Effect.try({
      try: fn,
      catch: (cause) =>
        new DecisionError({
          message: cause instanceof Error ? cause.message : "Decision operation failed.",
        }),
    });
  // Delivery is explicit for the deployed fork; isolated previews never wake real agents.
  if (process.env.T3_SEIDO_DECISIONS_DELIVERY === "1") {
    yield* Effect.promise(() => flushNotifications(store)).pipe(
      Effect.repeat(Schedule.spaced("5 seconds")),
      Effect.forkScoped,
    );
  }
  return Decisions.of({
    list: call(() => store.list()),
    detail: (id) => call(() => store.detail(id)),
    respond: (input) => call(() => store.respond(input)),
  });
});
export const layer = Layer.effect(Decisions, make);
