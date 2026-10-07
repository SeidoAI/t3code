import { DecisionError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Console from "effect/Console";
import * as Option from "effect/Option";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { runCli, help } from "@seido/decisions/cli";

const subcommand = (name: string) =>
  Command.make(name, {
    id: Argument.String("id").pipe(Argument.optional),
    file: Flag.String("file").pipe(Flag.optional),
    requestKey: Flag.String("request-key").pipe(Flag.optional),
    version: Flag.String("version").pipe(Flag.optional),
    requester: Flag.String("requester").pipe(Flag.optional),
    target: Flag.String("target").pipe(Flag.optional),
    state: Flag.String("state").pipe(Flag.optional),
    note: Flag.String("note").pipe(Flag.optional),
  }).pipe(
    Command.withHandler((flags) =>
      Effect.try({
        try: () => {
          const args = [name];
          if (Option.isSome(flags.id)) args.push(flags.id.value);
          for (const [key, value] of Object.entries(flags))
            if (key !== "id" && Option.isSome(value))
              args.push(`--${key === "requestKey" ? "request-key" : key}`, value.value);
          // @effect-diagnostics-next-line preferSchemaOverJson:off
          return JSON.stringify(runCli(args), null, 2);
        },
        catch: (error) =>
          new DecisionError({
            message: error instanceof Error ? error.message : "Decision command failed",
          }),
      }).pipe(Effect.flatMap(Console.log)),
    ),
  );
export const decisionCommand = Command.make("decision").pipe(
  Command.withDescription("Request and track founder decisions."),
  Command.withHandler(() => Console.log(help)),
  Command.withSubcommands(
    ["create", "list", "show", "update", "withdraw", "route", "ack"].map(subcommand),
  ),
);
