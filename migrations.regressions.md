# PI Migration Manual Regression Findings

Scope: manual changed-file verification (not test-driven) for the migrated backend paths, focused on **main agent loop + transcript/events**.

## First manual set

1. **`/session/:sessionID/command` contract mismatch (critical)**
   - Backend handler now returns async acceptance (`204` via `piPromptAsyncResponse`) in `packages/buddy/src/session/orchestration/interaction-actions.ts`.
   - Route contract still documents `200` with `PiTranscriptEntry` in `packages/buddy/src/routes/session.ts`.
   - Web `sendCommand()` still expects a `200` mutation payload and promotes it in `packages/web/src/state/chat-actions.ts`.

2. **Mermaid auto-repair API effectively removed (critical)**
   - `postSessionMermaidRepairAsync` + `getSessionMermaidRepairStatus` now return `piUnsupportedSessionOperation()` (`501`) in `packages/buddy/src/session/orchestration/interaction-actions.ts`.
   - Route still documents `200` success payloads in `packages/buddy/src/routes/session.ts`.

3. **Session revert/unrevert behavior removed (critical)**
   - `revertSessionById` and `unrevertSessionById` now return `piUnsupportedSessionOperation()` (`501`) in `packages/buddy/src/session/orchestration/core-actions.ts`.
   - Route docs still describe normal `200` success contracts in `packages/buddy/src/routes/session.ts`.

4. **Learner memory startup pipeline appears disconnected (high risk)**
   - Old creation-path orchestration invocation was removed.
   - `runLearnerMemoryStartupPipeline(...)` currently has no runtime callsite in `packages/buddy/src`.

5. **Dynamic tool cleanup-on-session-end appears disconnected (high risk)**
   - Old archive-path cleanup call was removed.
   - `clearDynamicLearningToolsForEndedSession(...)` currently has no runtime callsite in `packages/buddy/src`.

## Deeper pass additions

1. **Command API break confirmed end-to-end (critical)**
   - `session.command` route docs: `200` + payload.
   - Handler behavior: `204` no payload.
   - Web caller behavior: requires `SessionCommandResponses[200]`.
   - Net: command submit path can fail due to response-shape mismatch.

2. **Mermaid repair is still wired in web while backend returns 501 (critical)**
   - Web callsites still active:
     - `packages/web/src/components/chat/tools/render/mermaid/lib/persisted-renders.ts` (`session.mermaidRepairAsync`, `session.mermaidRepairStatus`).
   - Backend handlers now return unsupported (`501`).
   - Route docs still advertise success payloads.

3. **Undo/revert is still wired in web while backend returns 501 (critical)**
   - Web callsites still active:
     - `packages/web/src/state/chat-actions.ts` (`session.revert`, `session.unrevert`).
   - Backend actions now return unsupported (`501`).
   - Route docs still advertise success payloads.

4. **API contract drift in session routes (high risk)**
   - Multiple route definitions still describe old success responses where handlers now return unsupported or different statuses.
   - This introduces SDK/schema drift risk for clients generated from route contracts.

5. **Orchestration side-effect removals with feature impact risk (high risk)**
   - Memory startup and dynamic-tool cleanup side effects were removed from session orchestration without equivalent visible replacement in current runtime call graph.

## Notes

- These findings are from manual changed-file verification and call-graph checks.
- They are migration regressions/risks unless intentionally accepted product scope reductions are made explicit in API contracts and UI behavior.

---

## Skills feature — manual changed-file regression audit

Scope: `config/skills`, `skill-management/service/*`, skills-related runtime/config sync glue, and related test deltas.

1. **Skill duplication path risk introduced by path resolution changes (high risk)**
   - `resolveBuddySkillPaths(...)` now appends both managed installed system roots and source bundled feature roots (`packages/buddy/src/config/skills/paths.ts`).
   - In practice this can load the same skill names from multiple roots (seen as duplicate-skill warnings), causing non-deterministic source precedence and noisy runtime behavior.

2. **External vendor skill-root toggle appears evaluated from global config at runtime loader level (high risk)**
   - `createBuddyPiResourceLoader(...)` filters visible skills using `Config.getGlobal().skills_external_vendor_roots_enabled` (`packages/buddy/src/pi-backend/host.ts`).
   - Skill path resolution is based on project config (`resolveBuddySkillPaths(config, directory)`), creating a potential global-vs-project mismatch where project-level intent can be overridden by global filtering.

3. **`session.command` and unsupported-operation drift still impacts skill-driven slash workflows (critical carryover)**
   - Skills that trigger slash-command flows are affected by the command route response-shape mismatch documented above (route contract vs handler behavior).
   - This is a cross-feature regression but materially impacts skill execution UX.

4. **Upstream-skill visibility regression coverage was removed (high risk)**
   - `packages/buddy/test/skills/upstream-skill-visibility.test.ts` was deleted.
   - That removed explicit guard coverage for hidden/suppressed upstream skill behavior and user-defined override visibility.

5. **Refresh semantics in discovery API are now effectively collapsed (medium risk)**
   - `loadVisibleSkills(directory, options)` accepts `refresh` but currently always builds a fresh PI resource loader path without behavior branching in discovery.
   - This may be intentional, but if callers depended on previous cache/refresh semantics, behavior/performance can drift.

---

## Dynamic tools feature — manual changed-file regression audit

Scope: dynamic tool grant/discovery/permission flow, runtime tool sync, and subagent tool forwarding behavior.

1. **Subagent forwarding can over-allow tools when `parentUserTools` is absent (critical)**
   - In `resolveSubagentToolForwarding(...)`, parent-agent inheritance path now computes:
     - `allToolIDs.filter((toolID) => context.parentUserTools?.[toolID] !== false)`
   - If `parentUserTools` is `undefined` (common), condition is true for all tools, so subagents can inherit the full tool set unexpectedly.
   - This is a capability/safety regression risk, including unintended dynamic-tool availability.

2. **Runtime session permission sync logic was reduced to active-session tool-name refresh only (high risk)**
   - `syncBuddyRuntimeSessionPermissions(...)` now just calls `piRuntime.syncSessionRuntimeTools(...)`.
   - Prior logic that reconciled full permission ruleset state into runtime session permissions was removed.
   - If a session is not currently active, sync may be skipped silently and rely on later activation behavior.

3. **Dynamic-tool grant path now hard-depends on teaching session state presence (high risk)**
   - `syncDynamicLearningToolSessionRuntime(...)` early-returns `false` when `readTeachingSessionState(...).sessionRuntime` is missing.
   - In that case, `grantDynamicLearningToolsForSession(...)` drops grants (`[]`), so tool loading can fail for sessions lacking seeded runtime state.

4. **Dynamic tool registration functions are now no-ops (medium risk)**
   - `registerBuddyTools(...)` and `unregisterBuddyTools(...)` are empty.
   - This can be valid only if all dynamic tools are always pre-registered as custom tools and activation is strictly name-gated; otherwise, dynamic load/unload semantics can drift.

5. **Major forwarding regression test coverage was removed (high risk)**
   - `packages/buddy/test/learning/subagent-tool-forwarding.test.ts` (large coverage file) was deleted.
   - Replacement coverage in `packages/buddy/test/pi-backend/subagents.test.ts` is narrower and does not cover the `parentUserTools` absent over-allow case above.

---

## Subagents feature — manual changed-file regression audit

Scope: subagent delegation entrypoint (`task` tool), runtime subagent session creation/linking, and forwarding policy behavior.

1. **Parent-user forwarding logic can over-grant subagent tools (critical)**
   - In `resolveSubagentToolForwarding(...)`, parent-user inheritance can default to effectively “all tools” when prompt-level tool overrides are absent.
   - This is a direct subagent capability regression/safety issue.

2. **Forwarding policy model was simplified with reduced guardrails (high risk)**
   - Previous OpenCode permission-merge-based gating was removed from forwarding logic.
   - New behavior is mainly runtime-state/tool-override driven, with fewer explicit deny/merge constraints from prior session permission state.
   - This can change subagent tool visibility in edge cases (especially inherited parent-agent sessions).

3. **Legacy subagent forwarding runtime/tests were removed (high risk)**
   - Removed:
     - `packages/buddy/src/opencode-runtime/subagent-tool-forwarding-runtime.ts`
     - `packages/buddy/src/opencode-runtime/task-tool-forwarding.ts`
     - `packages/buddy/test/learning/subagent-tool-forwarding.test.ts`
   - Replacement tests are much smaller and do not cover many former policy edge cases.

4. **Subagent UX depends on backend metadata/session-link integrity with less exhaustive coverage (medium risk)**
   - Web task cards now rely on task metadata (`sessionId`, `agent`, `description`) and open-child-session flows.
   - Backend provides these via PI task tool updates, but regression coverage for sidebar/session-link visibility is currently limited.

5. **Carryover impact from command-route contract drift (high risk)**
   - Since delegation pathways share session/task orchestration surfaces, existing contract drift in session mutation responses can cascade into subagent UX/tooling behavior.

---

## Tool execution + permissions — manual changed-file regression audit

Scope: PI tool-definition runtime, OpenCode tool bridge execution, permission request/reply plumbing, and permission/question routes.

1. **Tool metadata title propagation appears dropped in PI tool wrapper (high risk)**
   - In `create-buddy-tool.ts`, `BuddyToolExecuteResult` supports `title`, but `toPiToolResult(...)` only forwards `output` and `metadata`.
   - `ctx.metadata(...)` updates also forward only `metadata` payload and ignore `title`.
   - Tools that relied on runtime title updates can lose UI labeling context.

2. **Directory-scoped “always allow” cache keying is inconsistent across permission paths (medium risk)**
   - `pi-backend/opencode-tool-bridge.ts` normalizes directory keys (`realpath`) for approval cache.
   - `pi-backend/permissions.ts` uses raw directory strings for approval cache keying.
   - Different path spellings/symlink paths can fragment approvals and produce inconsistent permission behavior.

3. **Permission ask/reply flow is now fully in-memory and process-scoped (medium risk)**
   - Pending question/permission requests and allow-always approvals are kept in memory maps.
   - Any runtime disposal/restart clears pending state and approvals.
   - This may be acceptable by design, but it changes durability expectations versus persisted flows.

4. **OpenCode-bridge permission semantics and PI-native permission semantics now run in parallel systems (high risk)**
   - PI-native tools use `requestBuddyToolPermission(...)`.
   - Bridged OpenCode tools use separate `askOpenCodePermission(...)` logic and ruleset source.
   - Divergence risk exists unless parity is continuously validated (deny/allow/always, metadata, pattern semantics).

5. **Route-layer contracts changed from proxy passthrough to local request stores; compatibility now depends on exact directory normalization and request-ID lifecycle (medium risk)**
   - `routes/permission.ts` and `routes/question.ts` now query local pending maps and can return `404` for stale/mismatched IDs.
   - This is correct behavior, but clients that assumed old proxy semantics can regress if request lifecycle handling is not aligned.
