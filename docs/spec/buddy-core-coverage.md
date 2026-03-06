# Buddy Core Coverage Matrix

This document is the closeout artifact for [buddy-core.spec.md](/Users/prashantbhudwal/Code/buddy/buddy-core.spec.md).

Rule:

- every implementable section of the spec must be marked `implemented`, `changed`, or `deferred`
- every `implemented` section must name the owning code paths and a test or smoke-check path
- every `changed` section must be reflected in the spec in the same pass

Sections 1-3 are framing and principle sections. They inform implementation but are not treated as separate runtime clauses here.

Prompt contracts in this pass were rewritten against:

- official OpenAI prompt-engineering and reasoning-model guidance
- official Anthropic prompt-engineering guidance
- vendored OpenCode prompt structure under `vendor/opencode/packages/opencode/src/session/prompt/`

## Coverage

| Spec section | Key clauses covered | Status | Owning code/prompt | Tests / smoke checks |
| --- | --- | --- | --- | --- |
| 4. Canonical terminology | `persona`, `instructionalStrategy`, `adaptivity`, `activity`, `workspaceState`, learner store, workspace context, projection terminology | implemented | `packages/buddy/src/learning/runtime/types.ts`, `packages/buddy/src/learning/learner/types.ts`, `packages/web/src/state/chat-actions.ts` | `packages/buddy/test/config-jsonc.test.ts`, `packages/buddy/test/prompt-assemblies.test.ts` |
| 5. Canonical types | runtime types, user-facing labels, strategy ids, surface ids | implemented | `packages/buddy/src/learning/runtime/types.ts`, `packages/buddy/src/learning/runtime/definitions.ts` | `packages/buddy/test/runtime-router.test.ts`, `packages/web/test/chat-actions.test.ts` |
| 6. Architectural layers | runtime layer, curriculum capability layer, data layer, projection layer, UI layer split | implemented | `packages/buddy/src/learning/runtime/*`, `packages/buddy/src/learning/learner/*`, `packages/web/src/components/layout/chat-right-sidebar.tsx` | matrix audit + integration tests below |
| 7. State domains | session state separate from learner store and workspace context | implemented | `packages/buddy/src/learning/runtime/session-state.ts`, `packages/buddy/src/learning/learner/types.ts`, `packages/buddy/src/learning/learner/service.ts` | `packages/buddy/test/runtime-router.test.ts`, `packages/buddy/test/learner-intent-view.test.ts` |
| 8. Runtime ontology | personas, strategies, activities, scaffolding, surfaces, workspace state | implemented | `packages/buddy/src/personas/*`, `packages/buddy/src/learning/runtime/types.ts`, `packages/buddy/src/learning/runtime/definitions.ts` | `packages/buddy/test/prompt-assemblies.test.ts`, web smoke pass |
| 9. Runtime definitions | persona/strategy/activity definitions, teaching contract, tool/subagent deltas, prompt digest, injections | implemented | `packages/buddy/src/learning/runtime/types.ts`, `packages/buddy/src/learning/runtime/definitions.ts` | `packages/buddy/test/prompt-assemblies.test.ts`, `packages/buddy/test/runtime-router.test.ts` |
| 10. Runtime profile compilation | one compiled profile per turn from persona + strategy + activity + workspace state + learner digest | implemented | `packages/buddy/src/learning/runtime/compiler.ts`, `packages/buddy/src/learning/shared/compose-system-prompt.ts` | `packages/buddy/test/prompt-assemblies.test.ts` |
| 11. Switching model | soft/hard/recommend-switch behavior with inline handoff | implemented | `packages/buddy/src/learning/runtime/router.ts`, `packages/buddy/src/learning/runtime/session-state.ts`, `packages/buddy/src/routes/session.ts` | `packages/buddy/test/runtime-router.test.ts`, live Auto/manual smoke pass |
| 12. Adaptivity model | adaptive router, learner signals, cold-start routing | implemented | `packages/buddy/src/learning/runtime/router.ts`, `packages/buddy/src/learning/learner/service.ts` | `packages/buddy/test/runtime-router.test.ts`, `packages/buddy/test/learner-intent-view.test.ts` |
| 13. Agent and subagent roles | personas are user-facing; orchestrator/goal-writer/practice-agent/assessment-agent are delegated; feedback/progress/sequencing/alignment are services | implemented | `packages/buddy/src/learning/companion/agent.ts`, `packages/buddy/src/learning/curriculum/*.subagent.ts`, `packages/buddy/src/learning/learner/feedback.ts`, `packages/buddy/src/learning/learner/sequencing.ts` | `packages/buddy/test/curriculum-tools.test.ts`, prompt contract tests |
| 14. Learner store | canonical goals, edges, evidence, practice, assessments, misconceptions, constraints, feedback | implemented | `packages/buddy/src/learning/learner/types.ts`, `packages/buddy/src/learning/learner/store.ts`, `packages/buddy/src/learning/learner/service.ts` | `packages/buddy/test/goals-tools.test.ts`, `packages/buddy/test/learner-intent-view.test.ts` |
| 15. Workspace-local state | `.buddy/context.json` and notebook-local teaching workspace artifacts | implemented | `packages/buddy/src/learning/learner/service.ts`, `packages/buddy/src/learning/learner/store.ts`, `packages/buddy/src/learning/teaching/service.ts` | `packages/buddy/test/teaching-routes.test.ts`, `packages/web/test/teaching-context.test.ts` |
| 16. Projections and views | progress, review, alignment, generated learning-plan view, session plan, open feedback, constraints summary | implemented | `packages/buddy/src/learning/learner/projections.ts`, `packages/buddy/src/learning/learner/query.ts`, `packages/buddy/src/learning/learner/sequencing.ts` | `packages/buddy/test/learner-intent-view.test.ts` |
| 17. Read model | prompt injection path plus narrow read facade; relevance based on workspace/tags/pinned goals/concepts | implemented | `packages/buddy/src/learning/learner/query.ts`, `packages/buddy/src/learning/learner/tools/query.ts`, `packages/buddy/src/learning/shared/compose-system-prompt.ts` | `packages/buddy/test/prompt-assemblies.test.ts`, `packages/buddy/test/curriculum-tools.test.ts` |
| 18. Prompt query budgeting | tiered digest with tier1/2/3 summaries and lossy prompt shaping | implemented | `packages/buddy/src/learning/learner/query.ts` | `packages/buddy/test/prompt-assemblies.test.ts`, `packages/buddy/test/learner-intent-view.test.ts` |
| 19. Write model | evidence-first writes through focused service methods and observer paths; derived projections rebuilt separately | implemented | `packages/buddy/src/learning/learner/service.ts`, `packages/buddy/src/learning/learner/store.ts` | `packages/buddy/test/goals-tools.test.ts`, `packages/buddy/test/learner-intent-view.test.ts` |
| 20. Agent responsibilities | goal writer, practice agent, assessment agent, feedback engine, progress tracker, sequencer, alignment auditor responsibilities | implemented | `packages/buddy/src/learning/goals/*`, `packages/buddy/src/learning/curriculum/*.p.md`, `packages/buddy/src/learning/learner/feedback.ts`, `packages/buddy/src/learning/learner/sequencing.ts` | `packages/buddy/test/prompt-contracts.test.ts`, `packages/buddy/test/runtime-router.test.ts` |
| 21. Service layer | learner package layout and service methods such as `queryForPrompt`, `queryState`, `commitGoals`, `writeEdges`, `recordPractice`, `recordAssessment`, `recordFeedback`, `markFeedbackActedOn`, `getSessionPlan`, `getCurriculumView`, `runSafetySweep` | implemented | `packages/buddy/src/learning/learner/service.ts`, `packages/buddy/src/learning/learner/path.ts`, `packages/buddy/src/learning/learner/store.ts` | `packages/buddy/test/learner-intent-view.test.ts`, `packages/buddy/test/goals-tools.test.ts` |
| 22. Physical storage layout | partitioned learner-store files under `~/.buddy/learner/` with projection subdirectory | implemented | `packages/buddy/src/learning/learner/path.ts`, `packages/buddy/src/learning/learner/store.ts` | startup smoke check, learner route smoke checks |
| 23. Concurrency and idempotency | atomic writes, append-only evidence log, observer cursors as optimization, safety sweep | implemented | `packages/buddy/src/learning/learner/store.ts`, `packages/buddy/src/learning/learner/service.ts` | `packages/buddy/test/learner-intent-view.test.ts`, repeated rebuild/safety-sweep smoke check |
| 24. Integration with current Buddy | old mode registry replaced by personas, notebook-local curriculum/goals removed as source of truth, prompt assembly reads learner digests | implemented | `packages/buddy/src/personas/*`, `packages/buddy/src/routes/config.ts`, `packages/buddy/src/learning/shared/compose-system-prompt.ts` | `packages/buddy/test/config-agent-default.test.ts`, `packages/buddy/test/prompt-assemblies.test.ts` |
| 25. UI contract | persona picker, strategy selector, Auto switch, dynamic surfaces, hidden complexity | implemented | `packages/web/src/components/prompt/prompt-composer.tsx`, `packages/web/src/components/layout/chat-right-sidebar.tsx`, `packages/web/src/components/settings-modal.tsx`, `packages/web/src/routes/$directory.chat.tsx` | web smoke pass, `packages/web/test/chat-actions.test.ts` |
| 26. Source-of-truth rules | learner store facts outrank workspace context and projections; curriculum sidebar remains a projection | implemented | `packages/buddy/src/learning/learner/service.ts`, `packages/buddy/src/learning/learner/query.ts`, `packages/buddy/src/learning/curriculum/tools/update.ts` | `packages/buddy/test/curriculum-tools.test.ts`, learner-state route smoke checks |
| 27. Implementation stance | one breaking architecture, no compatibility shims, learner/runtime contracts updated together | implemented | repo-wide cutover files plus current docs | build/test/smoke pass |
| 28. Non-negotiable decisions | notebook neutrality, cross-notebook learner knowledge, runtime/store separation, projection model, evidence-first writes, partitioned storage | implemented | reflected across runtime, learner store, and UI layers | matrix-wide coverage |
| 29. Final model | runtime plane + curriculum plane + storage plane + UI plane composition | implemented | `packages/buddy/src/learning/runtime/*`, `packages/buddy/src/learning/learner/*`, `packages/web/src/*` | build/tests + live smoke pass |

## Deferred items

None for this pass within the core scope. Figure-surface maturity is tracked separately and is explicitly outside this pass.
