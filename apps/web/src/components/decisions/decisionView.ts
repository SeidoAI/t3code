import type { Decision } from "@t3tools/contracts";
export type DecisionTab = "quick" | "review" | "waiting" | "deferred" | "history";
export function needsFounder(d: Decision, now = Date.now()) {
  return d.status === "open" || (d.status === "deferred" && Date.parse(d.deferUntil ?? "") <= now);
}
export function inTab(d: Decision, tab: DecisionTab, now = Date.now()) {
  if (tab === "quick" || tab === "review") return needsFounder(d, now) && d.request.kind === tab;
  if (tab === "waiting")
    return (
      d.status === "clarification" || (d.status === "answered" && d.acknowledgement !== "resumed")
    );
  if (tab === "deferred") return d.status === "deferred" && !needsFounder(d, now);
  return d.status === "withdrawn" || d.acknowledgement === "resumed";
}
export function sortDecisions(rows: readonly Decision[]) {
  return [...rows].sort(
    (a, b) =>
      (a.request.deadline ? Date.parse(a.request.deadline) : Infinity) -
        (b.request.deadline ? Date.parse(b.request.deadline) : Infinity) ||
      a.createdAt.localeCompare(b.createdAt),
  );
}
export function age(at: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(at)) / 60000));
  return minutes < 60
    ? `${minutes}m`
    : minutes < 1440
      ? `${Math.floor(minutes / 60)}h`
      : `${Math.floor(minutes / 1440)}d`;
}
