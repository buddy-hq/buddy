# W-G2 migration report

This report covers only W-G2 changes. Concurrent edits in other workstreams were preserved. No vendor, host, runtime, generated-file, or config implementation edits were made. No dependencies were added; no installs, formatting, commits, or browser verification were run.

## Behaviour by area

1. Buddy events: created the Buddy-owned publish/subscribe bus and moved SVG requests, SVG/filesystem edits, lesson writes, and note-library notifications to it. Filesystem notifications retain contained relative paths and omit relative paths for external files. Notes title sync subscribes to the shared host event stream, handles session.renamed, reads the current session, serializes note renames, and unsubscribes through AbortController.
2. Learner memory: session/message reads use paginated host calls with canonical notebook containment. Models/providers use scoped model.list, provider.list, and model.default. Extraction uses a temporary scoped session.generate, denies tools, validates Buddy-owned JSON parsing/Zod schemas, retries malformed responses, and removes the temporary session. Consolidation uses session.create/prompt/wait/generate and scoped permission rules; validates staged files before publication; exports the session atomically to the Buddy memory root under consolidation-archives/<sessionID>.json, then removes the runtime session. No public archive mutation exists. Auxiliary generation exposes text without usage, so extraction cost/token metadata is absent.
3. Image generation: managed image paths use Buddy openCodeRuntimePaths().data, preserving the runtime-managed location. Inputs and provenance checks use @buddy/transcript-contract/message. The new regression verifies exact recorded bytes, session ownership, image data URLs, and independence from mutable OpenCode global path initialization. codex-images.ts was not edited.
4. Reading: removed adapter IDs/provider/message dependencies; uses the Buddy transcript contract and scoped host model capabilities, retaining file-source parsing and unread/ingested markers.
5. Lesson workspace: writes use Buddy locked atomic file writes, cancellation checks, snapshots, metadata, and filesystem notifications without another permission prompt. Diagnostics return lspAvailable:false and an empty list: v2 provides LSP events but no public diagnostics query.
6. Notes capture: host session/message reads enforce notebook boundaries; visible v2 user text and assistant text are retained, and synthetic/reasoning content is excluded. Existing note-file mutation and title ownership rules are preserved.
7. Projects/files: project resolution uses host location.get/project.update. Upstream identity rules replace Buddy-local ID creation, preserving upstream reads of existing Git opencode cache files. No Buddy code writes new Git identity files. Open-project registry state uses directories and does not require an ID-key migration. Notebook indexing/list/read and editor containment now live in Buddy; indexing uses system Git plus bounded Node filesystem scanning, excludes ignored/deleted/hidden/cache entries, and supports aborts/deadlines. The compatibility file calls are surgical; the find-file response remains a string[] of paths.
8. Personas/context: code persona owns a copy of the current v2 GPT prompt asset. Availability/build version comes from OPENCODE_VERSION; prompt image capabilities come from scoped host model.list.
9. External authorization: Buddy-owned lexical/real-path containment and Git/Hg workspace roots replace Instance. External paths and external symlink targets still request authorization.
10. Bench transcripts: database authority comes from Buddy runtime env; prompts describe session_v2 and session_message, data JSON, and seq ordering instead of v1 session/message/part tables. Read-only SQLite access remains agent-facing; :memory: remains explicitly unavailable.
11. Build: OPENCODE_VERSION comes from the host export and the stale opencode-web-ui.gen.ts build injection is removed. The desktop build was not run.

## Exact handoffs

- W-C1: packages/buddy/src/routes/compatibility.ts /event must pass globalEvents: { subscribe: subscribeGlobalEvent } from packages/buddy/src/events/buddy-event-bus.ts to createBuddyEventStreamResponse. W-C1 has already added that hook; W-G2 changed only its import to the Buddy bus. No SSE implementation was edited by W-G2.
- W-C1/session owner: packages/buddy/src/session/orchestration/interaction-actions.ts still subscribes to the old adapter global-event bus; migrate to the Buddy bus for Buddy events and client.event.subscribe for runtime events.
- Route owner: packages/buddy/src/routes/compatibility.ts GET/HEAD /file/raw/:fileName still use Instance.provide/containsPath outside W-G2 endpoint ownership; move to explicit Buddy containment. packages/buddy/src/routes/project.ts still uses the old adapter Project; migrate to host location/project methods. Remaining shared compatibility errors are at lines 135, 572, 587, and 589, outside the changed file calls.
- Config owner: migrate packages/buddy/src/config/store/config-paths.ts, store/write-config.ts, runtime/opencode-sync.ts, orchestration/project-config-service.ts, and opencode/overlay-builder.ts off Instance/Global/Project. Their v1 imports block the notes integration suite and live learner-memory/model configuration.
- ChatGPT auth owner: packages/buddy/src/learning/features/image-generation/service/codex-images.ts still imports adapter Auth; migrate credential access through the authorized v2 mechanism. Its adapter dependency currently blocks imagegen.test.ts at module load.
- Adapter owner: packages/opencode-adapter/src/index.ts still re-exports ./llm; remove that export before deleting llm.ts and its manifest export. W-G2 did not edit the barrel because it is outside ownership. Remaining wrappers must await the exact importer migrations below.
- No extra host type re-exports or dependencies are required by W-G2.

## Verification

- Focused sandboxed Buddy command: bun ../../script/run-test-command.ts -- bun test --preload ./test/preload.ts test/learning/external-file-authorization.test.ts test/learning/memory-structured-output.test.ts test/learning/learner-memory-pipeline.test.ts test/events/buddy-event-bus.test.ts test/project/notebook-files.test.ts test/project/v2-project-history.test.ts test/svg-rendering/browser-render-requests.test.ts test/svg-rendering/render-svg-tool.test.ts test/learning/lesson-workspace-write-without-prompt.test.ts test/image-generation/generated-image-storage.test.ts
- Result: 56 pass, 0 fail, 165 assertions, 10 files. Real v2-host regressions boot inside mandatory test XDG temporary roots with separate database/config/data/cache/state/tmp directories and dispose only their own host.
- Scoped oxlint command: bun ./node_modules/oxlint/bin/oxlint --config ./.oxlintrc.json <all W-G2 TS files listed below>. Passed. compatibility.ts was linted separately and passed. git diff --check over owned/shared surgical files passed.
- bun run --cwd packages/buddy typecheck; then bun run --cwd packages/opencode-adapter typecheck. Ran serially; both exit 2 because of remaining v1 imports and concurrent workstream errors. Filtering Buddy output to W-G2-owned source/test files yields no findings. Deleted adapter modules have no residual import references.
- bun ./script/check-import-contract.ts: exit 1 with 10 findings, all outside W-G2-owned files. The log is /tmp/wg2-import-contract-complete.txt.
- Broader focused imagegen.test.ts and notes/library-and-capture.test.ts were attempted through the same sandbox command and fail at module load on unmigrated opencode/auth/index and opencode/project/instance imports. No paid generation or live consolidation was attempted.
- Logs: /tmp/wg2-tests-final.txt, /tmp/wg2-lint-complete.txt, /tmp/wg2-route-lint.txt, /tmp/wg2-typecheck-complete.txt, /tmp/wg2-adapter-typecheck.txt, /tmp/wg2-import-contract-complete.txt, /tmp/wg2-blocked-tests.txt.

## Created files

- packages/buddy/src/events/buddy-event-bus.ts
- packages/buddy/src/learning/features/memory/model-generation.ts
- packages/buddy/src/learning/features/memory/structured-output.ts
- packages/buddy/src/project/notebook-files.ts
- packages/buddy/src/project/notebook-file-scan.ts
- packages/buddy/src/project/session-history.ts
- packages/buddy/test/helpers/v2-host.ts
- packages/buddy/test/events/buddy-event-bus.test.ts
- packages/buddy/test/project/notebook-files.test.ts
- packages/buddy/test/project/v2-project-history.test.ts
- packages/buddy/test/learning/memory-structured-output.test.ts
- packages/buddy/test/image-generation/generated-image-storage.test.ts
- packages/buddy/src/learning/personas/prompts/code-system.p.md

## Changed files

- packages/buddy/script/build-node.ts
- packages/buddy/src/learning/features/bench/chat-transcripts.ts
- packages/buddy/src/learning/features/image-generation/service/generated-image.ts
- packages/buddy/src/learning/features/image-generation/service/generated-image-authorization.ts
- packages/buddy/src/learning/features/image-generation/service/image-inputs.ts
- packages/buddy/src/learning/features/lesson-workspace/service/diagnostics.ts
- packages/buddy/src/learning/features/lesson-workspace/tools/write-without-prompt.ts
- packages/buddy/src/learning/features/memory/consolidation.ts
- packages/buddy/src/learning/features/memory/startup.ts
- packages/buddy/src/learning/features/memory/session-extraction.ts
- packages/buddy/src/learning/features/memory/session-source.ts
- packages/buddy/src/learning/features/memory/extractor.ts
- packages/buddy/src/learning/features/memory/models.ts
- packages/buddy/src/learning/features/reading/tools/ingest-full-text.ts
- packages/buddy/src/learning/features/svg-rendering/tools/render-svg.ts
- packages/buddy/src/learning/features/svg-rendering/service/browser-render-requests.ts
- packages/buddy/src/learning/personas/code.ts
- packages/buddy/src/learning/personas/wiring/persona-availability.ts
- packages/buddy/src/learning/prompt/context.ts
- packages/buddy/src/learning/runtime/external-file-authorization.ts
- packages/buddy/src/notes/chat-capture.ts
- packages/buddy/src/notes/session-title-sync.ts
- packages/buddy/src/project/open-project-registry.ts
- packages/buddy/src/project/project-file-editor-service.ts
- packages/buddy/src/project/orchestration/project-operations.ts
- packages/buddy/test/helpers/tmpdir.ts
- packages/buddy/test/learning/external-file-authorization.test.ts
- packages/buddy/test/learning/learner-memory-pipeline.test.ts
- packages/buddy/test/learning/lesson-workspace-write-without-prompt.test.ts
- packages/buddy/test/learning/persona-prompts.test.ts
- packages/buddy/test/image-generation/imagegen.test.ts
- packages/buddy/test/notes/library-and-capture.test.ts
- packages/buddy/test/svg-rendering/render-svg-tool.test.ts
- packages/buddy/test/svg-rendering/auto-repair-route.test.ts
- packages/buddy/src/routes/compatibility.ts
- packages/opencode-adapter/package.json

The shared route changes claimed here are import lines and file endpoint call expressions; concurrent /event implementation edits belong to W-C1. Shared adapter manifest edits remove app-runtime, lsp, file, and system-prompt exports only.

## Deleted files

- packages/opencode-adapter/src/app-runtime.ts
- packages/opencode-adapter/src/lsp.ts
- packages/opencode-adapter/src/file.ts
- packages/opencode-adapter/src/notebook-file-scan.ts
- packages/opencode-adapter/src/system-prompt.ts
- packages/opencode-adapter/test/file.test.ts
- packages/opencode-adapter/test/global-event.test.ts
- packages/opencode-adapter/test/project.test.ts
- packages/buddy/test/opencode-runtime/llm-json-fallback.test.ts

## Retained adapter modules and exact importers

### instance.ts

- packages/buddy/src/config/orchestration/project-config-service.ts:4 (@buddy/opencode-adapter/instance)
- packages/buddy/src/config/runtime/opencode-sync.ts:6 (@buddy/opencode-adapter/instance)
- packages/buddy/src/config/store/config-paths.ts:3 (@buddy/opencode-adapter/instance)
- packages/buddy/src/config/store/write-config.ts:4 (@buddy/opencode-adapter/instance)
- packages/buddy/src/learning/agent-execution/transforms/command-transform.ts:3 (@buddy/opencode-adapter/instance)
- packages/buddy/src/learning/agent-execution/transforms/concise-response-chat-state.ts:2 (@buddy/opencode-adapter/instance)
- packages/buddy/src/learning/agent-execution/transforms/message-transform-orchestration.ts:3 (@buddy/opencode-adapter/instance)
- packages/buddy/src/learning/agent-execution/transforms/subagent-tool-forwarding.ts:3 (@buddy/opencode-adapter/instance)
- packages/buddy/src/learning/skill-management/service/discovery.ts:6 (@buddy/opencode-adapter/instance)
- packages/buddy/src/learning/skill-management/service/library.ts:5 (@buddy/opencode-adapter/instance)
- packages/buddy/src/learning/skill-management/service/mutations.ts:3 (@buddy/opencode-adapter/instance)
- packages/buddy/src/learning/skill-management/service/system-installer.ts:3 (@buddy/opencode-adapter/instance)
- packages/buddy/src/opencode-runtime/plugins/openai-codex-account.ts:3 (@buddy/opencode-adapter/instance)
- packages/buddy/src/opencode-runtime/subagent-forwarding.ts:3 (@buddy/opencode-adapter/instance)
- packages/buddy/src/opencode-runtime/subagent-tool-forwarding-runtime.ts:3 (@buddy/opencode-adapter/instance)
- packages/buddy/src/routes/compatibility.ts:9 (@buddy/opencode-adapter/instance)
- packages/buddy/src/session/orchestration/command-transcript.ts:2 (@buddy/opencode-adapter/instance)
- packages/buddy/src/session/orchestration/interaction-actions.ts:3 (@buddy/opencode-adapter/instance)
- packages/buddy/test/config/opencode-overlay-isolation.test.ts:8 (@buddy/opencode-adapter/instance)
- packages/buddy/test/curriculum/goals-archive.test.ts:3 (@buddy/opencode-adapter/instance)
- packages/buddy/test/curriculum/goals-tools.test.ts:3 (@buddy/opencode-adapter/instance)
- packages/buddy/test/figures/freeform-tools.test.ts:3 (@buddy/opencode-adapter/instance)
- packages/buddy/test/figures/tools.test.ts:3 (@buddy/opencode-adapter/instance)
- packages/buddy/test/flashcard/flashcard-tools-routes.test.ts:5 (@buddy/opencode-adapter/instance)
- packages/buddy/test/helpers/opencode.ts:3 (@buddy/opencode-adapter/instance)
- packages/buddy/test/learning/concise-response-chat-state.test.ts:3 (@buddy/opencode-adapter/instance)
- packages/buddy/test/learning/dynamic-tool-permission-toggle.test.ts:2 (@buddy/opencode-adapter/instance)
- packages/buddy/test/learning/external-file-tool-permissions.test.ts:4 (@buddy/opencode-adapter/instance)
- packages/buddy/test/learning/ingest-full-text-plugin.test.ts:6 (@buddy/opencode-adapter/instance)
- packages/buddy/test/learning/knowledge-graph-tools.test.ts:5 (@buddy/opencode-adapter/instance)
- packages/buddy/test/learning/model-runtime-context.test.ts:3 (@buddy/opencode-adapter/instance)
- packages/buddy/test/learning/pedagogy-tools.test.ts:5 (@buddy/opencode-adapter/instance)
- packages/buddy/test/learning/prompt-resource-references.test.ts:12 (@buddy/opencode-adapter/instance)
- packages/buddy/test/learning/runtime-tool-registration.test.ts:3 (@buddy/opencode-adapter/instance)
- packages/buddy/test/learning/subagent-tool-forwarding.test.ts:4 (@buddy/opencode-adapter/instance)
- packages/buddy/test/learning/tool-schema-compatibility.test.ts:2 (@buddy/opencode-adapter/instance)
- packages/buddy/test/local-runtimes-routes.test.ts:7 (@buddy/opencode-adapter/instance)
- packages/buddy/test/media/present-media.test.ts:5 (@buddy/opencode-adapter/instance)
- packages/buddy/test/mermaid/inline-objects.test.ts:2 (@buddy/opencode-adapter/instance)
- packages/buddy/test/opencode-runtime/provider-model-resolution.test.ts:3 (@buddy/opencode-adapter/instance)
- packages/buddy/test/parity/helpers.ts:1 (@buddy/opencode-adapter/instance)
- packages/buddy/test/presented-media-routes.test.ts:5 (@buddy/opencode-adapter/instance)
- packages/buddy/test/proxy-registration.test.ts:2 (@buddy/opencode-adapter/instance)
- packages/buddy/test/reference-routes.test.ts:4 (@buddy/opencode-adapter/instance)
- packages/buddy/test/session/abort-tools.test.ts:3 (@buddy/opencode-adapter/instance)
- packages/buddy/test/session/command-transcript.test.ts:4 (@buddy/opencode-adapter/instance)
- packages/buddy/test/session/message-route.test.ts:3 (@buddy/opencode-adapter/instance)
- packages/buddy/test/session/session-api-parity.test.ts:3 (@buddy/opencode-adapter/instance)
- packages/buddy/test/skills/tool-visibility.test.ts:2 (@buddy/opencode-adapter/instance)
- packages/buddy/test/skills/upstream-skill-visibility.test.ts:10 (@buddy/opencode-adapter/instance)
- packages/opencode-adapter/src/agent.ts:6 (./instance)
- packages/opencode-adapter/src/effect-runtime.ts:4 (./instance)
- packages/opencode-adapter/src/provider.ts:6 (./instance)
- packages/opencode-adapter/src/registry.ts:13 (./instance)
- packages/opencode-adapter/src/skill.ts:6 (./instance)

### effect-runtime.ts

- packages/opencode-adapter/src/agent.ts:4 (./effect-runtime)
- packages/opencode-adapter/src/auth.ts:4 (./effect-runtime)
- packages/opencode-adapter/src/config.ts:25 (./effect-runtime)
- packages/opencode-adapter/src/llm.ts:8 (./effect-runtime)
- packages/opencode-adapter/src/plugin-live.ts:11 (./effect-runtime)
- packages/opencode-adapter/src/provider-auth.ts:4 (./effect-runtime)
- packages/opencode-adapter/src/provider.ts:4 (./effect-runtime)
- packages/opencode-adapter/src/registry.ts:12 (./effect-runtime)
- packages/opencode-adapter/src/session-live.ts:5 (./effect-runtime)
- packages/opencode-adapter/src/session-prompt.ts:5 (./effect-runtime)
- packages/opencode-adapter/src/session-status.ts:4 (./effect-runtime)
- packages/opencode-adapter/src/session-v2.ts:8 (./effect-runtime)
- packages/opencode-adapter/src/session.ts:4 (./effect-runtime)
- packages/opencode-adapter/src/skill.ts:4 (./effect-runtime)

### llm.ts

- packages/opencode-adapter/src/index.ts:13 (./llm)

### project.ts

- packages/buddy/src/config/opencode/overlay-builder.ts:3 (@buddy/opencode-adapter/project)
- packages/buddy/src/routes/project.ts:4 (@buddy/opencode-adapter/project)
- packages/buddy/test/config/external-directory-permission.test.ts:8 (@buddy/opencode-adapter/project)
- packages/buddy/test/open-project-routes.test.ts:13 (@buddy/opencode-adapter/project)
- packages/opencode-adapter/src/instance.ts:8 (./project)

### global-event.ts

- packages/buddy/src/session/orchestration/interaction-actions.ts:8 (@buddy/opencode-adapter/global-event)
- packages/opencode-adapter/src/index.ts:8 (./global-event)

### global.ts

- packages/buddy/src/config/opencode/overlay-builder.ts:2 (@buddy/opencode-adapter/global)
- packages/buddy/test/config/external-directory-permission.test.ts:6 (@buddy/opencode-adapter/global)
- packages/buddy/test/opencode-runtime-env.test.ts:287 (@buddy/opencode-adapter/global)
- packages/buddy/test/opencode-runtime-env.test.ts:387 (@buddy/opencode-adapter/global)

### storage-db.ts

- packages/buddy/test/opencode-runtime-env.test.ts:289 (@buddy/opencode-adapter/storage-db)
- packages/buddy/test/opencode-runtime-env.test.ts:389 (@buddy/opencode-adapter/storage-db)

### installation.ts

- packages/buddy/src/opencode-runtime/plugins/openai-codex-account.ts:4 (@buddy/opencode-adapter/installation)
