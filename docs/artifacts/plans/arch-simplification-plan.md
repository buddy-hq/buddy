# Buddy Feature-Based Learning Runtime Refactor

## Summary
Refactor Buddy learning around concrete product features while keeping the existing good API names: `createBuddyTool`, `defineBuddySubagent`, and `defineBuddyPersona`. Add `defineBuddyFeature` and `defineBuddySkill`.

A feature is the only authoring/access grouping. It owns concrete `tools`, `skills`, `subagents`, and UI `surfaces`. Personas enable features. The runtime compiles enabled features into concrete OpenCode permissions for tools, skills, and subagents.

This removes the confusing vocabulary and layers: `capability`, `capabilityEnvelope`, `LearningToolGroup`, `prefer`, persona-authored `surfaces`, and `workspaceState: "chat" | "interactive"`.

## Final State API

Keep the existing function names where the name is already clear.

```ts
export const ingestFullTextTool = createBuddyTool({
  id: "ingest_full_text",
  description: INGEST_FULL_TEXT_DESCRIPTION,
  parameters: IngestFullTextParameters,
  async execute(params, ctx) {
    // existing implementation
  },
})
```

```ts
export const checkpointTool = createBuddyTool({
  id: "teaching_checkpoint",
  description: CHECKPOINT_DESCRIPTION,
  parameters: CheckpointParameters,
  constraints: {
    teachingWorkspace: "active",
  },
  async execute(params, ctx) {
    // existing implementation
  },
})
```

`createBuddyTool` changes only its policy field:

```ts
type BuddyToolConstraints = {
  teachingWorkspace?: "active"
  runtime?: "standards" | "advanced-math"
}

type BuddyToolDefinition = {
  id: string
  description: string
  parameters: z.ZodType
  constraints?: BuddyToolConstraints
  dynamic?: DynamicBuddyToolMetadata
  ui?: ToolUiMetadata
  execute: ExecuteFn
}
```

Remove `capability` from tool definitions. Do not support surface-based tool constraints.

Add a lightweight skill reference API. Model-facing `name`, `description`, and workflow remain only in `SKILL.md`.

```ts
export const readingSkill = defineBuddySkill({
  file: new URL("./SKILL.md", import.meta.url),
})
```

`defineBuddySubagent` keeps its name, but Buddy-managed tools/skills/subagents are passed as object references instead of raw permission strings.

```ts
export const flashcardAuthorSubagent = defineBuddySubagent({
  key: "flashcard-author",
  prompt: FLASHCARD_AUTHOR_PROMPT,
  tools: [ingestFullTextTool, saveFlashcardDeckTool],
  skills: [],
  subagents: [],
  permission: {
    question: "allow",
    todoread: "deny",
    todowrite: "deny",
  },
})
```

`permission` remains only for OpenCode-native permissions such as `question`, `todoread`, `todowrite`, `plan_enter`, and similar non-Buddy primitives. Buddy-managed tool, skill, and subagent permissions must come from `tools`, `skills`, and `subagents`.

Add `defineBuddyFeature`.

```ts
export const readingFeature = defineBuddyFeature({
  id: "reading",
  tools: [prepareResourceTool, ingestFullTextTool],
  skills: [readingSkill],
  subagents: [],
  surfaces: [],
})
```

```ts
export const flashcardsFeature = defineBuddyFeature({
  id: "flashcards",
  tools: [],
  skills: [],
  subagents: [flashcardAuthorSubagent],
  surfaces: ["flashcard"],
})
```

```ts
export const mathFiguresFeature = defineBuddyFeature({
  id: "math-figures",
  tools: [renderFigureTool, renderFreeformFigureTool],
  skills: [],
  subagents: [],
  surfaces: ["figure"],
})
```

Feature semantics:

```txt
feature.tools     -> tools granted directly to personas enabling the feature
feature.skills    -> skills visible/loadable by personas enabling the feature
feature.subagents -> subagents callable by personas enabling the feature
feature.surfaces  -> UI surfaces unlocked by the feature
subagent.tools    -> tools available only inside that subagent
```

Dynamic tools remain `BuddyTool`s. If a feature includes dynamic tools, they are discoverable for personas enabling that feature; direct invocation still requires the dynamic load flow.

`defineBuddyPersona` keeps its name but changes access authoring to features.

```ts
export const mathBuddy = defineBuddyPersona({
  id: "math-buddy",
  label: "Math Buddy",
  description: "Chat-first math Buddy persona with figures and calculation.",
  features: [
    curriculumFeature,
    memoryFeature,
    standardsFeature,
    readingFeature,
    teachingGuidanceFeature,
    analogiesFeature,
    stepwiseSolvingFeature,
    diagramsFeature,
    mathFiguresFeature,
    calculatorFeature,
    practiceFeature,
    questionSetsFeature,
  ],
  defaultSurface: "figure",
  hidden: false,
  context: {
    attachCurriculum: true,
    attachProgress: true,
    attachTeachingWorkspace: false,
    attachTeachingPolicy: false,
    attachFigureContext: true,
  },
  runtime: {
    kind: "primary",
    prompt: MATH_BUDDY_PROMPT,
  },
})
```

`defineBuddyPersona` no longer accepts `tools`, `skills`, `subagents`, or `surfaces`.

Add resolved runtime output.

```ts
type TeachingWorkspaceState = "inactive" | "active"

type ResolvedSessionRuntime = {
  persona: Persona
  teachingWorkspaceState: TeachingWorkspaceState
  access: {
    tools: Record<string, "allow" | "deny">
    skills: Record<string, "allow" | "deny">
    subagents: Record<string, "allow" | "deny">
  }
  ui: {
    visibleSurfaces: Surface[]
    defaultSurface: Surface
  }
}
```

Replace `resolveCapabilityProfile` with:

```ts
resolveSessionRuntime({
  persona,
  teachingWorkspaceState,
  configuredToolToggles,
})
```

`visibleSurfaces` is derived from `persona.features.flatMap(feature => feature.surfaces)`. `defaultSurface` stays on the persona and must be included in the derived surfaces.

## Final Feature Set

Use these feature IDs as the stable access units:

```txt
curriculum
curriculum-planning
memory
standards
reading
teaching-guidance
analogies
stepwise-solving
debug-guidance
diagrams
math-figures
calculator
lesson-workspace
practice
assessment
question-sets
flashcards
```

Persona feature assignments:

```ts
buddy = [
  curriculumFeature,
  memoryFeature,
  standardsFeature,
  readingFeature,
  teachingGuidanceFeature,
  analogiesFeature,
  stepwiseSolvingFeature,
  diagramsFeature,
  curriculumPlanningFeature,
  questionSetsFeature,
  flashcardsFeature,
]
```

```ts
codeBuddy = [
  curriculumFeature,
  memoryFeature,
  standardsFeature,
  readingFeature,
  teachingGuidanceFeature,
  debugGuidanceFeature,
  diagramsFeature,
  lessonWorkspaceFeature,
  practiceFeature,
  assessmentFeature,
  questionSetsFeature,
]
```

```ts
mathBuddy = [
  curriculumFeature,
  memoryFeature,
  standardsFeature,
  readingFeature,
  teachingGuidanceFeature,
  analogiesFeature,
  stepwiseSolvingFeature,
  diagramsFeature,
  mathFiguresFeature,
  calculatorFeature,
  practiceFeature,
  questionSetsFeature,
]
```

```ts
readingBuddy = [
  curriculumFeature,
  memoryFeature,
  standardsFeature,
  readingFeature,
  teachingGuidanceFeature,
  diagramsFeature,
  practiceFeature,
  assessmentFeature,
  questionSetsFeature,
]
```

Derived surfaces:

```txt
buddy        -> curriculum, question-set, flashcard
code-buddy   -> curriculum, editor, question-set
math-buddy   -> curriculum, figure, question-set
reading-buddy -> curriculum, question-set
```

## Final File Tree

```txt
packages/buddy/src/learning/
  access/
    build-runtime-permissions.ts
    resolve-session-runtime.ts
    types.ts

  adapters/
    http/
      lesson-workspace/
      session/

  agent-execution/
    permissions/
      runtime-session-permissions.ts
      session-permissions.ts
    state/
      session-state.ts
      transform-state.ts
    transforms/
      command-transform.ts
      message-transform.ts
      message-transform-orchestration.ts
      types.ts

  features/
    analogies/
      feature.ts
      skills/
        analogy/
          SKILL.md
          index.ts
          references/
            internal-scaffolds.md

    assessment/
      feature.ts
      subagents/
        assessment.md
        assessment.ts

    calculator/
      feature.ts
      tools/
        python-calculator.md
        python-calculator.ts

    curriculum/
      feature.ts

    curriculum-planning/
      feature.ts
      planning/
        persistence/
      subagents/
        goal-writer.md
        goal-writer.ts
        orchestrator.md
        orchestrator.ts
      tools/
        commit-goal.ts
        decide-goal-scope.ts
        goal-state.ts
        lint-goal.ts
      types.ts

    debug-guidance/
      feature.ts
      tools/
        debug-attempt.md
        debug-attempt.ts

    diagrams/
      errors.ts
      feature.ts
      service/
        normalize.ts
        path.ts
        read.ts
        render.ts
        repair.ts
        types.ts
        validate.ts
      tools/
        render-mermaid.md
        render-mermaid.ts

    flashcards/
      errors.ts
      feature.ts
      storage/
        path.ts
        read-deck.ts
        review.ts
        save-deck.ts
        scheduler.ts
      subagents/
        flashcard-author.md
        flashcard-author.ts
      tools/
        save-flashcard-deck.md
        save-flashcard-deck.ts
      types.ts

    lesson-workspace/
      feature.ts
      model/
        types.ts
      paths/
        path.ts
      service/
        diagnostics.ts
        errors.ts
        operations.ts
        workspace.ts
      tools/
        add-file.md
        add-file.ts
        checkpoint.md
        checkpoint.ts
        restore-checkpoint.md
        restore-checkpoint.ts
        set-lesson.md
        set-lesson.ts
        start-lesson.md
        start-lesson.ts
        write-without-prompt.ts

    math-figures/
      errors.ts
      feature.ts
      freeform/
        errors.ts
        io.ts
        lint.ts
        path.ts
        render.ts
        sanitize.ts
        types.ts
      geometry/
        errors.ts
        path.ts
        read-figure.ts
        render-figure.ts
        render.ts
        repair.ts
        resolve.ts
        types.ts
        validate.ts
      tools/
        render-figure.md
        render-figure.ts
        render-freeform-figure.md
        render-freeform-figure.ts

    memory/
      feature.ts
      fixtures/
        default-fixtures.ts
      goals/
        storage.ts
      runtime/
        snapshot.ts
      subagents/
        memory-consolidator.md
        memory-consolidator.ts
      tools/
        search-memory.ts
        update-memory.ts
      attention-gate.ts
      consolidation.ts
      deterministic.ts
      evaluation.ts
      evidence.ts
      extractor.md
      extractor.ts
      index-store.ts
      index.ts
      internal-session.ts
      lab-context.ts
      lab.ts
      maintenance.ts
      markdown.ts
      memory-registry-markdown.ts
      models.ts
      paths.ts
      redaction.ts
      retrieval.ts
      session-extraction.ts
      session-source.ts
      settings.ts
      stage-one-store.ts
      startup.ts
      storage.ts
      text-budget.ts
      tuning.ts
      types.ts

    practice/
      feature.ts
      subagents/
        practice.md
        practice.ts

    question-sets/
      errors.ts
      feature.ts
      storage/
        path.ts
        read-artifact.ts
        save-artifact.ts
        submit-attempt.ts
      subagents/
        question-set-author.md
        question-set-author.ts
      tools/
        save-question-set.md
        save-question-set.ts
      types.ts

    reading/
      feature.ts
      skills/
        reading/
          SKILL.md
          index.ts
          references/
            nonfiction.md
      tools/
        ingest-full-text.md
        ingest-full-text.ts
        prepare-resource.md
        prepare-resource.ts

    standards/
      artifact.ts
      constants.ts
      feature.ts
      lockfile.ts
      path.ts
      service.ts
      tools/
        get-crosswalk.md
        get-crosswalk.ts
        get-learning-components.md
        get-learning-components.ts
        get-next-standards.md
        get-next-standards.ts
        get-prerequisites.md
        get-prerequisites.ts
        get-standard.md
        get-standard.ts
        parameters.ts
        query-standards-sql.md
        query-standards-sql.ts
        search-standards.md
        search-standards.ts
      types.ts

    stepwise-solving/
      feature.ts
      tools/
        stepwise-solve.md
        stepwise-solve.ts

    teaching-guidance/
      feature.ts
      skills/
        assess/
          SKILL.md
          index.ts
        compare-concepts/
          SKILL.md
          index.ts
        explain/
          SKILL.md
          index.ts
        learn/
          SKILL.md
          index.ts
        practice/
          SKILL.md
          index.ts
        worked-example/
          SKILL.md
          index.ts
      tools/
        reflection.md
        reflection.ts

    index.ts

  personas/
    buddy.ts
    code-buddy.ts
    define-buddy-persona.ts
    math-buddy.ts
    reading-buddy.ts
    registry.ts
    prompts/
      base.md
      buddy.md
      code-buddy.md
      math-buddy.md
      reading-buddy.md

  prompt/
    buddy-prompt-compiler.ts
    context.ts
    message-prompt-pipeline.ts
    teaching-workspace-policy.md
    runtime-context/
    template/
    user-prelude/
    utils.ts
    workspace-file-references.ts

  runtime/
    create-buddy-tool.ts
    define-buddy-feature.ts
    define-buddy-skill.ts
    define-buddy-subagent.ts
    dynamic-tool-catalog.ts
    dynamic-tool-grants.ts
    dynamic-tool-metadata.ts
    dynamic-tool-permissions.ts
    dynamic-tool-search.ts
    feature-registry.ts
    register-agents.ts
    register-tools.ts
    tool-registry.ts

  shared/
    learner-context-delivery.ts
    runtime-types.ts
    targeting.ts
    teaching-session-state.ts
    teaching-vocabulary.ts

  skill-management/
    README.md
    index.ts
    managed-buddy-skills.ts
    service.ts
    service/
      catalog.ts
      contracts.ts
      discovery.ts
      documents.ts
      library.ts
      mutations.ts
      paths.ts
      permissions.ts
      system-installer.ts
```

## Naming Changes

Skill names and directories:

```txt
buddy-pedagogy-learn              -> learn
buddy-pedagogy-practice           -> practice
buddy-pedagogy-assess             -> assess
buddy-pedagogy-explanation        -> explain
buddy-pedagogy-worked-example     -> worked-example
buddy-pedagogy-concept-contrast   -> compare-concepts
buddy-pedagogy-reading-assistant  -> reading
buddy-pedagogy-analogy            -> analogy
```

Tool IDs:

```txt
pedagogy_prepare_resource              -> prepare_resource
pedagogy_resource_ingest_full_text     -> ingest_full_text
pedagogy_reflection                    -> reflection
pedagogy_reflection_dynamic            -> reflection_dynamic
pedagogy_stepwise_solve                -> stepwise_solve
pedagogy_stepwise_solve_dynamic        -> stepwise_solve_dynamic
pedagogy_debug_attempt                 -> debug_attempt
pedagogy_debug_attempt_dynamic         -> debug_attempt_dynamic
```

State/type names:

```txt
workspaceState                         -> teachingWorkspaceState
"chat" workspace state                 -> "inactive"
"interactive" workspace state          -> "active"
CapabilityEnvelope                     -> ResolvedSessionRuntime
capabilityEnvelope                     -> sessionRuntime
tool capability                        -> tool constraints
LearningToolGroup                      -> BuddyFeature
```

Keep these API names:

```txt
createBuddyTool
defineBuddySubagent
defineBuddyPersona
```

Add these API names:

```txt
defineBuddyFeature
defineBuddySkill
resolveSessionRuntime
```

## Implementation Steps

1. Add `defineBuddyFeature`, `defineBuddySkill`, and the new `resolveSessionRuntime` path while keeping existing behavior temporarily wired through compatibility exports.

2. Update `createBuddyTool` to accept `constraints` instead of `capability`; migrate all tool definitions and delete surface-based constraints.

3. Update `defineBuddySubagent` to accept `tools`, `skills`, and `subagents` object references; keep `permission` only for OpenCode-native permissions.

4. Create feature definitions and move files with `git mv` into the final `features/*` tree.

5. Replace persona definitions so they list `features` and `defaultSurface` only for access/UI; remove persona-authored `tools`, `skills`, `subagents`, and `surfaces`.

6. Replace all `resolveCapabilityProfile` call sites with `resolveSessionRuntime`.

7. Replace runtime registration so it gathers all static tools from feature direct tools and feature subagent tools; keep dynamic tools registered through the dynamic load flow.

8. Rename `workspaceState` to `teachingWorkspaceState` through backend state, prompt context, web state, routes, tests, and snapshots.

9. Move skill-management code out of `learning/skills` into `learning/skill-management`; keep actual model skills only under `features/*/skills`.

10. Update frontend runtime/capabilities views to use `sessionRuntime` naming and one available subagents list.

## Old Vocabulary Removal Checks

These should return no Buddy-owned architecture usages after the refactor:

```sh
rg -n "capabilityEnvelope|CapabilityEnvelope|resolveCapabilityProfile" packages/buddy/src packages/web/src packages/buddy/test packages/web/test
rg -n "defineLearningToolGroup|LearningToolGroup|learning-tool-group|tool group" packages/buddy/src packages/buddy/test
rg -n "capability:|tool-capability|toolMatchesPersonaSurfaces" packages/buddy/src packages/buddy/test
rg -n "\"prefer\"|SubagentAccess.*prefer|subagents\\.prefer" packages/buddy/src packages/web/src packages/buddy/test packages/web/test
rg -n "PERSONA_SURFACES|workspaceState|\"interactive\"|\"chat\"" packages/buddy/src packages/web/src packages/buddy/test packages/web/test
rg -n "buddy-pedagogy|pedagogy_resource|pedagogy_" packages/buddy/src packages/web/src packages/buddy/test packages/web/test
rg -n "capabilities/" packages/buddy/src packages/buddy/test
```

Allowed exceptions:

```txt
chat route names
chat UI copy
CSS token names containing interactive
third-party markdown text where "surface" is plain English
```

## Test Plan

Update and run affected tests for `packages/buddy` and `packages/web`.

Required scenarios:

```txt
Feature registry rejects duplicate feature IDs.
Feature registry rejects duplicate tool IDs.
Feature registry rejects duplicate subagent IDs.
Skill loader reads name and description from SKILL.md.
Skill directory name matches SKILL.md name.
Persona defaultSurface must exist in derived feature surfaces.
math-buddy receives math figure tools; reading-buddy does not.
all personas receive Mermaid/diagrams without getting the figure surface.
flashcards exposes flashcard-author to buddy but not save_flashcard_deck directly to buddy.
flashcard-author receives ingest_full_text and save_flashcard_deck.
lesson-workspace tools are denied when teachingWorkspaceState is inactive.
lesson-workspace tools are allowed when teachingWorkspaceState is active.
dynamic teaching-guidance tools are discoverable only through enabled features.
subagent prefer no longer appears in resolved runtime or UI.
surface-based tool constraints no longer affect permissions.
```

Required checks:

```sh
bun fmt
bun lint
bun typecheck
```

Run package-targeted tests only for packages touched by the migration, not vendor tests or the full suite.

## Assumptions

Breaking changes are allowed.

No compatibility with old persona config shape is required.

Feature object references are used in authored TS code; string IDs are only for serialized runtime output, config, and diagnostics.

Skill prompt metadata stays in `SKILL.md`.

Subagent prompt behavior stays in markdown prompts; TS owns runtime wiring.

Feature `surfaces` are UI metadata, not tool constraints.

Tool constraints only represent real runtime requirements such as active teaching workspace or local runtime readiness.
