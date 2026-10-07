# Operating the Seido Decisions fork

Base: upstream stable `v0.0.45` (`6c8fed35dded9ff71c5b46807125457acbb76be6`). Fork identity: `0.0.45-seido.1`. Web is the new surface; upstream desktop/mobile remain compatible session clients but do not gain the Decisions page automatically.

Decision logic is in `packages/seido-decisions`. The integration surface is contracts/client runtime, CLI registration, three authenticated RPC methods, one server service, the Decisions route and sidebar entry. `userdata/decisions.sqlite` owns its own `user_version`; upstream session migrations are unchanged. Node 24's SQLite implementation is used. Answer and outbox insertion share a transaction.

Development must use an isolated `T3CODE_HOME` or `--base-dir`; never launch a development server against live sessions. `T3_SEIDO_DECISIONS_DELIVERY=1` enables the bridge only in the deployed instance. `T3_DECISIONS_SEND_COMMAND` can select the repository-owned `t3-send`; `T3_DECISIONS_URL` supplies the private web origin for absolute CLI links.

## Build and stage

Use the stable tag's lockfile and public `.env.example` connection settings. Do not copy credentials into source. Build the web app with `vp build` in `apps/web`, and the server with `vp pack` in `apps/server`. Place web output in `apps/server/dist/client`.

`node scripts/seido/stage.mjs PATH_TO_VERIFIED_OFFICIAL_RUNTIME RELEASE_DIRECTORY` stages a versioned installation from the built output, reusing the exact stable release's native modules/resource monitor. It requires Node 24 on the VM. It does not change services, CLI links, databases or routing. The standalone `t3-decision` wrapper invokes the same bundled `t3 decision` implementation.

Coordinate active turns and terminal processes before cutover. Retain the official runtime and original service unit as rollback. On this VM, child terminal processes can share the T3 service cgroup: a blanket stop can kill unrelated previews. Use a coordinated graceful launcher stop with a main-process-only systemd kill mode and verify the old server exits before starting the fork. Never run two servers against the same home.

Activate through a systemd drop-in pointing to the versioned fork's `t3 serve`, preserving the original home, port, private ingress and PATH. Enable the bridge after installing the transport extension. Point `~/.local/bin/t3` and `t3-decision` to that release. Verify command/server versions, threads, authenticated RPC, private ingress, existing messaging and the decision loop.

The fork rejects upstream self-update from both CLI and server, rather than silently replacing the feature. Upstream release information remains available. Future updates merge an upstream stable tag, resolve the small adapters, run focused checks and ordinary CI, build a new versioned directory, then perform the same coordinated cutover.

Rollback stops only the fork, restores the saved unit/drop-in and CLI links, and starts the retained official runtime. Keep `decisions.sqlite` intact. Do not restore an old session or message database over new work. When transport entries are uncertain, keep the extended deliverer or hold delivery; old transport code does not understand its no-resend markers.

## Transport and recovery

The dev-setup `tools/t3-send` extension owns stable external keys and JSON enqueue/status receipts. The existing worker delivers to T3 and Codex. A queued recipient stays queued while busy. Missing recipients produce a failed receipt. A provider acknowledgement lost after dispatch becomes unknown and is held; retries with that key cannot dispatch again. The Decisions bridge reads unknown status without re-enqueuing. Inspect the event history and `t3-send --result-json --external-status KEY` to reconcile; never manufacture a new key to retry uncertain delivery.

This is at-most-one automatic dispatch after an ambiguous provider outcome, not an exactly-once execution guarantee. Agent acknowledgement is a separate business event. Clarification updates invalidate old request versions. Late acknowledgements remain visible without repeated nudges.

## Ten-decision pilot

Count ten consecutive real, eligible founder decisions after activation, excluding synthetic verification records. Use stored creation/answer/acknowledgement timestamps and event history to report request-to-answer, answer-to-first-resumed acknowledgement, clarification rounds and every unresolved interval. Do not omit deferred periods or blocked acknowledgements. Record unnecessary escalations and maintenance minutes during the pilot review; neither can be inferred reliably from elapsed time. Export records with `t3-decision list` and `show ID` rather than creating another operational queue.

The pilot starts at zero until real requests arrive. It is complete only after ten actual decisions are reviewed, including any unresolved delivery/resumption gaps. No automatic prioritisation, external alerts or general task tracking is part of v1.
