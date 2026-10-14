W-C1 file and verification report

Created by W-C1
  packages/transcript-contract/src/session.ts
  packages/transcript-contract/src/message.ts
  packages/transcript-contract/src/event.ts
  packages/transcript-contract/test/transcript-schema.test.ts
  packages/opencode-adapter/src/gateway/client.ts
  packages/opencode-adapter/src/gateway/errors.ts
  packages/opencode-adapter/src/gateway/session.ts
  packages/opencode-adapter/src/gateway/message.ts
  packages/opencode-adapter/src/gateway/event.ts
  packages/opencode-adapter/src/gateway/stream.ts
  packages/opencode-adapter/test/gateway-message.test.ts
  packages/opencode-adapter/test/gateway-event.test.ts
  packages/opencode-adapter/test/gateway-stream.test.ts
  packages/opencode-adapter/test/gateway-host.test.ts
  packages/buddy/test/http/transcript-openapi.test.ts
  packages/buddy/test/session/v2-transcript-route.test.ts
  packages/web/test/v2-transcript.test.ts

Changed by W-C1
  packages/transcript-contract/src/core-tool-presentations.ts
  packages/opencode-adapter/src/session-tool-presentation.ts
  packages/opencode-adapter/test/session-tool-presentation.test.ts
  packages/buddy/src/routes/session.ts
  packages/buddy/src/routes/compatibility.ts
  packages/buddy/src/http/opencode-event-stream.ts
  packages/buddy/src/http/session.ts
  packages/buddy/src/session/orchestration/core-actions.ts
  packages/buddy/src/session/orchestration/lookup.ts
  packages/buddy/src/session/orchestration/abort-actions.ts
  packages/buddy/src/session/orchestration/parse-values.ts
  packages/buddy/test/http/opencode-event-stream.test.ts
  packages/web/src/state/chat-types.ts
  packages/web/src/state/chat-sync.ts
  packages/web/src/lib/directory-chat/chat-event-schemas.ts
  packages/web/src/lib/directory-chat/use-chat-sync.ts
  packages/web/src/components/chat/utils/part-guards.ts
  packages/web/src/components/chat/utils/message-utils.ts
  packages/web/src/components/chat/parts/assistant-part/assistant-part.tsx

Deleted by W-C1: none. Shared worktree changes from other workstreams are excluded.

Outside-ownership blockers
  packages/transcript-contract/package.json: add ./session -> ./src/session.ts and ./event -> ./src/event.ts exports. ./message was added by another workstream. Temporary aliases under /tmp/buddy-w-c1-*-tsconfig.json allow independent tests and scoped checks.
  packages/buddy/src/session/orchestration/interaction-actions.ts: migrate retained v1 SessionV2, MessageV2, SessionStatus and ID use plus v1 SDK prompt/command/shell request/response handling.
  packages/buddy/src/session/orchestration/command-transcript.ts: migrate v1 transcript reads/writes. The owned sdk-session.ts helpers remain for these excluded callers.
  packages/opencode-adapter/src/instance.ts and its importers: remove v1 opencode/project/instance-context dependency. This is the first SDK generation failure.
  packages/opencode-adapter/src/index.ts and legacy wrapper importers below: retire remaining v1 exports after those callers migrate.
  Shared root dependencies: current Node typings lack node:sqlite SQLInputValue/setReturnArrays/timeout and node:module.registerHooks used by v2; @types/mime-types is missing. No dependency installation or vendor edit performed.

Verification
  bun run --cwd packages/transcript-contract typecheck: PASS.
  bun ../../script/run-test-command.ts -- bun test --preload ../../script/test-preload.ts test/transcript-schema.test.ts test/tool-presentation.test.ts (cwd packages/transcript-contract): 11 PASS. An earlier package test invocation also passed all 31 tests in the four contract test files.
  bun ../../script/run-test-command.ts -- bun test --preload ../../script/test-preload.ts --tsconfig-override /tmp/buddy-w-c1-tsconfig.json test/gateway-host.test.ts test/gateway-message.test.ts test/gateway-event.test.ts test/gateway-stream.test.ts test/session-tool-presentation.test.ts (cwd packages/opencode-adapter): 13 PASS. Native host test verifies create/get/title update/synthetic inbox admission/structured empty-fork rejection/delete, all in sandbox.
  bun ../../script/run-test-command.ts -- bun test --preload ./test/preload.ts --tsconfig-override /tmp/buddy-w-c1-buddy-tsconfig.json test/http/opencode-event-stream.test.ts test/http/transcript-openapi.test.ts (cwd packages/buddy): 5 PASS. Actual Hono OpenAPI converter preserves Session, SessionStatus, Message, Part, TextPart, ToolPart, OutputFormat, NoticePart, CompactionPart component names.
  bun run --cwd packages/web test test/v2-transcript.test.ts test/chat-stream-event-buffer.test.ts test/whiteboard-progressive.test.ts: 36 PASS. chat-reducer.test.ts separately blocked importing absent SDK generated types.
  Targeted oxlint over all W-C1 files plus compatibility.ts: PASS.
  bun run --cwd packages/opencode-adapter typecheck -- --project /tmp/buddy-w-c1-gateway-tsconfig.json: PASS for gateway, helper, and unit tests with temporary export aliases. Including native-host dependencies is blocked by upstream Node/mime typings.
  Package Buddy and adapter typecheck attempts: FAIL due remaining v1 imports, missing contract exports, and other migration work. Scoped Buddy check uses temporary aliases and filters owned paths.
  bun run --cwd packages/web typecheck: FAIL before compilation because Buddy SDK is absent. A supplemental scoped check through the package typecheck lock resolved contract/Zod compatibility; remaining owned-file diagnostics concern absent SDK types.
  bun run sdk:generate: FAIL importing opencode/project/instance-context from packages/opencode-adapter/src/instance.ts. No generated files edited.
  test/session/v2-transcript-route.test.ts: BLOCKED importing @opencode-ai/core/session/execution/local via retained session-v2.ts. Test added but synthetic delivery through the full Buddy route remains unverified. Native synthetic resume:false only queues inbox data; resume/wait without a configured model/agent did not settle within ten seconds. A simulated assistant turn was not exercised; host options do not expose simulation.

Behavior and limits
  Hidden idle/system/agent/model/location-switched entries are omitted. Legacy snapshot/retry/subtask parts are not emitted. Notices expose source/state and short descriptions, with shell output where available. Metadata visibility markers survive. Revert operates on a whole message; supplied partID is rejected with HTTP 400. Manual compaction uses the v2 session model rather than legacy body model fields. Archive timestamps use Buddy-owned session metadata buddy.archivedAt because the public v2 update API has no archive field. Historical user agent/model are empty, so web preserves the current picker selection. Assistant parentID is derived from the nearest user in the loaded page/stream and otherwise empty; v2 has no parent message ID. The public stream has no message/part removal events; revert/fork and sequence gaps request authoritative resync.
  Part IDs are prt_<messageID>_<eight-digit content index>_<encoded kind or tool:callID>. Per-kind ordinals are counted separately for text and reasoning, then resolved to content indexes. Message IDs remain v2 IDs; upstream forks mint new copied message IDs. Tool metadata keeps native sessionID and adds sessionId for current task cards.

W-C1 retained legacy adapter modules: remaining importers

message.ts
  packages/buddy/src/session/orchestration/command-transcript.ts
  packages/buddy/src/session/orchestration/interaction-actions.ts
  packages/buddy/test/learning/ingest-full-text-plugin.test.ts
  packages/buddy/test/session/command-transcript.test.ts
  packages/opencode-adapter/src/index.ts
  packages/opencode-adapter/src/session-prompt.ts

session.ts
  packages/buddy/src/learning/agent-execution/transforms/command-transform.ts
  packages/buddy/src/learning/agent-execution/transforms/concise-response-chat-state.ts
  packages/buddy/src/learning/agent-execution/transforms/message-transform-orchestration.ts
  packages/buddy/src/learning/agent-execution/transforms/subagent-tool-forwarding.ts
  packages/buddy/src/opencode-runtime/subagent-tool-forwarding-runtime.ts
  packages/buddy/src/session/orchestration/command-transcript.ts
  packages/buddy/src/session/orchestration/interaction-actions.ts
  packages/buddy/test/learning/concise-response-chat-state.test.ts
  packages/buddy/test/learning/dynamic-tool-permission-toggle.test.ts
  packages/buddy/test/learning/model-runtime-context.test.ts
  packages/buddy/test/learning/runtime-tool-registration.test.ts
  packages/buddy/test/learning/subagent-tool-forwarding.test.ts
  packages/buddy/test/local-runtimes-routes.test.ts
  packages/buddy/test/mermaid/inline-objects.test.ts
  packages/buddy/test/opencode-runtime/session-live.test.ts
  packages/buddy/test/session/command-transcript.test.ts
  packages/buddy/test/session/message-route.test.ts
  packages/buddy/test/session/session-api-parity.test.ts
  packages/opencode-adapter/src/index.ts

session-v2.ts
  packages/buddy/src/session/orchestration/interaction-actions.ts
  packages/opencode-adapter/src/index.ts

session-status.ts
  packages/buddy/src/session/orchestration/interaction-actions.ts

session-live.ts
  packages/buddy/test/opencode-runtime/session-live.test.ts
  packages/opencode-adapter/src/index.ts
  packages/opencode-adapter/src/session.ts

session-prompt.ts
  packages/buddy/src/opencode-runtime/subagent-forwarding.ts
  packages/buddy/test/learning/subagent-tool-forwarding.test.ts

id.ts
  packages/buddy/src/learning/agent-execution/transforms/command-transform.ts
  packages/buddy/src/learning/agent-execution/transforms/concise-response-chat-state.ts
  packages/buddy/src/learning/agent-execution/transforms/message-transform-orchestration.ts
  packages/buddy/src/learning/agent-execution/transforms/subagent-tool-forwarding.ts
  packages/buddy/src/opencode-runtime/subagent-tool-forwarding-runtime.ts
  packages/buddy/src/session/orchestration/command-transcript.ts
  packages/buddy/src/session/orchestration/interaction-actions.ts
  packages/buddy/test/helpers/tools.ts
  packages/buddy/test/learning/concise-response-chat-state.test.ts
  packages/buddy/test/learning/dynamic-tool-permission-toggle.test.ts
  packages/buddy/test/learning/ingest-full-text-plugin.test.ts
  packages/buddy/test/learning/runtime-tool-registration.test.ts
  packages/buddy/test/learning/subagent-tool-forwarding.test.ts
  packages/buddy/test/local-runtimes-routes.test.ts
  packages/buddy/test/mermaid/render-tool.test.ts
  packages/buddy/test/opencode-runtime/session-live.test.ts
  packages/buddy/test/session/command-transcript.test.ts
  packages/buddy/test/session/message-route.test.ts
  packages/buddy/test/session/session-api-parity.test.ts
  packages/buddy/test/whiteboard/program.test.ts
  packages/opencode-adapter/src/index.ts

