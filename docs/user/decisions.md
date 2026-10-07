# Decisions

Open **Decisions** in the sidebar to answer requests from your agents. Quick decisions and larger reviews have separate queues. Deadlines come first, then the oldest requests. Deferred requests return when due; deferral never authorizes work.

The requester supplies the question, recommendation, alternatives and exact scope. Choose an option or write an answer, ask for clarification, or defer. An answer applies only to the version you reviewed. Draft answers survive a reconnect in the same browser tab; if the request changes, review it again before submitting.

**Waiting on agents** keeps answered requests visible until their owner acknowledges resumed work. Delivery and resumption are different: a delivered message does not prove the work continued. A blocked acknowledgement explains what remains. Unknown delivery is reconciled without sending another message.

## From any agent session on the VM

Both entry points use the same implementation and database:

```sh
t3 decision create --file request.json --request-key project-stable-choice
t3-decision create --file request.json --request-key project-stable-choice
```

Example request:

```json
{
  "requester": "dev-ui",
  "returnSession": "exact-T3-or-Codex-session-id",
  "title": "Enable editing in TEST?",
  "question": "Should editing become available to TEST users?",
  "kind": "quick",
  "context": "The editor is deployed behind a disabled flag. Its browser acceptance passed.",
  "recommendation": "Enable in TEST only.",
  "options": [
    { "label": "Enable TEST", "consequence": "TEST users can edit; production stays unchanged." },
    { "label": "Keep off", "consequence": "No user-visible change; acceptance remains complete." }
  ],
  "scope": "Change the TEST editing flag only. No production or cleanup authority.",
  "blockedWork": "Making the feature available in TEST.",
  "authorityReason": "The assignment explicitly excluded flag activation."
}
```

Use a stable request key to prevent duplicate requests. Optional fields are `project`, `deadline` with `deadlineReason`, `reviewMinutes`, and `links` containing `{label,url}`. Link long evidence rather than pasting it. `kind` is `quick` or `review`.

Read with `show <id>`; revise with `update <id> --version N --requester NAME --file request.json`. Update an existing clarification instead of creating another request. `route ... --target EXACT-SESSION-ID` transfers ownership's return address. A notification still queued or uncertain must be reconciled before moving it. A delivered answer can be forwarded to the successor session without a second decision.

After an answer, continue within its scope and acknowledge:

```sh
t3-decision ack ID --version N --requester dev-ui --state resumed --note "TEST activation started"
```

Use `--state blocked --note "Reason and next owner"` when another prerequisite remains. Starting a turn is not resumption. `withdraw` removes an obsolete request; `list` and `show` return JSON. Answers are entered in the UI.

Escalate only decisions outside your existing authority. Do not bury them in status reports, route ordinary questions through a PM, or maintain a second Markdown decision queue. This VM has a shared trust boundary; the CLI/UI separation is an operating convention, not independent founder authentication.
