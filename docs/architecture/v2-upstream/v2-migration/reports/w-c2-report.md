# W-C2 — prompt, command and interaction write path

## Design and outcome

Buddy now admits prompts through the native host client. `gateway/write.ts` owns selection, admission and synchronous completion; `gateway/execution.ts` observes the native public event feed before admission and correlates the supplied `msg_` inbox ID with delivery, assistant steps and execution success/failure/interruption. Per-session admission serialization prevents agent/model selection races and duplicate command-display observers attaching to the same admission. Execution waiting does not hold the admission lock. Batched steers can share an assistant; later delivered inputs cannot substitute their assistant for an earlier request. Compaction controls do not replace prompt correlation.

The asynchronous Buddy route still returns 204 after native admission. Synchronous prompt and template-command routes return the projected completed assistant. Commands whose native callback emits no prompt return the projected session; the command OpenAPI source declares that union. Acceptance callbacks run after admission, and later execution failures do not roll back accepted Buddy state. Supplied repair IDs are preserved: both SVG's `msg_buddy_svg_auto_repair_<sha256>` and Mermaid's `msg_buddy_mermaid_auto_repair_<uuid_with_underscores>` satisfy the native ID contract, so their feature call lines needed no changes.

Explicit compaction waits for the matching manual-compaction completion or failure and selects the requested provider/model first. It returns `true` for completion, rather than merely reporting admission. Native interruption returns its actual boolean, including `false` for an idle session. Native compaction has no legacy `auto` input; the optional Buddy field remains accepted and uses explicit native compaction.

Prompt text remains model-visible. `metadata.buddy.prompt` persists `{system?, segments:[{start,end,synthetic?,ignored?,metadata?}]}`. The gateway reconstructs transcript parts with their chip metadata and remaps file/agent mention ranges to visible text, excluding synthetic and hidden attachment segments. The context helper adds compiled Buddy system context from the latest delivered prompt and excludes ignored text from primary model requests. If native compaction removes the envelope from current context, it recovers the last delivered envelope from paginated user history. Commands project the existing runtime-plugin `metadata.buddy.command.display` in both history and live snapshots while retaining expanded templates for the model. Stored-message mutation and `command-transcript.ts` are obsolete and deleted.

The concise-response module retains durable chat-style migration/persistence; the wave-1 plugin handles actual context filtering and verbosity. Registry priming and v1 permission setters were removed from message and command orchestration. The W-E forwarding seam remains one function and its permission output is translated to native rules.

## Wave-1 review fixes

| Finding | Fix and regression |
| --- | --- |
| 2 — hydration duplicates queued deltas | Hydrated fragment coverage suppresses obsolete queued starts/deltas until the authoritative terminal value; completed assistant snapshots suppress all queued fragment mutations. Covered terminal tools cannot regress to pending/running. Stream tests include two queued text deltas, reasoning, terminal catch-up and a fresh fragment, plus queued tool lifecycle events. |
| 3 — private durable events create public sequence gaps | Sequence numbers need only increase. Duplicate/older durable events are ignored; reconnect/cache-miss recovery remains. Tests exercise a legitimate private-event gap without history reload. |
| 5 — web parser loses typed denial | Transcript, gateway, presentation resolver and web state preserve `errorType`. Parser/detector and gateway schema/presentation regressions use `permission.rejected` with arbitrary feedback, not the v1 English prefix. |
| 6 — invalid cursors become 500 | `InvalidCursorError` maps to 400. A real-host gateway regression passes a malformed cursor for an existing session; the rewritten route regression also covers it. |

The compatibility `/event` route already passes `globalEvents:{subscribe:subscribeGlobalEvent}`. A new HTTP regression uses the actual Buddy bus alongside native SSE, verifies directory isolation and unsubscribes on reader cancellation. No compatibility-route edit was needed. Findings 1 and 4 remain with the independent fix agent; no permission-route or memory-source edit was made here. The shared session authorization helper now compares canonical project roots, since distinct new Git roots can share native project ID `global`.

Fork-title lineage and manual-title cleanup already had wave-1 gateway implementations and were verified against code. A new real-host regression exercises first/second fork titles, metadata independence, persisted cleanup on rename and a renamed fork's new lineage. Canonicalization uses fresh authoritative native reads and independent transcript metadata, rather than the v1 mutable live-session patch/cache.

## Inventory (W-C2 changes only)

Created:

- `packages/opencode-adapter/src/gateway/{execution,write}.ts`
- `packages/transcript-contract/src/prompt.ts`
- `packages/buddy/src/learning/agent-execution/transforms/prompt-context.ts`
- `packages/opencode-adapter/test/gateway-execution.test.ts`
- `packages/transcript-contract/test/prompt.test.ts`
- `packages/buddy/test/session/{prompt-write,compaction,fork-title}.test.ts`
- `packages/buddy/test/session/v2-write-fixture.ts`
- `packages/web/test/tool-permission-state.test.ts`
- This report, `reports/w-c2-integration.md`, and `handoff-W-C2.md`

Changed:

- `packages/buddy/src/session/orchestration/{interaction-actions,sdk-session,core-actions}.ts`
- `packages/buddy/src/http/session.ts`; `packages/buddy/src/routes/session.ts`
- `packages/buddy/src/learning/prompt/workspace-file-references.ts`
- `packages/buddy/src/learning/agent-execution/transforms/{message-transform-orchestration,command-transform,concise-response-chat-state}.ts`
- `packages/opencode-adapter/src/gateway/{event,stream,message,errors,session}.ts`
- `packages/opencode-adapter/src/session-tool-presentation.ts`
- `packages/transcript-contract/src/{message,tool-presentation}.ts`
- `packages/web/src/components/chat/tools/{types,parse-tool-state,tool-permission}.ts`
- `packages/web/src/components/chat/sections/user-section.tsx`
- `packages/buddy/test/session/{abort-tools,command-transcript,message-route,session-api-parity}.test.ts`
- `packages/buddy/test/http/opencode-event-stream.test.ts`
- `packages/buddy/test/learning/{concise-response-chat-state,model-runtime-context,prompt-resource-references}.test.ts`
- `packages/opencode-adapter/test/gateway-{message,event,stream,host}.test.ts`
- Surgical export-line removals in adapter `src/index.ts` and `package.json`, and transcript-contract `package.json` additions for `prompt`, `session` and `event`.

Deleted after importer checks:

- `packages/buddy/src/session/orchestration/command-transcript.ts`
- `packages/opencode-adapter/src/{session-v2,session-status,global-event}.ts`

The current web chat-store/chat-actions already consume the local `state/session-status.ts`, whose types come from transcript-contract; there were no remaining adapter-status imports to migrate. Existing wave-1 changes, other agents' edits and the independent fix agent's `v2-transcript-route.test.ts` are excluded from this inventory.

## Required integration seams

1. **Runtime plugin owner/orchestrator:** wire and await `applyBuddyPromptContext(event: SessionContext, messages: readonly UpstreamMessage[], client?: Pick<SessionClient,"message">): Promise<void>`, exported by `learning/agent-execution/transforms/prompt-context.ts`, before `transformSessionContext(directory,event)` in the runtime plugin's context hook. Obtain delivered messages using `await ctx.session.context({sessionID:event.sessionID})`. Exact wiring and rationale are in `w-c2-integration.md`. The optional client defaults to the Buddy singleton; pass the plugin's configured host for custom-host assembly. The W-C2 real-host fixture wires this hook and tests compiled context, synthetic pointers, primary-request ignored-text exclusion and recovery after compaction. Production plugin wiring is outside W-C2 ownership and remains pending.
2. **W-E:** finish `resolveSubagentToolForwarding(input: {currentTools:TJsonValue|undefined;directory:string;model?:ToolModelInput;previousState?:TeachingSessionState;projectConfig:Awaited<ReturnType<typeof readProjectConfig>>;sessionID:string;targetAgent:string}):Promise<SubagentForwardingResult>` in `learning/agent-execution/transforms/subagent-tool-forwarding.ts`. Existing result fields are preserved: `stateSeed`, `sessionPermission`, `toolOverrides`. `ToolModelInput` is currently `Parameters<typeof ToolRegistry.tools>[0]`. Callers are `command-transform.ts` and the unowned `message-prompt-pipeline.ts`. Move tool overrides/child policy onto public plugin hooks; native prompts have no `tools` override field. This module and `opencode-runtime/subagent-tool-forwarding-runtime.ts` still load removed v1 modules and block broader Buddy test imports.
3. **Orchestrator:** regenerate the Buddy SDK from the updated OpenAPI source, then rerun web typecheck and the broader route/learning tests after W-E lands. No generated files or vendored code were edited here. No new dependency is required by W-C2; no install was run.

Public gateway write seams are:

```ts
admitSessionPrompt(client: SessionClient & Pick<EventClient,"event">, input: PromptInput)
promptSession(client, input: PromptInput, context: Omit<MessageContext,"sessionID"|"parentID">, signal?: AbortSignal, onAccepted?: () => Promise<void>): Promise<SessionWriteResult<MessageWithParts>>
commandSession(client, input: CommandInput, context: Omit<MessageContext,"sessionID"|"parentID">, signal?: AbortSignal, onAccepted?: () => Promise<void>): Promise<SessionWriteResult<MessageWithParts | Session>>
compactSession(client, input: {sessionID:string;agent?:string;model?:ModelRef}, signal?: AbortSignal): Promise<SessionWriteResult<boolean>>
observeSessionExecution(client: Pick<EventClient,"event">, input: {sessionID:string;promptID?:string;signal?:AbortSignal;operation?:"compaction";acceptsPrompt?: (event: InboxEnqueued) => boolean})
```

`observeSessionExecution` returns `ready`, `result`, `accepted`, a `promptID` getter and `close():Promise<void>`. Its typed error distinguishes abort, cancellation and disconnect. Gateway writes map cancellation/abort to 409 and disconnection to 503. `subscribeSvgAutoRepairTurnSettlement(input:{directory:string;sessionID:string;repairRequestID:string;settle(errorMessage:string):Promise<void>}):Promise<()=>void>` now subscribes before repair admission and settles on the correlated native outcome.

## Facades retained because external importers remain

Do not delete these until the following importers migrate (adapter index re-exports also remain):

| Facade | Remaining importers |
| --- | --- |
| `session.ts` | Buddy `src/opencode-runtime/subagent-tool-forwarding-runtime.ts`; `src/learning/agent-execution/transforms/subagent-tool-forwarding.ts`; tests `learning/subagent-tool-forwarding.test.ts`, `opencode-runtime/session-live.test.ts`; adapter `src/index.ts` |
| `session-live.ts` | Adapter `src/session.ts`, `src/index.ts`; Buddy `test/opencode-runtime/session-live.test.ts` |
| `message.ts` | Adapter `src/session-prompt.ts`, `src/index.ts` |
| `id.ts` | Buddy `src/opencode-runtime/subagent-tool-forwarding-runtime.ts`, `src/learning/agent-execution/transforms/subagent-tool-forwarding.ts`; tests `opencode-runtime/session-live.test.ts`, `learning/subagent-tool-forwarding.test.ts`; adapter `src/index.ts` |

No owned migrated caller imports these facades. The retained modules still contain v1 imports and consequently remain typecheck errors until their external callers move. `session-prompt.ts` belongs to W-E.

## Decisions for the user

No new product choice requires user input. Synchronous completion, repair IDs, compact command display, chip visibility, durable chat style and fork-title behavior use the behavior-preserving defaults. The native compaction API limitation for the legacy `auto` flag is noted above.

## Verification

All real-host tests use the configured test sandbox and explicit temporary runtime paths. No real Buddy home, Electron state, XDG state or notebook state was used.

- From `packages/buddy`: `bun ../../script/run-test-command.ts -- bun test --preload ./test/preload.ts test/session/fork-title.test.ts test/session/prompt-write.test.ts test/session/compaction.test.ts test/session/command-transcript.test.ts test/session/abort-tools.test.ts test/http/opencode-event-stream.test.ts` — **14 passed, 66 assertions**. Includes recovery of compiled context after compaction, synthetic-only legacy chat-style inference and metadata-preserving style persistence.
- From `packages/opencode-adapter`: `bun run test test/gateway-message.test.ts test/gateway-execution.test.ts test/gateway-event.test.ts test/gateway-stream.test.ts test/gateway-host.test.ts --test-name-pattern 'v2 gateway|v2 event'` — **20 passed, 64 assertions**, 15 unrelated tests filtered.
- Transcript-contract script tests for schema, presentation and fork titles — **31 passed**. `bun run --cwd packages/transcript-contract test test/prompt.test.ts --test-name-pattern 'prompt presentation'` — **5 passed, 6 assertions**.
- `bun run --cwd packages/web test test/tool-permission-state.test.ts` — **1 passed, 4 assertions**. The broader existing tool-presentation test is blocked by missing generated SDK files.
- Scoped oxlint on all changed code/tests — **passed, no warnings/errors**.
- Package typechecks were run sequentially through their scripts. Adapter has no errors in changed gateway/presentation/test files; retained facades and vendor Node typings still fail. Buddy has no errors in the changed owned files. `bun run --cwd packages/transcript-contract typecheck` passes. Some attempts were correctly rejected by the shared lock while another agent was typechecking; no concurrent compiler was started. Web script stops before compilation because the generated Buddy SDK is absent.
- `bun ./script/check-import-contract.ts` — **passed** on the final run; another agent removed the earlier external finding.
- Broader focused Buddy command for `message-route`, `session-api-parity`, `concise-response-chat-state`, `model-runtime-context`, and `prompt-resource-references` — **blocked before execution** by `opencode/agent/agent` through W-E's v1 forwarding seam. Those owned tests were migrated off direct v1 writes, but their route/pipeline assertions remain unverified until the seam is fixed.

Root lint/typecheck, SDK generation and complete application integration are left to the orchestrator as instructed. No commit, install, formatting run, browser verification or process termination was performed.
