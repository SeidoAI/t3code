// @effect-diagnostics nodeBuiltinImport:off
import * as NodeTest from "node:test";
import * as NodeAssert from "node:assert/strict";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { DecisionStore } from "./store.ts";
import { flushNotifications } from "./bridge.ts";
const request = {
  requester: "dev-ui",
  returnSession: "exact-session-id",
  title: "Choose rollout",
  question: "Enable the TEST flag?",
  kind: "quick",
  context: "The feature is deployed behind a flag.",
  recommendation: "Enable for TEST.",
  options: [{ label: "Enable TEST", consequence: "TEST users see it; production unchanged." }],
  scope: "TEST flag only",
  blockedWork: "TEST acceptance",
  authorityReason: "Assignment excluded activation.",
};
function fixture(t: { after: (fn: () => void) => void }) {
  const dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "decisions-"));
  const file = NodePath.join(dir, "decisions.sqlite");
  const store = new DecisionStore(file, () => "2026-10-07T04:00:00.000Z");
  t.after(() => {
    store.close();
    NodeFS.rmSync(dir, { recursive: true, force: true });
  });
  return { store, file };
}
NodeTest.test("create is idempotent, validates content and survives reopening", (t) => {
  const { store, file } = fixture(t);
  const a = store.create("work-1", request);
  NodeAssert.equal(store.create("work-1", request).id, a.id);
  NodeAssert.throws(
    () => store.create("work-1", { ...request, requester: "other" }),
    /another requester/,
  );
  NodeAssert.throws(() => store.create("bad", { ...request, deadline: "tomorrow" }), /deadline/);
  const second = new DecisionStore(file);
  NodeAssert.equal(second.get(a.id).request.question, request.question);
  second.close();
});
NodeTest.test("clarification returns revised scope to founder; stale answers cannot apply", (t) => {
  const { store } = fixture(t);
  const d = store.create("work-2", request);
  store.respond({ id: d.id, version: 1, action: "clarify", text: "Who is affected?" });
  const revised = store.update(d.id, 1, "dev-ui", { ...request, context: "Only TEST users." });
  NodeAssert.equal(revised.version, 2);
  NodeAssert.equal(revised.status, "open");
  NodeAssert.equal(store.notifications().length, 0);
  NodeAssert.throws(
    () => store.respond({ id: d.id, version: 1, action: "answer", text: "Yes" }),
    /changed/,
  );
});
NodeTest.test(
  "answer and one notification commit together; duplicate response rejected; ack is independent",
  async (t) => {
    const { store } = fixture(t);
    const d = store.create("work-3", request);
    store.respond({ id: d.id, version: 1, action: "answer", text: "Enable TEST only." });
    NodeAssert.equal(store.notifications().length, 1);
    NodeAssert.throws(
      () => store.respond({ id: d.id, version: 1, action: "answer", text: "Yes" }),
      /terminal/,
    );
    await flushNotifications(store, async () => ({ status: "queued" }));
    NodeAssert.equal(store.get(d.id).delivery, "queued");
    await flushNotifications(store, async () => ({
      status: "delivered",
      deliveredAt: "2026-10-07T04:01:00Z",
    }));
    NodeAssert.equal(store.get(d.id).acknowledgement, null);
    store.ack(d.id, 1, "dev-ui", "blocked", "Another prerequisite remains.");
    NodeAssert.equal(store.get(d.id).acknowledgement, "blocked");
    store.ack(d.id, 1, "dev-ui", "resumed", "TEST rollout started.");
    NodeAssert.equal(store.get(d.id).acknowledgement, "resumed");
  },
);
NodeTest.test("unknown delivery uses reconciliation without another enqueue", async (t) => {
  const { store } = fixture(t);
  const d = store.create("work-4", request);
  store.respond({ id: d.id, version: 1, action: "answer", text: "Yes" });
  let calls = 0;
  await flushNotifications(store, async () => {
    calls++;
    throw Error("lost acknowledgement");
  });
  await flushNotifications(store, async (notification) => {
    NodeAssert.equal(notification.status, "unknown");
    calls++;
    return { status: "unknown" };
  });
  NodeAssert.equal(calls, 2);
  NodeAssert.equal(store.get(d.id).delivery, "unknown");
  NodeAssert.equal(store.get(d.id).status, "answered");
});
NodeTest.test(
  "deferral has no authority or notification; route remains exact and requester-owned",
  (t) => {
    const { store } = fixture(t);
    const d = store.create("work-5", request);
    NodeAssert.throws(
      () => store.respond({ id: d.id, version: 1, action: "defer", text: "", until: "invalid" }),
      /future/,
    );
    store.respond({
      id: d.id,
      version: 1,
      action: "defer",
      text: "Tomorrow",
      until: "2026-10-08T00:00:00Z",
    });
    NodeAssert.equal(store.notifications().length, 0);
    NodeAssert.equal(store.get(d.id).answeredAt, null);
    NodeAssert.throws(() => store.route(d.id, 1, "other", "new-session"), /requester/);
    store.route(d.id, 1, "dev-ui", "new-session");
    NodeAssert.equal(store.get(d.id).request.returnSession, "new-session");
    store.respond({ id: d.id, version: 1, action: "reopen", text: "" });
    NodeAssert.equal(store.get(d.id).status, "open");
  },
);
NodeTest.test("bad responses roll back without losing request or creating an outbox entry", (t) => {
  const { store } = fixture(t);
  const d = store.create("work-6", request);
  NodeAssert.throws(() => store.respond({ id: d.id, version: 1, action: "answer", text: "" }));
  NodeAssert.equal(store.get(d.id).status, "open");
  NodeAssert.equal(store.notifications().length, 0);
  NodeAssert.equal(store.detail(d.id).events.length, 1);
});

NodeTest.test(
  "a delivered answer can follow a session transfer without duplicating the decision",
  async (t) => {
    const { store } = fixture(t);
    const d = store.create("transfer", request);
    store.respond({ id: d.id, version: 1, action: "answer", text: "Proceed in TEST" });
    await flushNotifications(store, async () => ({ status: "queued" }));
    NodeAssert.throws(() => store.route(d.id, 1, "dev-ui", "new-session"), /Reconcile/);
    await flushNotifications(store, async () => ({ status: "delivered" }));
    store.route(d.id, 1, "dev-ui", "new-session");
    NodeAssert.equal(store.list().length, 1);
    NodeAssert.equal(store.get(d.id).version, 1);
    NodeAssert.equal(store.get(d.id).response, "Proceed in TEST");
    NodeAssert.equal(store.notifications()[0]?.target, "new-session");
    NodeAssert.equal(store.get(d.id).delivery, "pending");
  },
);
