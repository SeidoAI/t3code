// @effect-diagnostics nodeBuiltinImport:off globalDate:off globalConsole:off cryptoRandomUUID:off
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { DecisionStore } from "./store.ts";

export const help = `T3 Decisions — request founder decisions from any agent session.
Commands: create, list, show, update, withdraw, route, ack
  create --file request.json --request-key stable-key
  show <id>
  update <id> --version N --requester NAME --file request.json
  route <id> --version N --requester NAME --target EXACT-SESSION-ID
  withdraw <id> --version N --requester NAME
  ack <id> --version N --requester NAME --state resumed|blocked --note TEXT
Use --file - to read JSON from stdin. All results are JSON.
T3_DECISIONS_HOME selects the T3 home (defaults to T3CODE_HOME or ~/.t3).
T3_DECISIONS_URL sets the browser origin; otherwise links are relative.
Request fields: requester, returnSession, title, question, kind (quick|review),
context, recommendation, options [{label,consequence}], scope, blockedWork,
authorityReason; optional project, deadline+deadlineReason, reviewMinutes, links.
Founder answers are submitted in the Decisions page, not this agent CLI.`;

export function runCli(
  args: readonly string[],
  home = process.env.T3_DECISIONS_HOME ??
    process.env.T3CODE_HOME ??
    NodePath.join(NodeOS.homedir(), ".t3"),
): unknown {
  const [command, ...tail] = args;
  if (!command || command === "--help" || command === "help") return { help };
  const values = new Map<string, string>();
  const positional: string[] = [];
  for (let i = 0; i < tail.length; i++) {
    const part = tail[i]!;
    if (part.startsWith("--")) {
      const value = tail[++i];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${part}`);
      values.set(part.slice(2), value);
    } else positional.push(part);
  }
  const required = (key: string) => {
    const value = values.get(key);
    if (!value) throw new Error(`--${key} is required`);
    return value;
  };
  const readInput = () => {
    const file = required("file");
    return JSON.parse(NodeFS.readFileSync(file === "-" ? 0 : file, "utf8"));
  };
  const store = new DecisionStore(NodePath.join(home, "userdata", "decisions.sqlite"));
  try {
    if (command === "create") {
      const d = store.create(required("request-key"), readInput());
      return {
        ...d,
        url: `${(process.env.T3_DECISIONS_URL ?? "").replace(/\/$/, "")}/decisions?id=${d.id}`,
      };
    }
    if (command === "list") return store.list();
    const id = positional[0];
    if (!id) throw new Error("A decision ID is required.");
    if (command === "show") return store.detail(id);
    const version = Number(required("version"));
    const requester = required("requester");
    if (!Number.isSafeInteger(version) || version < 1)
      throw new Error("Version must be a positive integer.");
    switch (command) {
      case "update":
        return store.update(id, version, requester, readInput());
      case "withdraw":
        return store.withdraw(id, version, requester);
      case "route":
        return store.route(id, version, requester, required("target"));
      case "ack": {
        const state = required("state");
        if (state !== "resumed" && state !== "blocked")
          throw new Error("State must be resumed or blocked.");
        return store.ack(id, version, requester, state, required("note"));
      }
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  } finally {
    store.close();
  }
}
