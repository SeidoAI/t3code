import { useDecisionQueue } from "../../state/decisions";
import type { Decision, DecisionResponse, EnvironmentId } from "@t3tools/contracts";
import { AsyncResult } from "effect/unstable/reactivity";
import { useEffect, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import { ArrowLeftIcon, CircleHelpIcon, CheckIcon, ClockIcon } from "lucide-react";
import { useEnvironments } from "../../state/environments";
import { serverEnvironment } from "../../state/server";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { age, inTab, needsFounder, sortDecisions, type DecisionTab } from "./decisionView";

const tabs: [DecisionTab, string][] = [
  ["quick", "Quick decisions"],
  ["review", "Reviews"],
  ["waiting", "Waiting on agents"],
  ["deferred", "Deferred"],
  ["history", "History"],
];
const markdownComponents = {
  img: () => null,
  a: ({ children, href }: { children?: React.ReactNode; href?: string | undefined }) => (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
};
function Markdown({ children }: { children: string }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_a]:underline">
      <ReactMarkdown skipHtml components={markdownComponents}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
export function DecisionsPage() {
  const { environments } = useEnvironments();
  const supported = environments.filter(
    (e) => e.serverConfig?.environment.capabilities.seidoDecisions,
  );
  const [chosen, setChosen] = useState<string>("");
  const environment = supported.find((e) => e.environmentId === chosen) ?? supported[0];
  const environmentId = environment?.environmentId ?? null;
  const query = useDecisionQueue(environmentId);
  const [tab, setTab] = useState<DecisionTab>("quick");
  const [search, setSearch] = useState("");
  const [requester, setRequester] = useState("");
  const [project, setProject] = useState("");
  const navigate = useNavigate();
  const params = useSearch({ strict: false }) as { id?: string };
  const id = params.id;
  const select = (id?: string) =>
    void navigate({ href: `/decisions${id ? `?id=${encodeURIComponent(id)}` : ""}` });
  const all = query.data ?? [];
  const rows = sortDecisions(
    all.filter(
      (d) =>
        inTab(d, tab) &&
        (!requester || d.request.requester === requester) &&
        (!project || d.request.project === project) &&
        `${d.request.title} ${d.request.question} ${d.request.requester}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    ),
  );
  const selected = all.find((d) => d.id === id);
  return (
    <main className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <header className="border-b px-5 py-5 md:px-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Decisions{" "}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {all.filter((d) => needsFounder(d)).length} need you
              </span>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Make the call. Get the work moving.
            </p>
          </div>
          <Button variant="outline" onClick={query.refresh}>
            Refresh
          </Button>
        </div>
        {supported.length > 1 && (
          <label className="mt-3 block text-sm">
            Environment{" "}
            <select
              className="rounded border bg-background p-2"
              value={environmentId ?? ""}
              onChange={(e) => {
                setChosen(e.target.value);
                select();
              }}
            >
              {supported.map((e) => (
                <option key={e.environmentId} value={e.environmentId}>
                  {e.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <nav className="mt-5 flex flex-wrap gap-2" aria-label="Decision views">
          {tabs.map(([value, label]) => (
            <Button
              key={value}
              variant={tab === value ? "default" : "ghost"}
              onClick={() => {
                setTab(value);
                select();
              }}
              aria-pressed={tab === value}
            >
              {label} <span>{all.filter((d) => inTab(d, value)).length}</span>
            </Button>
          ))}
        </nav>
      </header>
      {!environmentId ? (
        <div className="m-8 rounded-lg border p-6">
          <h2 className="font-medium">Decisions unavailable</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Connect to the Seido T3 environment. Unmodified T3 servers do not provide this feature.
          </p>
        </div>
      ) : (
        <>
          {query.error && (
            <div role="alert" className="mx-5 mt-3 rounded border border-destructive p-3 text-sm">
              {query.error} Your unsent response is preserved.{" "}
              <Button variant="ghost" onClick={query.refresh}>
                Reconnect / refresh
              </Button>
            </div>
          )}
          <div className="flex min-h-0 flex-1">
            <aside
              className={`${id ? "hidden md:flex" : "flex"} w-full flex-col border-r md:w-80 lg:w-96`}
              aria-label="Decision queue"
            >
              <div className="space-y-2 border-b p-4">
                <Input
                  aria-label="Search decisions"
                  placeholder="Search decisions…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <div className="flex gap-2">
                  <select
                    aria-label="Filter by requester"
                    className="min-w-0 flex-1 rounded border bg-background p-2 text-xs"
                    value={requester}
                    onChange={(e) => setRequester(e.target.value)}
                  >
                    <option value="">All requesters</option>
                    {[...new Set(all.map((d) => d.request.requester))].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                  <select
                    aria-label="Filter by project"
                    className="min-w-0 flex-1 rounded border bg-background p-2 text-xs"
                    value={project}
                    onChange={(e) => setProject(e.target.value)}
                  >
                    <option value="">All projects</option>
                    {[...new Set(all.map((d) => d.request.project).filter(Boolean))].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                {query.isPending && !query.data ? (
                  <p role="status" className="p-4 text-sm">
                    Loading decisions…
                  </p>
                ) : rows.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">No decisions in this view.</p>
                ) : (
                  rows.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => select(d.id)}
                      aria-current={id === d.id ? "true" : undefined}
                      className={`mb-2 w-full rounded-lg border p-4 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${id === d.id ? "border-primary bg-accent" : "border-transparent hover:bg-accent"}`}
                    >
                      <div className="font-medium">{d.request.title}</div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        {d.request.requester} · waiting {age(d.createdAt)}
                        {d.request.reviewMinutes ? ` · ${d.request.reviewMinutes} min review` : ""}
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs">{d.request.blockedWork}</p>
                      {d.request.deadline && (
                        <p className="mt-2 text-xs">
                          Due {new Date(d.request.deadline).toLocaleString()} ·{" "}
                          {d.request.deadlineReason}
                        </p>
                      )}
                      {d.delivery === "unknown" || d.delivery === "failed" ? (
                        <p className="mt-2 text-xs text-destructive">Delivery needs attention</p>
                      ) : null}
                    </button>
                  ))
                )}
              </div>
            </aside>
            <section
              className={`${id ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col overflow-y-auto`}
              aria-label="Decision detail"
            >
              {selected ? (
                <>
                  <div className="p-3 md:hidden">
                    <Button variant="ghost" onClick={() => select()}>
                      <ArrowLeftIcon />
                      Back to decisions
                    </Button>
                  </div>
                  <DecisionPanel
                    key={`${environmentId}:${selected.id}`}
                    decision={selected}
                    environmentId={environmentId}
                    refresh={query.refresh}
                  />
                </>
              ) : (
                <div className="m-auto p-8 text-center text-muted-foreground">
                  <CircleHelpIcon className="mx-auto mb-3 size-8" />
                  <p>
                    {id
                      ? "Decision not found in this environment."
                      : "Choose a decision to see the context and make the call."}
                  </p>
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </main>
  );
}
function DecisionPanel({
  decision: d,
  environmentId,
  refresh,
}: {
  decision: Decision;
  environmentId: EnvironmentId;
  refresh: () => void;
}) {
  const detail = useEnvironmentQuery(
    serverEnvironment.decisionDetail({ environmentId, input: { id: d.id } }),
  );
  const submit = useAtomCommand(serverEnvironment.respondToDecision, { reportFailure: false });
  const draftKey = `seido-decision-draft:${environmentId}:${d.id}`;
  const [draft] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem(draftKey) ?? "null") as {
        text: string;
        version: number;
      } | null;
    } catch {
      return null;
    }
  });
  const [text, setText] = useState(draft?.text ?? "");
  const [reviewedVersion, setReviewedVersion] = useState(draft?.version ?? d.version);
  const [mode, setMode] = useState<"answer" | "clarify" | "defer">("answer");
  const [until, setUntil] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const value = { text, version: reviewedVersion };
    try {
      sessionStorage.setItem(draftKey, JSON.stringify(value));
    } catch {
      /* Storage-disabled browsers still retain the in-memory draft. */
    }
  }, [text, reviewedVersion, draftKey]);
  const refreshDetail = detail.refresh;
  const detailRevision = `${d.updatedAt}:${d.delivery}:${d.acknowledgement}`;
  useEffect(() => {
    if (detailRevision) refreshDetail();
  }, [detailRevision, refreshDetail]);
  const act = async (action: DecisionResponse["action"], value = text) => {
    setBusy(true);
    setError(null);
    try {
      const result = await submit({
        environmentId,
        input: {
          id: d.id,
          version: reviewedVersion,
          action,
          text: value,
          ...(action === "defer" ? { until: new Date(until).toISOString() } : {}),
        },
      });
      if (AsyncResult.isSuccess(result)) {
        setText("");
        sessionStorage.removeItem(draftKey);
        refresh();
        detail.refresh();
      } else {
        setError(
          "The response was not confirmed. Refresh to reconcile the saved decision before submitting again.",
        );
        refresh();
      }
    } catch {
      setError(
        "Could not confirm the response. Your draft is preserved; refresh before trying again.",
      );
    } finally {
      setBusy(false);
    }
  };
  const terminal = d.status === "answered" || d.status === "withdrawn";
  const changed = reviewedVersion !== d.version;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const late =
    d.delivery === "delivered" &&
    !d.acknowledgement &&
    now - Date.parse(d.deliveredAt ?? d.answeredAt ?? d.updatedAt) > 300000;
  return (
    <article className="mx-auto w-full max-w-3xl space-y-6 p-5 md:p-8">
      <div>
        <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
          {d.request.requester} · {d.request.kind === "quick" ? "Quick decision" : "Review"} ·
          version {d.version}
        </p>
        <h2 className="text-2xl font-semibold tracking-tight">{d.request.title}</h2>
        <p className="mt-4 text-lg leading-relaxed">{d.request.question}</p>
      </div>
      <section className="rounded-xl border bg-accent/40 p-5">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <CheckIcon className="size-4" />
          Recommendation
        </h3>
        <Markdown>{d.request.recommendation}</Markdown>
      </section>
      <section>
        <h3 className="mb-2 text-sm font-semibold">What this authorizes</h3>
        <Markdown>{d.request.scope}</Markdown>
      </section>
      <section>
        <h3 className="mb-2 text-sm font-semibold">Options and trade-offs</h3>
        <div className="space-y-3">
          {d.request.options.map((o) => (
            <div key={o.label} className="rounded-lg border p-4">
              <h4 className="font-medium">{o.label}</h4>
              <Markdown>{o.consequence}</Markdown>
              {!terminal && (
                <Button
                  variant="outline"
                  disabled={busy || changed}
                  onClick={() => {
                    setMode("answer");
                    setText(o.label);
                  }}
                >
                  Choose this option
                </Button>
              )}
            </div>
          ))}
        </div>
      </section>
      <section>
        <h3 className="mb-2 text-sm font-semibold">Context</h3>
        <Markdown>{d.request.context}</Markdown>
      </section>
      <section className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold">Waiting on this decision</h3>
          <Markdown>{d.request.blockedWork}</Markdown>
        </div>
        <div>
          <h3 className="text-sm font-semibold">Why the agent needs you</h3>
          <Markdown>{d.request.authorityReason}</Markdown>
        </div>
      </section>
      {d.request.links?.length ? (
        <details className="rounded-lg border p-4">
          <summary className="cursor-pointer text-sm font-medium">
            Supporting evidence ({d.request.links.length})
          </summary>
          <ul className="mt-3 space-y-2">
            {d.request.links.map((l) => (
              <li key={l.url}>
                <a className="text-sm underline" href={l.url} target="_blank" rel="noreferrer">
                  {l.label} ↗
                </a>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {d.response && (
        <section className="rounded-lg border p-4">
          <h3 className="text-sm font-semibold">
            {d.status === "clarification" ? "Your clarification request" : "Your response"}
          </h3>
          <Markdown>{d.response}</Markdown>
        </section>
      )}
      {d.delivery !== "none" && (
        <section aria-label="Response delivery" className="rounded-lg border p-4">
          <h3 className="text-sm font-semibold">
            {d.status === "clarification" ? "Clarification saved" : "Answer saved"} → {d.delivery} →{" "}
            {d.acknowledgement === "resumed"
              ? "Agent resumed"
              : d.acknowledgement === "blocked"
                ? "Agent remains blocked"
                : "Awaiting agent acknowledgement"}
          </h3>
          {d.deliveryNote && <p className="mt-2 text-sm">{d.deliveryNote}</p>}
          {d.acknowledgementNote && <p className="mt-2 text-sm">{d.acknowledgementNote}</p>}
          {late && (
            <p className="mt-2 text-sm">
              Delivered over five minutes ago. The agent has not confirmed resumption. Inspect its
              session; no duplicate notification has been sent.
            </p>
          )}
        </section>
      )}
      {!terminal && (
        <section className="space-y-3 rounded-xl border p-5" aria-label="Respond to decision">
          <h3 className="font-semibold">Your decision</h3>
          {changed && (
            <div role="alert" className="rounded border p-3 text-sm">
              This request changed since you started responding. Read version {d.version} before
              submitting.
              <div className="mt-2">
                <Button variant="outline" onClick={() => setReviewedVersion(d.version)}>
                  I’ve reviewed version {d.version}
                </Button>
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant={mode === "answer" ? "default" : "ghost"}
              onClick={() => setMode("answer")}
            >
              Answer
            </Button>
            <Button
              variant={mode === "clarify" ? "default" : "ghost"}
              onClick={() => setMode("clarify")}
            >
              Ask a question
            </Button>
            <Button
              variant={mode === "defer" ? "default" : "ghost"}
              onClick={() => setMode("defer")}
            >
              <ClockIcon />
              Defer
            </Button>
          </div>
          <Textarea
            aria-label={mode === "clarify" ? "Clarification question" : "Decision response"}
            placeholder={
              mode === "clarify"
                ? "What context is missing?"
                : "Choose an option above or write your own answer…"
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
          />
          {mode === "defer" && (
            <label className="block text-sm">
              Bring back at{" "}
              <input
                aria-label="Deferral time"
                type="datetime-local"
                className="ml-2 rounded border bg-background p-2"
                value={until}
                onChange={(e) => setUntil(e.target.value)}
              />
            </label>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={
                busy ||
                changed ||
                (mode !== "defer" && !text.trim()) ||
                (mode === "defer" && !until)
              }
              onClick={() => void act(mode)}
            >
              {busy
                ? "Saving…"
                : mode === "answer"
                  ? "Send answer"
                  : mode === "clarify"
                    ? "Send question"
                    : "Defer decision"}
            </Button>
            {d.status === "deferred" && (
              <Button
                variant="outline"
                disabled={busy || changed}
                onClick={() => void act("reopen", "Returned to queue")}
              >
                Return to queue now
              </Button>
            )}
            <Button
              variant="ghost"
              disabled={busy || changed}
              onClick={() => void act("withdraw", "Withdrawn by Sean")}
            >
              Withdraw
            </Button>
          </div>
        </section>
      )}
      <details className="rounded-lg border p-4">
        <summary className="cursor-pointer text-sm font-medium">History</summary>
        <ol className="mt-3 space-y-3">
          {detail.data?.events.map((e) => (
            <li key={e.sequence} className="text-xs">
              <span className="font-medium">{e.action}</span> · {new Date(e.at).toLocaleString()} ·
              v{e.version}
              <details className="mt-1">
                <summary className="cursor-pointer text-muted-foreground">Details</summary>
                <pre className="mt-2 whitespace-pre-wrap break-words">{e.detail}</pre>
              </details>
            </li>
          ))}
        </ol>
        {detail.error && <p role="alert">{detail.error}</p>}
      </details>
    </article>
  );
}
