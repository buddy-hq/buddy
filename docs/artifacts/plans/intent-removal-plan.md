# Intent Removal Plan

Implementation-ready plan to remove Buddy's runtime `Intent` concept without mixing in the later dynamic-tool migration.

This plan is intentionally linear. Do not implement dynamic tool discovery, dynamic tool registration, dynamic tool permissions, or dynamic tool lifecycle cleanup while executing this plan. The dynamic-tool follow-up is documented separately in `docs/plans/intent-dynamic-tool-migration-notes.md`.

## Target End State

Buddy no longer has a runtime teaching intent enum. No UI, API route, project config, prompt context, learner snapshot query, capability profile, tool permission compiler, session state, or persona definition selects `learn`, `practice`, `assess`, or `auto`.

Pedagogy behavior remains available through persona-level tools, persona-level skills, workspace state, runtime readiness, and user-configured tool toggles.

The learner-model decision field named `"intent"` stays for now. That field is free-text learner interpretation, not Buddy's removed runtime `Intent` enum.

## Non-Goals

- Do not add dynamic tools.
- Do not require dynamic tools for any phase in this plan.
- Do not rewrite the OpenCode vendor.
- Do not remove unrelated English prose that uses the word "intent" to mean ordinary user intention.
- Do not remove `InterpretMessageDecisionSchema.intent` unless a separate learner-model refactor explicitly does that later.
- Do not keep a compatibility alias for runtime `Intent`; delete the concept instead.

## Execution Rules

Work one phase at a time. A phase is not complete until its exit checks pass.

Use `rg` before editing each phase to confirm the current references, then run the phase-specific `rg` checks after editing.

Never run the full test suite. Run only the listed package tests plus `bun fmt`, `bun lint`, and `bun typecheck`.

Use `bun run sdk:generate` only in the backend API phase after route schemas change.

Keep temporary payload scrubbers only while an external route can still accept stale `intent`. Remove the scrubber in the same phase that removes the route field.

If a phase uncovers a new runtime dependency on intent, update this plan before coding around it. Do not add a hidden fallback.

## Preflight Inventory

Run these commands before starting implementation:

```sh
git status --short
rg -n "\bintent\b|Intent|INTENTS|isIntent|defaultIntent|default_intent|TeachingIntent|intentFromSelection|selectedIntentBySession|setSessionIntent" packages/buddy/src packages/buddy/test packages/web/src packages/web/test docs/guides --glob '!packages/sdk/src/gen/**' --glob '!packages/web/src/routeTree.gen.ts'
rg -n "resolveIntentPermissions|IntentCapability|pedagogyManagedSkillNames|getIntentPrompt|student_intent|PromptTurnSnapshot|TeachingSessionState" packages/buddy/src packages/buddy/test packages/web/src packages/web/test
```

Classify every hit into one of these buckets before editing:

| Bucket | Expected action |
|---|---|
| Runtime intent enum/types | Delete |
| Intent capability manifests | Delete |
| Prompt steering by runtime intent | Delete |
| Learner snapshot query/runtime context intent | Delete |
| Session state intent | Delete |
| Backend route/config fields | Delete |
| Frontend state/UI/request plumbing | Delete |
| Learner-model free-text `"intent"` | Keep |
| Ordinary prose using "intent" | Keep if not runtime-contract prose |

## Phase 0: Promote Intent-Gated Capabilities To Persona Level (Already Done)

Goal: make the old intent manifests removable by ensuring persona definitions own the runtime tools and skills they need.

Do not redo this phase unless the preflight inventory shows that a tool or skill is only allowed through an intent manifest.

Already changed areas:

| Area | Expected state |
|---|---|
| `packages/buddy/src/learning/personas/*.ts` | Persona definitions contain runtime tool and skill defaults |
| `packages/buddy/src/learning/personas/wiring/define-buddy-persona.ts` | Persona definitions accept `skillDefaults` |
| `packages/buddy/src/learning/personas/wiring/persona.orchestration.ts` | Resolved persona profiles expose `skillDefaults` |
| `packages/buddy/src/learning/shared/runtime-types.ts` | Runtime profiles carry skill access |
| `packages/buddy/src/learning/tools/tool-permission-compiler.ts` | Skill permissions come from persona defaults |

Phase 0 verification:

```sh
bun test packages/buddy/test/learning/runtime-session-permissions.test.ts
bun test packages/buddy/test/learning/runtime-activity-bundles.test.ts
bun fmt
bun lint
bun typecheck
```

## Phase 1: Remove Intent Capability Infrastructure

Goal: delete the intent manifest system and make runtime permission compilation independent of runtime intent.

This is the first implementation phase because later phases must not depend on files that are about to disappear.

### Ordered Checklist

1. Replace the managed-skill source used by runtime permission syncing before deleting the intent resolution module.
2. Add `packages/buddy/src/learning/skills/managed-buddy-skills.ts`.
3. Export `managedBuddySkillNames()` from the new file.
4. Implement `managedBuddySkillNames()` from `REGISTERED_BUDDY_PERSONAS` persona `skillDefaults`, not from intent manifests.
5. Update `packages/buddy/src/learning/agent-execution/permissions/session-permissions.ts` to import the new helper instead of `pedagogyManagedSkillNames()`.
6. Update `packages/buddy/src/learning/tools/tool-permission-compiler.ts` so `compileRuntimeLearningToolPermissions()` no longer accepts `intent`.
7. Remove `explicitIntents()`, `applyIntentToolOverrides()`, `collectIntentManagedAllowedToolIDs()`, and all `resolveIntentPermissions()` imports.
8. Keep persona defaults, persona/workspace constraints, runtime constraints, and configured tool toggles in that order.
9. Update `deriveStaticPersonaLearningToolPermissions()` so it uses only persona default allowances across workspace states.
10. Update `packages/buddy/src/learning/resolve-capability-profile.ts` so `resolveCapabilityProfile()` no longer accepts or passes `intent`.
11. Update all TypeScript call sites that passed `intent` into `resolveCapabilityProfile()` or `compileRuntimeLearningToolPermissions()`.
12. Delete the old intent capability files.
13. Delete or rewrite tests that only validate intent manifests.

### Files To Delete

| Path |
|---|
| `packages/buddy/src/learning/intents/learn/capabilities.ts` |
| `packages/buddy/src/learning/intents/practice/capabilities.ts` |
| `packages/buddy/src/learning/intents/assess/capabilities.ts` |
| `packages/buddy/src/learning/intents/capabilities/intent-manifests.ts` |
| `packages/buddy/src/learning/intents/capabilities/resolution.ts` |
| `packages/buddy/src/learning/intents/capabilities/validation.ts` |
| `packages/buddy/src/learning/intents/capabilities/tool-capabilities.ts` |
| `packages/buddy/src/learning/intents/capabilities/skill-capabilities.ts` |
| `packages/buddy/src/learning/intents/capabilities/types.ts` |
| `packages/buddy/src/learning/intents/capabilities/load-bundled-skills.ts` |
| `packages/buddy/test/learning/intent-capability-validation.test.ts` |

### Required Code Shape

`compileRuntimeLearningToolPermissions()` must have this logical input shape after the phase:

```ts
{
  persona: PersonaDefinition
  workspaceState: WorkspaceState
  configuredToolToggles?: Config.Info["tools"]
}
```

The compiler must not import anything from `packages/buddy/src/learning/intents/**`.

### Phase 1 Exit Checks

```sh
rg -n "resolveIntentPermissions|IntentCapability|INTENT_CAPABILITY|pedagogyManagedSkillNames|explicitIntents|applyIntentToolOverrides|collectIntentManagedAllowedToolIDs" packages/buddy/src packages/buddy/test
rg -n "intent:" packages/buddy/src/learning/tools packages/buddy/src/learning/resolve-capability-profile.ts
bun test packages/buddy/test/learning/tool-permission-compiler.test.ts
bun test packages/buddy/test/learning/runtime-session-permissions.test.ts
bun test packages/buddy/test/learning/runtime-activity-bundles.test.ts
bun test packages/buddy/test/learning/tool-capability-policy.test.ts
bun fmt
bun lint
bun typecheck
```

Expected result: the first two `rg` commands return no runtime-intent hits.

### Phase 1 Traps

Do not delete `session-permissions.ts` skill cleanup without replacing its managed skill source. Otherwise old skill permission rules can survive across profile changes.

Do not leave `intent` as an unused parameter in `resolveCapabilityProfile()`. That creates a false signal that capability access still changes by intent.

Do not derive managed skills from dynamic tool smoke-test files. Dynamic tools are out of scope for this plan.

## Phase 2: Remove Prompt-Level Runtime Intent Framing

Goal: remove runtime-intent prompt steering while keeping message execution functional.

After this phase, the model should no longer see `<student_intent>` or an explicit `Intent switch` reminder.

### Ordered Checklist

1. Remove `getIntentPrompt()` from `packages/buddy/src/learning/prompt/buddy-prompt-compiler.ts`.
2. Build `systemContext` from `runtimeContext.runtimeContext` only.
3. Remove the `<student_intent>` XML block entirely.
4. Update `packages/buddy/src/learning/prompt/user-prelude/index.ts` so `currentTurn` no longer includes `intent`.
5. Update `packages/buddy/src/learning/prompt/user-prelude/turn-transitions.ts` so it no longer reads `state.intent`.
6. Replace intent-based focus heuristics with workspace/persona-based heuristics only.
7. Recommended replacement for execution-focused state: treat `workspaceState === "interactive"` as execution-focused; otherwise use persona/workspace transitions without intent.
8. Remove `intent` from `PromptTurnSnapshot` only if Phase 4 is being executed in the same branch immediately. If Phase 4 is not part of the same edit batch, keep the type temporarily but stop rendering prompt text from it.
9. Delete the prompt fragment files after imports are gone.
10. Update prompt assembly tests.

### Files To Delete

| Path |
|---|
| `packages/buddy/src/learning/intents/get-intent-prompt.ts` |
| `packages/buddy/src/learning/intents/learn/intent.p.md` |
| `packages/buddy/src/learning/intents/practice/intent.p.md` |
| `packages/buddy/src/learning/intents/assess/intent.p.md` |
| `packages/buddy/src/learning/intents/learning-principles.p.md` |

### Phase 2 Exit Checks

```sh
rg -n "getIntentPrompt|student_intent|Intent switch|intent.p.md|learning-principles.p.md" packages/buddy/src packages/buddy/test
bun test packages/buddy/test/prompts/assemblies.test.ts
bun test packages/buddy/test/prompts/compose-system-prompt-goals.test.ts
bun test packages/buddy/test/learning/prompt-resource-references.test.ts
bun fmt
bun lint
bun typecheck
```

Manual check:

```sh
rg -n "<student_intent>|Intent switch" .
```

Expected result: no system prompt assembly contains runtime-intent text.

### Phase 2 Traps

Do not remove pedagogy skill files in this phase. The goal is to remove runtime-intent prompt framing, not pedagogy guidance.

Do not compensate by adding hidden prompt text that recreates `learn/practice/assess/auto` as a new hardcoded runtime mode.

## Phase 3: Remove Runtime Intent From Learner Snapshot And Pedagogy Tools

Goal: remove runtime intent from learner read-model queries, snapshot fingerprints, pedagogy tool context, and pedagogy tool outputs.

This phase intentionally changes learner snapshot cache keys. That is acceptable.

### Ordered Checklist

1. Update `packages/buddy/src/learning/learner-model/repository/types.ts`.
2. Remove `INTENTS` import from that file.
3. Remove `intent` from `SnapshotQuerySchema`.
4. Update `packages/buddy/src/learning/learner-model/projections/snapshot.ts`.
5. Remove `intent` from `runtimeContext`.
6. Remove `intent` from snapshot fingerprints.
7. Remove `intent` from `resolveCapabilityProfile()` calls.
8. Update `packages/buddy/src/learning/learner-model/tools/query.ts`.
9. Remove `INTENTS` import and query-tool `intent` parameter.
10. Update `packages/buddy/src/learning/capabilities/pedagogy/tools/orchestration/contracts.ts`.
11. Remove `intent` from `PedagogyToolContext`.
12. Update `packages/buddy/src/learning/capabilities/pedagogy/tools/orchestration/context.ts`.
13. Stop reading `runtimeState.intent`.
14. Build learner snapshot queries from `persona`, `workspaceState`, and `focusGoalIds` only.
15. Update `stepwise-solve.ts`, `debug-attempt.ts`, and `reflection.ts` so prompt text and metadata no longer include `Intent: ...`.
16. Rename `packages/buddy/test/learning/learner-intent-view.test.ts` with `git mv` if it remains useful. Use `packages/buddy/test/learning/learner-snapshot-runtime-context.test.ts` as the new name.
17. Update tests that assert snapshot runtime context, fingerprint contents, or pedagogy tool metadata.

### Files To Update

| Path | Required removal |
|---|---|
| `packages/buddy/src/learning/learner-model/repository/types.ts` | `SnapshotQuerySchema.intent` |
| `packages/buddy/src/learning/learner-model/projections/snapshot.ts` | `runtimeContext.intent`, fingerprint `intent:*`, profile input `intent` |
| `packages/buddy/src/learning/learner-model/tools/query.ts` | tool parameter `intent` |
| `packages/buddy/src/learning/capabilities/pedagogy/tools/orchestration/contracts.ts` | `PedagogyToolContext.intent` |
| `packages/buddy/src/learning/capabilities/pedagogy/tools/orchestration/context.ts` | `runtimeState.intent` fallback |
| `packages/buddy/src/learning/capabilities/pedagogy/tools/definitions/stepwise-solve.ts` | prompt text and metadata intent |
| `packages/buddy/src/learning/capabilities/pedagogy/tools/definitions/debug-attempt.ts` | prompt text and metadata intent |
| `packages/buddy/src/learning/capabilities/pedagogy/tools/definitions/reflection.ts` | prompt text and metadata intent |

### Phase 3 Exit Checks

```sh
rg -n "runtimeContext.*intent|intent: input.query.intent|intent:\\$|Intent:" packages/buddy/src/learning/learner-model packages/buddy/src/learning/capabilities/pedagogy/tools packages/buddy/test/learning
rg -n "SnapshotQuerySchema|PedagogyToolContext|LearnerSnapshotCompiler.compile" packages/buddy/src/learning packages/buddy/test/learning
bun test packages/buddy/test/learning/learner-snapshot-runtime-context.test.ts
bun test packages/buddy/test/learning/pedagogy-tools.test.ts
bun test packages/buddy/test/learning/learner-service-regressions.test.ts
bun fmt
bun lint
bun typecheck
```

Expected result: the first `rg` command returns no runtime-intent hits. The second command is for manual inspection of changed call sites.

### Phase 3 Traps

Do not keep `intent` in the snapshot fingerprint "just for cache separation." The field is being removed from runtime semantics.

Do not remove the learner-model free-text decision field named `"intent"`. It is not part of `SnapshotQuerySchema`.

## Phase 4: Remove Runtime Intent From Session State And Internal Targeting

Goal: stop reading, writing, and threading runtime intent through prompt context construction and internal session transforms.

This phase removes the runtime state concept. Backend routes may still accept stale `intent` until Phase 5, but internals must ignore it.

### Ordered Checklist

1. Update `packages/buddy/src/learning/shared/teaching-session-state.ts`.
2. Remove `Intent` import.
3. Remove `intent` from `TeachingSessionState`.
4. Update `packages/buddy/src/learning/shared/targeting.ts`.
5. Delete `resolveIntent()`.
6. Delete `isIntent()` usage from targeting.
7. Keep unrelated targeting helpers such as persona, surface, model, focus goal, and workspace resolution.
8. Update `packages/buddy/src/learning/prompt/context.ts`.
9. Remove `Intent` imports.
10. Remove `intent` from `PromptTurnSnapshot`.
11. Remove `intent` from `PromptContext`.
12. Remove `resolveIntent()` call.
13. Remove `intent` from learner snapshot query.
14. Remove `intent` from `resolveCapabilityProfile()` call if any call remains.
15. Remove `intent` from `priorTurn`.
16. Remove `intent` from `nextTeachingState`.
17. Update `packages/buddy/src/learning/agent-execution/transforms/command-transform.ts`.
18. Remove intent resolution and state writes.
19. Keep `delete transformed.intent` temporarily if Phase 5 is not executed in the same commit. This protects OpenCode payloads while backend routes can still receive stale `intent`.
20. Update `packages/buddy/src/learning/prompt/message-prompt-pipeline.ts`.
21. Keep `delete transformed.intent` temporarily if Phase 5 is not executed in the same commit.
22. Update learner-model workflows that synthesize teaching session state.
23. Remove synthetic `intent` from `observe-message.ts`, `record-practice.ts`, and `record-assessment.ts`.
24. Confirm persisted session-state reads tolerate extra JSON keys from older state files.
25. If a parser/schema rejects extra keys, change the parser to ignore unknown `intent` rather than migrating all historical session files.

### Files To Update

| Path | Required removal |
|---|---|
| `packages/buddy/src/learning/shared/teaching-session-state.ts` | `TeachingSessionState.intent` |
| `packages/buddy/src/learning/shared/targeting.ts` | `resolveIntent()` and `isIntent()` usage |
| `packages/buddy/src/learning/prompt/context.ts` | `PromptContext.intent`, `PromptTurnSnapshot.intent`, state writes |
| `packages/buddy/src/learning/agent-execution/transforms/command-transform.ts` | intent resolution and state writes |
| `packages/buddy/src/learning/prompt/message-prompt-pipeline.ts` | temporary payload scrubber later removed in Phase 5 |
| `packages/buddy/src/learning/learner-model/workflows/observe-message.ts` | synthetic `intent` |
| `packages/buddy/src/learning/learner-model/workflows/record-practice.ts` | synthetic `intent` |
| `packages/buddy/src/learning/learner-model/workflows/record-assessment.ts` | synthetic `intent` |

### Required Compatibility Behavior

Older persisted session state may still contain an `intent` property. Reads must not crash on that extra property.

Do not preserve or rewrite that property. Ignore it.

### Phase 4 Exit Checks

```sh
rg -n "resolveIntent|isIntent|TeachingSessionState.*intent|PromptContext.*intent|PromptTurnSnapshot.*intent|previousState.intent|nextTeachingState.*intent|runtimeState.intent" packages/buddy/src packages/buddy/test
rg -n "delete transformed.intent" packages/buddy/src/learning/agent-execution/transforms packages/buddy/src/learning/prompt
bun test packages/buddy/test/learning/runtime-session-permissions.test.ts
bun test packages/buddy/test/learning/learner-route-regressions.test.ts
bun fmt
bun lint
bun typecheck
```

Expected result: the first `rg` command returns no runtime-intent hits. The second command may return temporary scrubbers only if Phase 5 has not been executed yet.

### Phase 4 Traps

Do not let `intent` fall through to OpenCode request bodies after internal targeting stops reading it. Keep scrubbers until route schemas remove the field.

Do not add `intent?: never` or similar compatibility types. That keeps the concept alive.

## Phase 5: Remove Runtime Intent From Backend API And Config

Goal: remove runtime intent from external backend request/response surfaces and project config.

This is the API/config breaking-change phase.

Decision: remove `default_intent` from the strict config contract. Because `ConfigSchema.Info` is strict, stale configs containing `default_intent` will fail validation after this phase. Before merging, remove `default_intent` from checked-in example configs and clean local dev config if needed. Do not add a compatibility shim unless this decision is explicitly reversed.

### Ordered Checklist

1. Update `packages/buddy/src/routes/session.ts`.
2. Remove `INTENTS` import.
3. Remove `intent` from prompt body schemas.
4. Remove `intent` from command body schemas.
5. Remove `intent` from `teachingSessionStateSchema`.
6. Remove runtime-intent examples from OpenAPI metadata.
7. Update `packages/buddy/src/routes/learner.ts`.
8. Remove `INTENTS` import.
9. Remove `intent` query parameter.
10. Remove `runtimeContext.intent` from response schema.
11. Update `packages/buddy/src/learning/adapters/http/learner-model/http-request.ts`.
12. Stop parsing `intent` from learner snapshot URLs.
13. Update `packages/buddy/src/config/contract/schema.ts`.
14. Remove `INTENTS` import.
15. Remove `TeachingIntent`.
16. Remove `default_intent` from `ConfigSchema.Info`.
17. Search checked-in configs/docs for `default_intent` and remove or rewrite them.
18. Remove temporary `delete transformed.intent` scrubbers from Phase 4.
19. Regenerate the typed SDK.
20. Update backend API route tests.

### SDK Regeneration

Run this command after route schema changes:

```sh
bun run sdk:generate
```

### Files To Update

| Path | Required removal |
|---|---|
| `packages/buddy/src/routes/session.ts` | request `intent`, response state `intent`, `INTENTS` import |
| `packages/buddy/src/routes/learner.ts` | query `intent`, response `runtimeContext.intent`, `INTENTS` import |
| `packages/buddy/src/learning/adapters/http/learner-model/http-request.ts` | URL `intent` parsing |
| `packages/buddy/src/config/contract/schema.ts` | `default_intent`, `TeachingIntent`, `INTENTS` import |
| `packages/buddy/src/learning/agent-execution/transforms/command-transform.ts` | temporary stale payload scrubber |
| `packages/buddy/src/learning/prompt/message-prompt-pipeline.ts` | temporary stale payload scrubber |
| `packages/sdk/src/gen/**` | generated SDK changes |

### Phase 5 Exit Checks

```sh
rg -n "default_intent|TeachingIntent|INTENTS|intent:" packages/buddy/src/routes packages/buddy/src/config packages/buddy/src/learning/adapters/http packages/sdk/src/gen
rg -n "delete transformed.intent" packages/buddy/src
bun test packages/buddy/test/learning/learner-artifact-routes.test.ts
bun test packages/buddy/test/learning/learner-route-regressions.test.ts
bun test packages/buddy/test/learning/learner-route-tool-toggles.test.ts
bun test packages/buddy/test/session/route-regressions.test.ts
bun fmt
bun lint
bun typecheck
```

Expected result: both `rg` commands return no runtime-intent hits.

### Phase 5 Traps

Do not forget SDK generation. The frontend must consume generated types that no longer include `intent`.

Do not leave `default_intent` in strict config docs. That creates a boot-time failure for anyone copying the documented config.

Do not remove ordinary route tests just because they asserted an `intent` field. Rewrite them to assert the field is absent.

## Phase 6: Remove Runtime Intent From Frontend

Goal: remove intent UI, frontend state, request payload plumbing, query keys, settings, debug displays, and persisted runtime state.

Run this after Phase 5 so generated SDK types enforce the new backend contract.

### Ordered Checklist

1. Update `packages/web/src/state/teaching-runtime.ts`.
2. Remove `TeachingIntent`.
3. Remove `intentFromSelection()`.
4. Remove `selectedIntentBySession`.
5. Remove `setSessionIntent()`.
6. Bump `TEACHING_RUNTIME_STORAGE_KEY` to a new version, for example `buddy.teaching.runtime.v2`.
7. Do not migrate old `selectedIntentBySession`; intentionally drop it with the storage-key bump.
8. Update `packages/web/src/state/chat-actions.ts`.
9. Remove `intent` from message request input.
10. Remove `intent` from command request input.
11. Remove requested-intent fallback logic.
12. Remove response handling that reads `snapshot.runtimeContext.intent`.
13. Update `packages/web/src/state/project-settings.ts`.
14. Remove default-intent state and config patching.
15. Update `packages/web/src/state/learner-query.ts`.
16. Remove `intent` from query input and query keys.
17. Update directory-chat hooks and helpers.
18. Remove default intent loading, handler props, payload construction, and placeholders.
19. Remove prompt intent selector components.
20. Remove settings default-intent controls.
21. Remove intent badges from sidebars and devtools.
22. Remove intent strings from `packages/web/src/i18n/en.ts`.
23. Do not change `packages/web/src/app.tsx` `defaultPreload: "intent"` unless the code is specifically referring to teaching intent. TanStack Router's `"intent"` preload mode is unrelated and must stay if desired.
24. Update frontend tests.

### Files To Update

| Path or group | Required removal |
|---|---|
| `packages/web/src/state/teaching-runtime.ts` | intent type, selected intent map, setter, old storage key |
| `packages/web/src/state/chat-actions.ts` | request/response intent plumbing |
| `packages/web/src/state/project-settings.ts` | default-intent config state |
| `packages/web/src/state/learner-query.ts` | query input/key intent |
| `packages/web/src/lib/directory-chat/chat-config-query.ts` | config default intent |
| `packages/web/src/lib/directory-chat/chat-prompt-helpers.ts` | configured intent handling |
| `packages/web/src/lib/directory-chat/use-directory-chat-state.ts` | stored/default intent state |
| `packages/web/src/lib/directory-chat/use-directory-chat-page-controller.ts` | intent handlers and payload construction |
| `packages/web/src/lib/directory-chat/use-teaching-workspace.ts` | request intent |
| `packages/web/src/components/prompt/**` | intent selector and intent placeholders |
| `packages/web/src/components/settings/**` | default-intent controls |
| `packages/web/src/components/layout/chat-right-sidebar.tsx` | runtime/action intent badges |
| `packages/web/src/components/debug/buddy-devtools.tsx` | intent debug display |
| `packages/web/src/components/directory-chat/directory-chat-right-sidebar.tsx` | intent props |
| `packages/web/src/i18n/en.ts` | teaching intent UI strings |
| `packages/web/test/teaching-runtime.test.ts` | storage-key/drop-old-state coverage |
| `packages/web/test/chat-actions.test.ts` | payload expectations |
| `packages/web/test/project-settings.test.ts` | config patch expectations |

### Phase 6 Exit Checks

```sh
rg -n "TeachingIntent|intentFromSelection|selectedIntentBySession|setSessionIntent|defaultIntent|default_intent|runtimeContext.*intent|\bintent\b" packages/web/src packages/web/test --glob '!packages/web/src/routeTree.gen.ts'
bun test packages/web/test/teaching-runtime.test.ts
bun test packages/web/test/chat-actions.test.ts
bun test packages/web/test/project-settings.test.ts
bun fmt
bun lint
bun typecheck
```

Expected result: the `rg` command has no teaching-runtime-intent hits. If it finds `defaultPreload: "intent"`, leave it alone because that is TanStack Router behavior, not Buddy runtime intent.

Manual checks:

```text
Prompt toolbar no longer shows an intent selector.
Project settings no longer show a default intent option.
Debug panels no longer show runtime intent badges.
Sending a chat message does not include intent in the request payload.
Running a slash command does not include intent in the request payload.
Learner snapshot requests do not include intent in query keys or URLs.
```

### Phase 6 Traps

Do not remove TanStack Router `defaultPreload: "intent"` by keyword search. It is unrelated.

Do not add a frontend-only default like `"auto"` to replace the deleted runtime field.

Do not preserve old frontend persisted intent state. Drop it by storage-key bump.

## Phase 7: Remove Final Runtime Intent Types, Persona Defaults, And Docs

Goal: delete the remaining runtime vocabulary and authoring references after all consumers are gone.

### Ordered Checklist

1. Update `packages/buddy/src/learning/shared/runtime-types.ts`.
2. Remove `defaultIntent` from `PersonaDefinition`.
3. Update `packages/buddy/src/learning/personas/wiring/define-buddy-persona.ts`.
4. Remove `PersonaIntent`.
5. Remove `defaultIntent` from authored persona input.
6. Update all built-in persona files.
7. Remove `defaultIntent` from `buddy.ts`, `code-buddy.ts`, `math-buddy.ts`, and `reading-buddy.ts`.
8. Update `packages/buddy/src/learning/shared/teaching-vocabulary.ts`.
9. Remove `INTENTS`.
10. Remove runtime `Intent` type.
11. Remove `INTENT_LABELS`.
12. Remove `isIntent()`.
13. Update authoring docs that describe runtime intent.
14. Update tests and fixtures that mention runtime intent.
15. Run final repository-wide intent audit.

### Files To Update

| Path | Required removal |
|---|---|
| `packages/buddy/src/learning/shared/runtime-types.ts` | `defaultIntent` |
| `packages/buddy/src/learning/personas/wiring/define-buddy-persona.ts` | `PersonaIntent`, authored `defaultIntent` |
| `packages/buddy/src/learning/personas/buddy.ts` | `defaultIntent` |
| `packages/buddy/src/learning/personas/code-buddy.ts` | `defaultIntent` |
| `packages/buddy/src/learning/personas/math-buddy.ts` | `defaultIntent` |
| `packages/buddy/src/learning/personas/reading-buddy.ts` | `defaultIntent` |
| `packages/buddy/src/learning/shared/teaching-vocabulary.ts` | `INTENTS`, runtime `Intent`, labels, guard |
| `docs/guides/persona-authoring-guide-v2.md` | runtime intent guidance |
| `docs/guides/tool-authoring-guide.md` | intent-managed tool guidance |
| `docs/guides/learning-authoring-guardrails.md` | intent manifest guidance |

### Final Audit Commands

```sh
rg -n "\bIntent\b|\bINTENTS\b|\bisIntent\b|defaultIntent|default_intent|TeachingIntent|intentFromSelection|selectedIntentBySession|setSessionIntent|resolveIntent|resolveIntentPermissions|getIntentPrompt|student_intent" packages/buddy/src packages/buddy/test packages/web/src packages/web/test docs/guides --glob '!packages/sdk/src/gen/**' --glob '!packages/web/src/routeTree.gen.ts'
rg -n "\bintent\b" packages/buddy/src/learning packages/web/src docs/guides --glob '!packages/web/src/routeTree.gen.ts'
```

Allowed final hits for the second command:

| Allowed hit type | Example |
|---|---|
| Learner-model free-text decision field | `InterpretMessageDecisionSchema.intent` |
| Ordinary user intention prose | "learner's intent" in curriculum-goal prompts |
| Unrelated framework setting | `defaultPreload: "intent"` if included in the searched paths |

No final hit may describe Buddy runtime `learn/practice/assess/auto` selection.

### Final Test Gate

```sh
bun test packages/buddy/test/learning/tool-permission-compiler.test.ts
bun test packages/buddy/test/learning/runtime-session-permissions.test.ts
bun test packages/buddy/test/learning/runtime-activity-bundles.test.ts
bun test packages/buddy/test/learning/pedagogy-tools.test.ts
bun test packages/buddy/test/learning/learner-service-regressions.test.ts
bun test packages/buddy/test/learning/learner-route-regressions.test.ts
bun test packages/buddy/test/learning/learner-route-tool-toggles.test.ts
bun test packages/buddy/test/learning/learner-artifact-routes.test.ts
bun test packages/buddy/test/session/route-regressions.test.ts
bun test packages/web/test/teaching-runtime.test.ts
bun test packages/web/test/chat-actions.test.ts
bun test packages/web/test/project-settings.test.ts
bun fmt
bun lint
bun typecheck
```

### Manual End-To-End Smoke

Run these checks before calling the migration complete:

```text
Start Buddy backend and web frontend.
Open an existing project.
Create a new chat session with the default Buddy persona.
Send a normal learner message.
Run one slash command path that previously carried intent.
Open an interactive teaching workspace.
Trigger a learner snapshot request.
Open project settings.
Open Buddy devtools/debug panel.
Inspect the network payloads for session prompt, command, and learner snapshot requests.
Inspect one assembled system prompt in saved outbound history.
```

Expected manual results:

```text
No visible intent selector exists.
No default intent setting exists.
No runtime intent badge exists.
No request payload contains intent.
No learner snapshot query URL contains intent.
No teaching session state response contains intent.
No system prompt contains <student_intent>.
Tools and skills still resolve from persona/workspace/runtime/config constraints.
Existing stale session files with an intent property do not crash reads.
```

## Suggested PR Shape

Use these PR boundaries if the full migration is too large:

| PR | Scope |
|---|---|
| PR 1 | Phase 1 only: delete intent capability manifests and simplify permission compilation |
| PR 2 | Phases 2-4: remove prompt, learner snapshot, pedagogy tool, session-state, and internal targeting intent |
| PR 3 | Phase 5: remove backend API/config intent and regenerate SDK |
| PR 4 | Phase 6: remove frontend intent |
| PR 5 | Phase 7: final vocabulary/docs cleanup and repository-wide audit |

Do not start the dynamic-tool migration until all runtime intent removal phases are complete and the final audit passes.
