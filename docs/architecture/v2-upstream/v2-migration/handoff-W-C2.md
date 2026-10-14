# W-C2 integration handoff

Owned implementation is complete; production context-hook wiring, W-E migration and SDK generation remain outside this workstream. Read `reports/w-c2-report.md` for the design, full file inventory, exact signatures and focused verification commands. The current worktree contains other agents' edits; re-read every file before editing and never revert their changes.

| Goal | Status |
| --- | --- |
| Native prompt admission, async 204 and synchronous final assistant | Implemented; real-host gateway tests pass |
| Command metadata display, concurrent admission correlation | Implemented; real-host live/history/model tests pass |
| Prompt chips, v2 files/agents and visible mention ranges | Implemented; native write/projection test passes; full legacy normalization tests blocked by W-E imports |
| Compaction completion, model selection and abort | Implemented; real-host success/failure/interrupt tests pass |
| Repair IDs and native execution settlement | Implemented; IDs verified and gateway outcome tests pass; broader route tests blocked |
| Concise persistence and transform cleanup | Persistence verified through a real host, including synthetic-only legacy history; broad transform tests blocked by W-E |
| Review findings 2, 3, 5 and 6 | Fixed; focused regressions pass |
| Buddy bus + host SSE multiplexing | Verified in code and tested with the real Buddy bus |
| Fork lineage, title cleanup and canonical projection | Real-host regression passes; v1 live patch retained only for external importers |
| Importer-free facade deletion | `session-v2`, `session-status`, `global-event` deleted; remaining importers listed in report |

Next steps, in order:

1. Runtime-plugin owner/orchestrator must await `applyBuddyPromptContext(event, await ctx.session.context({sessionID:event.sessionID}))` before `transformSessionContext(directory,event)` in the context hook. Exact snippet: `reports/w-c2-integration.md`. The helper restores compiled system context from delivered prompt metadata, recovers it from history after native compaction, and excludes ignored text from primary model requests. Pass the plugin's custom host as the optional third argument when appropriate. The W-C2 fixture tests this wiring; production does not yet have it.
2. W-E must finish the retained `resolveSubagentToolForwarding(input)` function and runtime forwarding module. Do not replace or remove this seam from callers without migrating both `command-transform.ts` and `message-prompt-pipeline.ts`. Tool overrides must be handled in plugin context hooks because native prompts do not accept `tools`.
3. Orchestrator must generate Buddy's SDK from route OpenAPI, then run the broader route/learning tests and web typecheck. Do not hand-edit generated files.
4. Rerun package checks after integration; fix only assigned files. Transcript-contract passes and completed Adapter/Buddy checks have no W-C2 errors, but Adapter/Buddy retain external v1 and vendor typing errors. Root lint/typecheck belong to orchestration.
5. Delete `session`, `message`, `id`, `session-live` only once every external importer listed in the report migrates. The adapter index re-exports count too. `session-prompt` remains W-E's module.

Traps:

- V2 command HTTP completion can precede observation of its enqueued event. Keep the authoritative inbox/history check and the admission lock until the command's enqueue is identified. Holding this lock through execution would break steer/queue admission.
- Public durable sequence numbers are not contiguous: private events consume numbers. Never restore the old gap-resync check.
- Hydration can include several queued deltas and tool terminal state. Suppressing only the triggering delta is insufficient; retain coverage until terminal catch-up.
- Native assistants lack parent IDs. Correlation comes from delivered inbox IDs and steps; controls and batched steers require the handling in `execution.ts`.
- Raw mention text stays intact in native prompt text. Old tests that expect token-removal/split text parts are obsolete. Synthetic prefixes require range remapping for the visible transcript.
- Do not point tests at real state. `v2-write-fixture.ts` supplies isolated runtime roots and the scripted model.

There are no pending user decisions. No dependency addition is needed. Latest verification and any final typecheck results are recorded in `reports/w-c2-report.md`.
