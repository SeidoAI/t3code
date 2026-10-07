import * as Schema from "effect/Schema";
import { TrimmedNonEmptyString } from "./baseSchemas.ts";

export const DecisionRequest = Schema.Struct({
  requester: TrimmedNonEmptyString,
  returnSession: TrimmedNonEmptyString,
  title: TrimmedNonEmptyString,
  question: TrimmedNonEmptyString,
  kind: Schema.Literals(["quick", "review"]),
  context: TrimmedNonEmptyString,
  recommendation: TrimmedNonEmptyString,
  options: Schema.Array(
    Schema.Struct({ label: TrimmedNonEmptyString, consequence: TrimmedNonEmptyString }),
  ),
  scope: TrimmedNonEmptyString,
  blockedWork: TrimmedNonEmptyString,
  authorityReason: TrimmedNonEmptyString,
  project: Schema.optionalKey(Schema.String),
  deadline: Schema.optionalKey(Schema.String),
  deadlineReason: Schema.optionalKey(Schema.String),
  reviewMinutes: Schema.optionalKey(Schema.Number),
  links: Schema.optionalKey(
    Schema.Array(Schema.Struct({ label: TrimmedNonEmptyString, url: TrimmedNonEmptyString })),
  ),
});
export type DecisionRequest = typeof DecisionRequest.Type;
export const Decision = Schema.Struct({
  id: Schema.String,
  requestKey: Schema.String,
  version: Schema.Number,
  request: DecisionRequest,
  status: Schema.Literals(["open", "clarification", "deferred", "answered", "withdrawn"]),
  createdAt: Schema.String,
  updatedAt: Schema.String,
  deferUntil: Schema.NullOr(Schema.String),
  response: Schema.NullOr(Schema.String),
  answeredAt: Schema.NullOr(Schema.String),
  acknowledgement: Schema.NullOr(Schema.Literals(["resumed", "blocked"])),
  acknowledgementNote: Schema.NullOr(Schema.String),
  acknowledgedAt: Schema.NullOr(Schema.String),
  delivery: Schema.Literals(["none", "pending", "queued", "delivered", "unknown", "failed"]),
  deliveryNote: Schema.NullOr(Schema.String),
  deliveredAt: Schema.NullOr(Schema.String),
});
export type Decision = typeof Decision.Type;
export const DecisionEvent = Schema.Struct({
  sequence: Schema.Number,
  decisionId: Schema.String,
  version: Schema.Number,
  at: Schema.String,
  action: Schema.String,
  detail: Schema.String,
});
export type DecisionEvent = typeof DecisionEvent.Type;
export const DecisionDetail = Schema.Struct({
  decision: Decision,
  events: Schema.Array(DecisionEvent),
});
export const DecisionResponse = Schema.Struct({
  id: Schema.String,
  version: Schema.Number,
  action: Schema.Literals(["answer", "clarify", "defer", "reopen", "withdraw"]),
  text: Schema.String,
  until: Schema.optionalKey(Schema.String),
});
export type DecisionResponse = typeof DecisionResponse.Type;
export class DecisionError extends Schema.TaggedError<DecisionError>()("DecisionError", {
  message: Schema.String,
}) {}
