// @effect-diagnostics nodeBuiltinImport:off globalDate:off globalConsole:off cryptoRandomUUID:off
import * as NodeChildProcess from "node:child_process";
import * as NodeUtil from "node:util";
import { DecisionStore, type Notification } from "./store.ts";

const exec = NodeUtil.promisify(NodeChildProcess.execFile);
export interface TransportReceipt {
  status: "queued" | "delivered" | "unknown" | "failed";
  detail?: string;
  deliveredAt?: string;
}
export type Transport = (n: Notification) => Promise<TransportReceipt>;
export const sendNotification: Transport = async (n) => {
  const message = [
    "From: t3-decisions",
    `To: ${n.requester}`,
    "Type: Handoff",
    "Subject: Founder decision response",
    "Action: Read the decision and continue within its stated scope.",
    "",
    n.text,
  ].join("\n");
  const args =
    n.status === "unknown"
      ? ["--result-json", "--external-status", n.key]
      : ["--from", "t3-decisions", "--result-json", "--external-key", n.key, n.target, message];
  const { stdout } = await exec(process.env.T3_DECISIONS_SEND_COMMAND ?? "t3-send", args, {
    timeout: 20_000,
    maxBuffer: 1_000_000,
  });
  const result: TransportReceipt = JSON.parse(stdout);
  if (!["queued", "delivered", "unknown", "failed"].includes(result.status))
    throw new Error("Unrecognized transport receipt.");
  return result;
};
// Unknown receipts use the read-only status operation above; they never enqueue another message.
// Queued submissions use the same external key and cannot duplicate the existing queue entry.
export async function flushNotifications(store: DecisionStore, send: Transport = sendNotification) {
  for (const n of store.notifications(true)) {
    try {
      const receipt = await send(n);
      store.delivery(n, receipt.status, receipt.detail ?? null, receipt.deliveredAt ?? null);
    } catch {
      store.delivery(
        n,
        "unknown",
        "Transport acknowledgement unavailable. Inspect t3-send using the saved external key; do not resend with a new key.",
      );
    }
  }
}
