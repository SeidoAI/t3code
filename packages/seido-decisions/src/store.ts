// @effect-diagnostics nodeBuiltinImport:off globalDate:off globalConsole:off cryptoRandomUUID:off
import * as NodeSqlite from "node:sqlite";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeCrypto from "node:crypto";
import * as Schema from "effect/Schema";
import {
  DecisionRequest,
  type Decision,
  type DecisionEvent,
  type DecisionResponse,
} from "@t3tools/contracts";

const decodeRequest = Schema.decodeUnknownSync(DecisionRequest);

export interface Notification {
  key: string;
  decisionId: string;
  version: number;
  target: string;
  requester: string;
  text: string;
  status: string;
}

// Independent SQLite file and schema: upstream session migrations never own decision state.
export class DecisionStore {
  private db: NodeSqlite.DatabaseSync;
  private now: () => string;
  constructor(file: string, now: () => string = () => new Date().toISOString()) {
    this.now = now;
    NodeFS.mkdirSync(NodePath.dirname(file), { recursive: true, mode: 0o700 });
    this.db = new NodeSqlite.DatabaseSync(file);
    const version = Number(this.db.prepare("PRAGMA user_version").get()?.user_version ?? 0);
    if (version > 1) {
      this.db.close();
      throw new Error("Decision database is newer than this build.");
    }
    this.db.exec(`PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS decisions(id TEXT PRIMARY KEY, request_key TEXT UNIQUE NOT NULL, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events(sequence INTEGER PRIMARY KEY, decision_id TEXT NOT NULL, version INTEGER NOT NULL, at TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS outbox(key TEXT PRIMARY KEY, decision_id TEXT NOT NULL, version INTEGER NOT NULL, target TEXT NOT NULL, requester TEXT NOT NULL, text TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending');
      PRAGMA user_version=1;`);
  }
  close() {
    this.db.close();
  }
  private transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  private event(d: Decision, action: string, detail: unknown) {
    this.db
      .prepare("INSERT INTO events(decision_id,version,at,action,detail) VALUES(?,?,?,?,?)")
      .run(d.id, d.version, this.now(), action, JSON.stringify(detail));
  }
  private save(d: Decision) {
    this.db.prepare("UPDATE decisions SET body=? WHERE id=?").run(JSON.stringify(d), d.id);
    return d;
  }
  private validate(input: unknown) {
    const value = decodeRequest(input);
    if (JSON.stringify(value).length > 100_000)
      throw new Error("Request is too large; link to supporting evidence instead.");
    if (new Set(value.options.map((o) => o.label)).size !== value.options.length)
      throw new Error("Option labels must be distinct.");
    if (value.options.length < 1 || value.options.length > 8)
      throw new Error("Provide one to eight options with consequences.");
    if (
      value.deadline &&
      (!Number.isFinite(Date.parse(value.deadline)) || !value.deadlineReason?.trim())
    )
      throw new Error("A deadline requires a valid timestamp and reason.");
    if (
      value.reviewMinutes !== undefined &&
      (!Number.isFinite(value.reviewMinutes) || value.reviewMinutes <= 0)
    )
      throw new Error("Review minutes must be positive.");
    for (const link of value.links ?? [])
      if (!/^https?:\/\//i.test(link.url))
        throw new Error("Evidence links must use HTTP or HTTPS.");
    return value;
  }
  get(id: string): Decision {
    const row = this.db.prepare("SELECT body FROM decisions WHERE id=?").get(id);
    if (!row) throw new Error("Decision not found.");
    return JSON.parse(String(row.body));
  }
  list(): Decision[] {
    return this.db
      .prepare("SELECT body FROM decisions ORDER BY rowid DESC")
      .all()
      .map((row) => JSON.parse(String(row.body)) as Decision);
  }
  detail(id: string) {
    const decision = this.get(id);
    const events = this.db
      .prepare(
        "SELECT sequence,decision_id AS decisionId,version,at,action,detail FROM events WHERE decision_id=? ORDER BY sequence",
      )
      .all(id) as unknown as DecisionEvent[];
    return { decision, events };
  }
  create(key: string, input: unknown) {
    if (!key.trim()) throw new Error("A stable request key is required.");
    const request = this.validate(input);
    return this.transaction(() => {
      const existing = this.db.prepare("SELECT body FROM decisions WHERE request_key=?").get(key);
      if (existing) {
        const d = JSON.parse(String(existing.body)) as Decision;
        if (d.request.requester !== request.requester)
          throw new Error("Request key belongs to another requester.");
        return d;
      }
      const at = this.now();
      const d: Decision = {
        id: NodeCrypto.randomUUID(),
        requestKey: key,
        version: 1,
        request,
        status: "open",
        createdAt: at,
        updatedAt: at,
        deferUntil: null,
        response: null,
        answeredAt: null,
        acknowledgement: null,
        acknowledgementNote: null,
        acknowledgedAt: null,
        delivery: "none",
        deliveryNote: null,
        deliveredAt: null,
      };
      this.db.prepare("INSERT INTO decisions VALUES(?,?,?)").run(d.id, key, JSON.stringify(d));
      this.event(d, "created", request);
      return d;
    });
  }
  private check(id: string, version: number, requester?: string) {
    const d = this.get(id);
    if (d.version !== version)
      throw new Error("Decision changed. Read the latest version before acting.");
    if (requester && d.request.requester !== requester)
      throw new Error("Only the requester can modify this request.");
    return d;
  }
  update(id: string, version: number, requester: string, input: unknown) {
    const request = this.validate(input);
    return this.transaction(() => {
      const d = this.check(id, version, requester);
      if (d.status === "answered" || d.status === "withdrawn")
        throw new Error("Create a new request for a changed scope after an answer or withdrawal.");
      if (request.requester !== requester) throw new Error("Requester cannot change.");
      this.db
        .prepare("UPDATE outbox SET status='superseded' WHERE decision_id=? AND status='pending'")
        .run(id);
      const next: Decision = {
        ...d,
        request,
        version: d.version + 1,
        status: "open",
        updatedAt: this.now(),
        response: null,
        deferUntil: null,
        delivery: "none",
        deliveryNote: null,
        deliveredAt: null,
        acknowledgement: null,
        acknowledgementNote: null,
        acknowledgedAt: null,
      };
      this.save(next);
      this.event(next, "updated", request);
      return next;
    });
  }
  route(id: string, version: number, requester: string, target: string) {
    if (!target.trim()) throw new Error("An exact return session is required.");
    return this.transaction(() => {
      const d = this.check(id, version, requester);
      // Already queued messages cannot safely be moved by changing a database pointer.
      if (d.delivery === "queued" || d.delivery === "unknown")
        throw new Error(
          "Notification already submitted. Reconcile its delivery before moving this decision.",
        );
      const previous = this.db
        .prepare(
          "SELECT * FROM outbox WHERE decision_id=? AND version=? ORDER BY rowid DESC LIMIT 1",
        )
        .get(id, version);
      const renotify = previous && (d.delivery === "delivered" || d.delivery === "failed");
      if (renotify) {
        this.db
          .prepare(
            "INSERT INTO outbox(key,decision_id,version,target,requester,text) VALUES(?,?,?,?,?,?)",
          )
          .run(
            `decision:${id}:v${version}:${NodeCrypto.randomUUID()}`,
            id,
            version,
            target,
            requester,
            String(previous.text),
          );
      } else {
        this.db
          .prepare("UPDATE outbox SET target=? WHERE decision_id=? AND status='pending'")
          .run(target, id);
      }
      const next = this.save({
        ...d,
        request: { ...d.request, returnSession: target },
        ...(renotify
          ? {
              delivery: "pending" as const,
              deliveryNote: null,
              deliveredAt: null,
              acknowledgement: null,
              acknowledgementNote: null,
              acknowledgedAt: null,
            }
          : {}),
        updatedAt: this.now(),
      });
      this.event(next, "routed", { target });
      return next;
    });
  }
  respond(input: DecisionResponse) {
    return this.transaction(() => {
      const d = this.check(input.id, input.version);
      if (d.status === "answered" || d.status === "withdrawn")
        throw new Error("This decision already has a terminal response.");
      const at = this.now();
      if (d.status === "clarification" && (input.action === "answer" || input.action === "clarify"))
        throw new Error("Await the agent's revised request before responding again.");
      if (["answer", "clarify"].includes(input.action) && !input.text.trim())
        throw new Error("A response is required.");
      if (input.text.length > 50_000) throw new Error("Response is too large.");
      if (
        input.action === "defer" &&
        (!input.until ||
          !Number.isFinite(Date.parse(input.until)) ||
          Date.parse(input.until) <= Date.parse(at))
      )
        throw new Error("Choose a future deferral time.");
      const status =
        input.action === "answer"
          ? "answered"
          : input.action === "clarify"
            ? "clarification"
            : input.action === "defer"
              ? "deferred"
              : input.action === "withdraw"
                ? "withdrawn"
                : "open";
      const notify = input.action === "answer" || input.action === "clarify";
      const next: Decision = {
        ...d,
        status,
        updatedAt: at,
        response: input.text || null,
        deferUntil: input.action === "defer" ? input.until! : null,
        answeredAt: input.action === "answer" ? at : null,
        acknowledgement: null,
        acknowledgementNote: null,
        acknowledgedAt: null,
        ...(notify ? { delivery: "pending" as const, deliveryNote: null, deliveredAt: null } : {}),
      };
      this.save(next);
      this.event(next, input.action, input);
      if (notify) {
        const key = `decision:${d.id}:v${d.version}:${NodeCrypto.randomUUID()}`;
        const text = `${input.action === "answer" ? "Sean answered" : "Sean requested clarification for"} decision ${d.id} version ${d.version}.\n\nQuestion: ${d.request.question}\nScope: ${d.request.scope}\nResponse: ${input.text}\n\nRead the saved record with t3-decision show ${d.id}. ${input.action === "answer" ? `Continue within this scope and acknowledge using t3-decision ack ${d.id} --version ${d.version} --requester ${JSON.stringify(d.request.requester)} --state resumed --note "What resumed". If another blocker remains, acknowledge blocked with its reason.` : "Update this decision with the missing context using t3-decision update; do not create a duplicate."}`;
        this.db
          .prepare(
            "INSERT INTO outbox(key,decision_id,version,target,requester,text) VALUES(?,?,?,?,?,?)",
          )
          .run(key, d.id, d.version, d.request.returnSession, d.request.requester, text);
      }
      return next;
    });
  }
  withdraw(id: string, version: number, requester: string) {
    this.check(id, version, requester);
    return this.respond({ id, version, action: "withdraw", text: "Withdrawn by requester" });
  }
  ack(id: string, version: number, requester: string, state: "resumed" | "blocked", note: string) {
    if (!note.trim() || !["resumed", "blocked"].includes(state))
      throw new Error("A resumed/blocked state and explanation are required.");
    return this.transaction(() => {
      const d = this.check(id, version, requester);
      if (d.status !== "answered")
        throw new Error("Only an answered decision can be acknowledged.");
      const next = this.save({
        ...d,
        acknowledgement: state,
        acknowledgementNote: note,
        acknowledgedAt: this.now(),
        updatedAt: this.now(),
      });
      this.event(next, "acknowledged", { state, note });
      return next;
    });
  }
  notifications(includeUnknown = false): Notification[] {
    return this.db
      .prepare(
        "SELECT key,decision_id AS decisionId,version,target,requester,text,status FROM outbox WHERE status IN ('pending','queued') OR (? = 1 AND status='unknown')",
      )
      .all(includeUnknown ? 1 : 0) as unknown as Notification[];
  }
  delivery(
    n: Notification,
    status: Decision["delivery"],
    note: string | null,
    deliveredAt: string | null = null,
  ) {
    this.transaction(() => {
      this.db.prepare("UPDATE outbox SET status=? WHERE key=?").run(status, n.key);
      const d = this.get(n.decisionId);
      if (d.version !== n.version) return;
      if (d.delivery === status && d.deliveryNote === note) return;
      const next = this.save({ ...d, delivery: status, deliveryNote: note, deliveredAt });
      this.event(next, "delivery", { status, note });
    });
  }
}
