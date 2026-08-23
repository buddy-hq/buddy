# Dynamic Tool Addition Plan

Implementation-ready plan to add production dynamic learning tools after Buddy's runtime intent removal is complete.

Do not execute this plan in parallel with `docs/artifacts/plans/intent-removal-plan.md`. This plan assumes runtime `Intent` no longer exists in Buddy's UI, API, session state, learner snapshot query, prompt context, capability profile, or permission compiler.

Reference handoff and smoke-test findings: `docs/artifacts/plans/intent-dynamic-tool-migration-notes.md`.

## Target End State

Buddy has two static tool-discovery capabilities that the model can call when it needs a learning capability that should not be permanently exposed:

- `learning_tool_search`: pure discovery over deferred dynamic tool metadata
- `learning_tool_load`: explicit session-scoped exposure for exact IDs returned by the latest search

Dynamic learning tools are:

- returned as candidates by `learning_tool_search`
- registered only after `learning_tool_load` exposes exact returned IDs
- named under a single namespace
- hidden from the model by default
- allowed only by exact session-scoped grants
- cleared before the next Buddy turn for that session
- searchable through structured catalog metadata
- guided by pedagogy skills instead of runtime intent

Persona, workspace state, runtime readiness, and user tool config remain hard constraints.

## Prerequisites

Do not start until the intent-removal final audit passes:

```sh
rg -n "\bIntent\b|\bINTENTS\b|\bisIntent\b|defaultIntent|default_intent|TeachingIntent|intentFromSelection|selectedIntentBySession|setSessionIntent|resolveIntent|resolveIntentPermissions|getIntentPrompt|student_intent" packages/buddy/src packages/buddy/test packages/web/src packages/web/test docs/guides --glob '!packages/sdk/src/gen/**' --glob '!packages/web/src/routeTree.gen.ts'
bun fmt
bun lint
bun typecheck
```

Allowed remaining lower-case `intent` hits must be only learner-model free-text interpretation or ordinary prose.

## Non-Goals

- Do not reintroduce runtime `learn/practice/assess/auto`.
- Do not make dynamic tools visible by relying on `ask` permission.
- Do not patch `vendor/opencode`.
- Do not make directory-scoped registry visibility the safety boundary.
- Do not grant a wildcard session allow for the dynamic namespace.
- Do not put production dynamic tools in `allLearningToolIds()`.
- Do not remove static production tools until their dynamic replacement has tests and prompt guidance.

## Design Decisions

### Namespace

Use this dynamic tool namespace:

```text
learning_dynamic_*
```

Use this concrete ID prefix:

```text
learning_dynamic_
```

`learning_tool_search` and `learning_tool_load` stay outside the dynamic namespace because they are static discovery/exposure tools. If either tool is renamed later, it must still not match `learning_dynamic_*`.

### Visibility Boundary

The registry is directory-scoped. That is acceptable only if model visibility is controlled by permissions.

The model visibility rule is:

```text
default deny learning_dynamic_* for every Buddy session
search records candidate dynamic tool IDs for that session
load appends exact allow rules for selected candidate dynamic tool IDs
next Buddy turn removes exact dynamic allows and restores namespace deny
```

OpenCode merges agent permissions first and session permissions second. It evaluates the last matching rule. Therefore an exact session allow appended after the namespace deny makes one dynamic tool visible without opening the whole namespace.

### Grant Lifetime

Dynamic grants last until the next Buddy turn in the same session.

Do not clear a dynamic grant immediately after `learning_tool_load` returns; the model still needs the next loop iteration in the same assistant turn to call the registered tool.

At the start of the next Buddy message or command transform, remove stale exact dynamic allows for that session and keep the namespace deny.

### Catalog Boundary

Static learning tools stay in `tool-metadata.ts` and `allLearningToolIds()`.

Dynamic learning tools live in a separate dynamic catalog. They are not listed in `allLearningToolIds()` because static persona permission derivation must not advertise tools that should be loaded dynamically.

## Preflight Inventory

Run these commands before implementation:

```sh
git status --short
rg -n "learning_tool_search|learning_smoke|SMOKE_|dynamic-tool|dynamicTool|toolDiscovery|registerBuddyTools|ToolRegistry|PermissionNext.disabled|PRIMARY_PERSONA_PERMISSION" packages/buddy/src packages/buddy/test packages/opencode-adapter/src docs/plans --glob '!packages/sdk/src/gen/**'
rg -n "permission:|defineBuddySubagent|createPrimaryAgent|createSubagent|BUDDY_SUBAGENTS|REGISTERED_BUDDY_PERSONAS" packages/buddy/src/learning -g '*.ts'
rg -n "registerTool\\(|renderBuddyCustomTool|renderGenericTool" packages/web/src/components/chat/tools
```

Classify every hit into one of these buckets:

| Bucket | Expected action |
|---|---|
| Static discovery tool | Keep and productionize |
| Smoke dynamic tools | Rename, isolate to tests, or delete |
| Dynamic namespace constants | Consolidate |
| Session permission grants | Move into shared dynamic permission module |
| Primary persona denies | Replace with shared namespace deny policy |
| Subagent permissions | Add shared namespace deny policy |
| Tool registry directory scope | Keep, but do not rely on it for visibility |
| Frontend tool renderers | Add aliases only for dynamic tools that need custom rendering |

## Phase 0: Rebase The Smoke Test After Intent Removal

Goal: make the current smoke-test code compile against the post-intent baseline before productionizing it.

### Ordered Checklist

1. Rebase onto the completed intent-removal branch.
2. Run the preflight inventory.
3. Confirm `learning_tool_search` is still statically registered through the `toolDiscovery` group.
4. Confirm the search tool is persona/workspace gated by the simplified persona-level permission system.
5. Confirm no dynamic-tool file imports removed runtime intent types.
6. Confirm `packages/buddy/test/learning/runtime-tool-registration.test.ts` still tests dynamic registration.
7. Update smoke tests only enough to pass after intent removal.

### Phase 0 Exit Checks

```sh
rg -n "\bIntent\b|\bINTENTS\b|resolveIntent|default_intent|student_intent" packages/buddy/src/learning/tools packages/buddy/test/learning/runtime-tool-registration.test.ts
bun test packages/buddy/test/learning/runtime-tool-registration.test.ts
bun fmt
bun lint
bun typecheck
```

Expected result: the `rg` command returns no runtime-intent hits.

### Phase 0 Traps

Do not start renaming IDs or moving tools in this phase. First prove the smoke test still works after intent removal.

## Phase 1: Add Dynamic Namespace And Permission Policy

Goal: make dynamic tool visibility safe before adding production dynamic tools.

### Ordered Checklist

1. Add `packages/buddy/src/learning/tools/dynamic-learning-tool-namespace.ts`.
2. Export `DYNAMIC_LEARNING_TOOL_ID_PREFIX = "learning_dynamic_"`.
3. Export `DYNAMIC_LEARNING_TOOL_PERMISSION = "learning_dynamic_*"`.
4. Export `isDynamicLearningToolID(value: string): boolean`.
5. Export `assertDynamicLearningToolID(value: string): void`.
6. Add `packages/buddy/src/learning/tools/dynamic-learning-tool-permissions.ts`.
7. Export a helper that returns the namespace deny permission input for authored agents.
8. Export helpers that identify dynamic session permission rules.
9. Export helpers that remove exact dynamic session allows while preserving unrelated user permissions.
10. Update `packages/buddy/src/learning/agent-factories.ts` so Buddy primary agents and Buddy subagents receive the namespace deny by default.
11. Keep explicit tool permissions authored by agents, but make the dynamic namespace deny part of the base Buddy agent permission preset.
12. Update primary persona runtime permissions to stop importing smoke IDs and stop denying exact smoke IDs.
13. Update `packages/buddy/src/learning/agent-execution/permissions/session-permissions.ts` so every Buddy-managed session gets a `learning_dynamic_*` deny rule.
14. Ensure the dynamic namespace deny is treated as Buddy-managed, so permission sync can replace stale dynamic rules deterministically.
15. Keep search-tool session allows exact. Never append `{ permission: "learning_dynamic_*", action: "allow" }`.

### Required Permission Order

At the start of a Buddy turn, session permissions must end in a namespace deny and contain no stale exact dynamic allows:

```ts
{ permission: "learning_dynamic_*", pattern: "*", action: "deny" }
```

After `learning_tool_search` grants one tool, the session permissions must append this exact allow after the namespace deny:

```ts
{ permission: "learning_dynamic_pedagogy_reflection", pattern: "*", action: "allow" }
```

The exact allow must not replace the namespace deny.

### Phase 1 Tests

Add or update tests in `packages/buddy/test/learning/runtime-tool-registration.test.ts`:

```text
namespace deny hides learning_dynamic_* from model tool filtering
exact session allow overrides namespace deny for that one tool
namespace deny still hides other learning_dynamic_* tools
Buddy primary personas include the namespace deny
Buddy subagents include the namespace deny
search tool never appends a namespace allow
```

### Phase 1 Exit Checks

```sh
rg -n "SMOKE_|learning_smoke|SMOKE_PRACTICE_TOOL_ID|SMOKE_ASSESSMENT_TOOL_ID" packages/buddy/src
rg -n "learning_dynamic_\\*" packages/buddy/src packages/buddy/test
bun test packages/buddy/test/learning/runtime-tool-registration.test.ts
bun fmt
bun lint
bun typecheck
```

Expected result: no production source imports smoke-specific IDs. The namespace appears only in the shared namespace/permission modules and tests.

### Phase 1 Traps

Do not rely only on primary persona runtime permissions. The confirmed gap is subagents.

Do not rely only on agent permissions. Session-level namespace deny is needed so non-primary paths in the same Buddy session also hide dynamic tools.

Do not use exact denies for every dynamic tool ID. That fails when new catalog entries are added.

## Phase 2: Add Dynamic Grant Lifecycle Management

Goal: make dynamic session grants deterministic and self-cleaning.

### Ordered Checklist

1. Add `packages/buddy/src/learning/tools/dynamic-learning-tool-grants.ts`.
2. Move session allow appending out of `dynamic-tool-search.ts` into this module.
3. Export `grantDynamicLearningToolsForSession(input)`.
4. Export `clearDynamicLearningToolGrantsForSession(input)`.
5. Export `clearAllDynamicLearningToolGrantsForDirectory(input)` only if tests need directory cleanup.
6. Track active grants in memory by realpath directory, session ID, message ID, and tool ID.
7. When granting, register the tool, append exact session allow rules, and dedupe existing exact allow rules.
8. When clearing a session, remove exact dynamic allow rules from that session.
9. When clearing a session, decrement in-memory references for each dynamic tool.
10. When no session in that directory references a dynamic tool, unregister it from the directory-scoped registry.
11. Call `clearDynamicLearningToolGrantsForSession()` at the start of Buddy message transforms before `syncBuddyRuntimeSessionPermissions()`.
12. Call `clearDynamicLearningToolGrantsForSession()` at the start of Buddy command transforms before `syncBuddyRuntimeSessionPermissions()`.
13. Do not clear grants at the end of the same assistant turn.
14. Keep stale registry cleanup best-effort. Permission cleanup is the correctness boundary.

### Required Lifecycle

```text
new user turn starts
clear exact dynamic allows for this session
sync static Buddy permissions and namespace deny
model calls learning_tool_search
search records matched dynamic tool IDs as load candidates
OpenCode continues same assistant turn
model calls learning_tool_load with exact returned IDs
load registers selected dynamic tools
load appends exact session allows
OpenCode continues same assistant turn
next model loop can see exact allowed tools
next user turn starts
exact dynamic allows are cleared
unreferenced dynamic tools are unregistered
```

### Phase 2 Tests

Add or update tests in `packages/buddy/test/learning/runtime-tool-registration.test.ts`:

```text
search returns candidates without registering dynamic tools
load appends exact dynamic allow after namespace deny
second load for same tool does not duplicate session allow
next Buddy permission sync removes stale exact dynamic allows
next Buddy permission sync keeps namespace deny
clearing one session does not unregister a tool still granted to another session
clearing last session unregisters the dynamic tool from the directory registry
directory registry visibility is not treated as model visibility
```

### Phase 2 Exit Checks

```sh
rg -n "Session.setPermission|registerBuddyTools\\(|unregisterBuddyTools\\(" packages/buddy/src/learning/tools
rg -n "learning_dynamic_\\*" packages/buddy/src/learning/agent-execution packages/buddy/src/learning/tools packages/buddy/test/learning/runtime-tool-registration.test.ts
bun test packages/buddy/test/learning/runtime-tool-registration.test.ts
bun fmt
bun lint
bun typecheck
```

Expected result: direct session permission mutation for dynamic grants is centralized in `dynamic-learning-tool-grants.ts`.

### Phase 2 Traps

Do not unregister directory-scoped dynamic tools blindly at the start of any turn. Another session in the same directory may still have an active grant.

Do not sort session permission rules after appending exact dynamic allows unless the sort preserves last-match semantics. Permission order is behavior.

Do not remove unrelated user session permissions while clearing dynamic grants.

## Phase 3: Replace Smoke Search With A Structured Dynamic Catalog

Goal: make dynamic search production-ready and metadata-driven.

### Ordered Checklist

1. Add `packages/buddy/src/learning/tools/dynamic-learning-tool-catalog.ts`.
2. Define `DynamicLearningToolCatalogEntry` as a `type`, not an interface.
3. Include fields for ID, title, description, search text, keywords, pedagogy use case, persona compatibility, workspace states, runtime dependencies, side effects, learner-state mutation, UI renderer needs, and tool factory.
4. Add a zod schema for catalog metadata that can be serialized in search results.
5. Add `packages/buddy/src/learning/tools/dynamic-learning-tool-search.ts`.
6. Move query tokenization and scoring into the new search module.
7. Keep a small deterministic scorer first. Do not introduce embeddings or network search in this phase.
8. Filter catalog entries by current persona.
9. Filter catalog entries by current workspace state.
10. Filter catalog entries by runtime dependency readiness.
11. Filter catalog entries by project config tool toggles.
12. Support exact dynamic tool ID search.
13. Support capability keyword search.
14. Return ranked matches with reasons.
15. Register and grant only selected matches.
16. Cap automatic registration to a small constant such as `MAX_DYNAMIC_TOOL_MATCHES_TO_REGISTER = 3`.
17. Replace smoke-only `SEARCHABLE_DYNAMIC_LEARNING_TOOLS`.
18. Move smoke tools into test fixtures or delete them after production catalog tests exist.

### Required Config Behavior

Existing `Config.Info["tools"]` is a string-to-boolean map, so dynamic search must honor both exact dynamic IDs and the namespace key:

```json
{
  "tools": {
    "learning_dynamic_pedagogy_reflection": false,
    "learning_dynamic_*": false
  }
}
```

If the namespace key is `false`, no dynamic learning tool should be searchable or granted.

### Required Search Output

The search tool output must tell the model:

```text
which tools were registered
why they matched
which tools were filtered out only if useful
that the tools are available on the next model loop iteration
that no tool was registered when there are no matches
```

Do not expose a raw dump of the whole catalog in normal output.

### Phase 3 Tests

Add or update tests in `packages/buddy/test/learning/runtime-tool-registration.test.ts` and a new catalog-focused test file if needed:

```text
query by exact dynamic ID finds one tool
query by keyword ranks expected tool first
persona filter excludes incompatible tools
workspace filter excludes interactive-only tools in chat state
runtime dependency filter excludes unavailable tools
project config exact false excludes one dynamic tool
project config namespace false excludes all dynamic tools
search returns no more than MAX_DYNAMIC_TOOL_MATCHES_TO_REGISTER candidates
search output includes match reasons but not raw catalog dumps
```

### Phase 3 Exit Checks

```sh
rg -n "SEARCHABLE_DYNAMIC_LEARNING_TOOLS|learning_smoke|smokeTest|No dynamic learning tools matched" packages/buddy/src
rg -n "DynamicLearningToolCatalogEntry|MAX_DYNAMIC_TOOL_MATCHES_TO_REGISTER|learning_dynamic_" packages/buddy/src/learning/tools packages/buddy/test/learning
bun test packages/buddy/test/learning/runtime-tool-registration.test.ts
bun fmt
bun lint
bun typecheck
```

Expected result: smoke-only production catalog code is gone or isolated to tests.

### Phase 3 Traps

Do not make search depend on removed runtime intent.

Do not put catalog entries in `tool-metadata.ts`.

Do not add magic strings for pedagogy use cases. Define literal unions or constants.

## Phase 4: Add The First Production Dynamic Tool Slice

Goal: prove one real Buddy learning capability works dynamically before migrating larger tool families.

Use `pedagogy_reflection` as the first production slice because it is low-risk, text-oriented, and does not require a custom frontend renderer.

### Ordered Checklist

1. Refactor `packages/buddy/src/learning/capabilities/pedagogy/tools/definitions/reflection.ts` so the implementation can be created with a caller-provided tool ID.
2. Keep the existing static `pedagogy_reflection` export unchanged during the first slice.
3. Add dynamic ID `learning_dynamic_pedagogy_reflection`.
4. Add a catalog entry for `learning_dynamic_pedagogy_reflection`.
5. Reuse the existing reflection implementation; do not duplicate business logic.
6. Mark the catalog entry as text/generic-renderer compatible.
7. Add search keywords for reflection, metacognition, explain reasoning, summarize learning, and misconception repair.
8. Add persona compatibility for personas that should be able to use reflection.
9. Add workspace-state compatibility.
10. Honor configured tool toggles for both the exact dynamic ID and namespace key.
11. Add a test that search returns `learning_dynamic_pedagogy_reflection` without registering it.
12. Add a test that load registers and grants `learning_dynamic_pedagogy_reflection`.
13. Add a test that executing the dynamic reflection tool returns the same essential metadata shape as the static tool.
14. Add a test that a session without load cannot see the dynamic reflection tool in model filtering.

### Static-To-Dynamic Migration Rule

For the first production slice, keep the static tool available until all dynamic infrastructure tests pass.

Only after that:

1. Remove the static tool from persona default allowances if the dynamic path should own that capability.
2. Keep the static implementation file if other code still imports it.
3. Remove the static metadata entry only if the static tool is no longer registered anywhere.
4. Add frontend renderer aliases only if the dynamic tool produces UI that needs a custom renderer.

### Phase 4 Tests

```sh
bun test packages/buddy/test/learning/runtime-tool-registration.test.ts
bun test packages/buddy/test/learning/pedagogy-tools.test.ts
bun test packages/buddy/test/learning/tool-permission-compiler.test.ts
bun fmt
bun lint
bun typecheck
```

### Phase 4 Traps

Do not create a second copy of reflection logic under the dynamic ID. Extract a factory.

Do not migrate multiple tool families in the first production slice.

Do not remove static permissions before the dynamic path has search, permission, execution, and prompt tests.

## Phase 5: Wire Skills And Always-Visible Guidance

Goal: make the model reliably choose skills and then use dynamic search without runtime intent.

A skill can only teach dynamic search after it is loaded. Therefore skill selection guidance must exist outside the skill too.

### Ordered Checklist

1. Update the always-visible Buddy learning prompt text after intent removal.
2. Tell the model when to load pedagogy skills based on the learner's request and conversation state.
3. Do not mention runtime intent modes.
4. Update pedagogy skill descriptions so the model can choose them without `learn/practice/assess/auto`.
5. In `buddy-pedagogy-learn/SKILL.md`, explain when to call `learning_tool_search`.
6. In `buddy-pedagogy-practice/SKILL.md`, explain when to call `learning_tool_search`.
7. In `buddy-pedagogy-assess/SKILL.md`, explain when to call `learning_tool_search`.
8. Include exact search-query examples that match catalog metadata.
9. In each skill, tell the model to call dynamic tools only after search reports that they were registered.
10. In each skill, tell the model not to call dynamic tools from memory if search did not return them.
11. Update prompt tests to assert search guidance exists where expected and runtime intent wording does not return.

### Required Prompt Contract

Always-visible prompt guidance should be short:

```text
When the learner needs a specialized teaching move, load the relevant pedagogy skill. If that skill calls for a tool that is not currently available, use learning_tool_search to load a matching dynamic learning tool.
```

Skill-level guidance can be detailed:

```text
Search examples:
- "reflection metacognition misconception repair"
- "practice targeted drill guided hint"
- "assessment mastery retrieval check"
```

### Phase 5 Tests

```sh
bun test packages/buddy/test/prompts/assemblies.test.ts
bun test packages/buddy/test/prompts/compose-system-prompt-goals.test.ts
bun test packages/buddy/test/learning/prompt-resource-references.test.ts
bun fmt
bun lint
bun typecheck
```

### Phase 5 Traps

Do not hide all routing guidance inside skills. The model cannot follow guidance in a skill before choosing that skill.

Do not recreate runtime intent as prompt variables. Use ordinary pedagogical language.

## Phase 6: Migrate More Tools Incrementally

Goal: move selected static pedagogy tools to dynamic loading only after the first production slice is proven.

### Migration Order

Use this order unless a concrete product need changes it:

| Order | Candidate | Reason |
|---|---|---|
| 1 | `learning_dynamic_pedagogy_reflection` | Low-risk text tool |
| 2 | `learning_dynamic_pedagogy_debug_attempt` | Similar orchestration shape |
| 3 | `learning_dynamic_pedagogy_stepwise_solve` | Higher model-dependence, still text-oriented |
| 4 | Dynamic practice helpers | Requires stronger skill guidance |
| 5 | Dynamic assessment helpers | Requires careful learner-state recording |
| 6 | Dynamic resource helpers | May interact with prepared full text and UI expectations |
| 7 | Dynamic figure/question-set tools | Needs frontend renderer aliases and artifact validation |

### Per-Tool Checklist

For each migrated tool:

1. Choose a stable `learning_dynamic_*` ID.
2. Add or reuse an implementation factory.
3. Add catalog metadata.
4. Add search keywords.
5. Add persona constraints.
6. Add workspace-state constraints.
7. Add runtime dependency constraints.
8. Add config toggle tests.
9. Add search registration tests.
10. Add model-visibility permission tests.
11. Add execution tests.
12. Add frontend renderer alias if the output is not acceptable with the generic renderer.
13. Remove static persona allowance only after the dynamic path passes.
14. Remove static registration only when no remaining path needs the old static ID.

### Phase 6 Exit Checks

```sh
rg -n "learning_dynamic_" packages/buddy/src packages/buddy/test packages/web/src
bun test packages/buddy/test/learning/runtime-tool-registration.test.ts
bun test packages/buddy/test/learning/pedagogy-tools.test.ts
bun test packages/buddy/test/learning/tool-permission-compiler.test.ts
bun test packages/web/test/chat-actions.test.ts
bun fmt
bun lint
bun typecheck
```

### Phase 6 Traps

Do not migrate a tool with a custom UI renderer without adding a dynamic renderer alias.

Do not migrate learner-state mutation tools without tests proving they still record state exactly once.

Do not leave both static and dynamic versions allowed indefinitely unless there is a deliberate product reason.

## Phase 7: Observability And Manual Smoke

Goal: make dynamic behavior inspectable and verify it works in a real Buddy session.

### Ordered Checklist

1. Add structured metadata to `learning_tool_search` results: query, matched candidate IDs, filtered IDs, reasons, and next tool.
2. Add structured metadata to `learning_tool_load` results: requested IDs, rejected IDs, registered IDs, filtered IDs, and grant scope.
3. Add lightweight logs for dynamic registration, grant, clear, and unregister.
4. Do not log learner content beyond the search query.
5. Add devtools/debug display only if useful; otherwise keep backend logs and tool output enough for now.
6. Add manual smoke instructions to this document after the first production dynamic tool lands.

### Manual Smoke

Run these checks in a real Buddy session:

```text
Start backend and web frontend.
Open a project.
Use a Buddy persona.
Ask for a reflection-style teaching move.
Confirm the model loads the relevant pedagogy skill.
Confirm the model calls learning_tool_search.
Confirm search returns learning_dynamic_pedagogy_reflection as a candidate but does not register it.
Confirm the model calls learning_tool_load with the exact returned ID.
Confirm load registers learning_dynamic_pedagogy_reflection.
Confirm the next model loop can call learning_dynamic_pedagogy_reflection.
Send another user message in the same session.
Confirm stale exact dynamic allows are cleared before the next turn.
Open another session in the same directory.
Confirm the dynamic tool may be registry-visible but is not model-visible without a session allow.
Delegate to a Buddy subagent if applicable.
Confirm the subagent does not see ungranted learning_dynamic_* tools.
```

Expected results:

```text
No runtime intent appears anywhere.
learning_tool_search is visible only when persona/workspace permissions allow it.
Dynamic tools are hidden before search.
Search returns candidates but does not grant or register dynamic tools.
Load grants exact tool IDs, not the namespace.
Granted tools are visible on the next model loop.
Stale grants disappear on the next Buddy turn.
Directory-scoped registry leakage does not become model visibility.
Subagents inherit the dynamic namespace deny.
```

## Final Test Gate

Run these before calling the dynamic tool addition production-ready:

```sh
bun test packages/buddy/test/learning/runtime-tool-registration.test.ts
bun test packages/buddy/test/learning/pedagogy-tools.test.ts
bun test packages/buddy/test/learning/tool-permission-compiler.test.ts
bun test packages/buddy/test/learning/runtime-session-permissions.test.ts
bun test packages/buddy/test/prompts/assemblies.test.ts
bun test packages/buddy/test/prompts/compose-system-prompt-goals.test.ts
bun test packages/web/test/chat-actions.test.ts
bun fmt
bun lint
bun typecheck
```

## Final Audit

```sh
rg -n "learning_smoke|SMOKE_|smokeTest" packages/buddy/src packages/web/src
rg -n "learning_dynamic_\\*" packages/buddy/src packages/buddy/test packages/web/src
rg -n "resolveIntent|default_intent|student_intent|\\bINTENTS\\b|TeachingIntent" packages/buddy/src packages/web/src
```

Expected final state:

```text
No production smoke tool IDs remain.
The dynamic namespace appears in shared policy, tests, and exact dynamic tool IDs only.
No runtime intent concept returns.
Dynamic tool IDs are not listed in allLearningToolIds().
learning_tool_search is static and gated by persona/workspace/config.
Production dynamic tools are searchable, grantable, executable, and cleaned up.
```

## Suggested PR Shape

| PR | Scope |
|---|---|
| PR 1 | Phase 0-1: post-intent smoke rebase, namespace constants, permission policy |
| PR 2 | Phase 2: grant lifecycle and cleanup |
| PR 3 | Phase 3: structured catalog/search, remove production smoke code |
| PR 4 | Phase 4-5: first production dynamic tool plus skill/prompt guidance |
| PR 5+ | Phase 6: migrate additional tool families one at a time |
