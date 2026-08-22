# Modularity Assessment: Honest Code Audit

## Verdict: Good Job — With a Few Real Blemishes

This is above average work. It's not perfect, and I'll be specific about where it falls short, but the overall shape is genuinely well-designed and the decisions that matter most were made correctly.

---

## What You Got Right (the hard stuff)

### 1. Features are truly self-contained — zero cross-feature imports at the feature boundary

Every single `feature.ts` file imports exactly one thing from outside its own directory: `defineBuddyFeature` from the runtime layer. That's it. No feature depends on another feature's `feature.ts`.

```
analogies/feature.ts      → imports: defineBuddyFeature ✅
calculator/feature.ts     → imports: defineBuddyFeature ✅
flashcards/feature.ts     → imports: defineBuddyFeature ✅
math-figures/feature.ts   → imports: defineBuddyFeature ✅
reading/feature.ts        → imports: defineBuddyFeature ✅
teaching-guidance/feature.ts → imports: defineBuddyFeature ✅
...all 18 features: same pattern
```

This is the most important property for pluggability. You can add a feature, remove a feature, or recompose features into different personas without touching any other feature. **This alone puts the architecture above average.**

### 2. The composition model is clean and uniform

The `Feature → Persona → Runtime` compilation pipeline is well-separated:

```
defineBuddyFeature({ tools, skills, subagents, surfaces })
    ↓
defineBuddyPersona({ features: [...], defaultSurface, context })
    ↓
buildPersonaProfileFromDefinition() → PersonaDefinition
    ↓
compileRuntimeLearningToolPermissions() → allow/deny maps
```

Each step has a single responsibility. The persona doesn't know how permissions compile. The feature doesn't know what persona uses it. The permission compiler doesn't know what features exist.

### 3. Object references over string IDs at authoring time

Subagents receive tool objects, not tool ID strings:

```ts
// Good — flashcard-author gets the actual tool object
tools: [ingestFullTextTool, saveFlashcardDeckTool]
```

String IDs are only used at the serialized runtime boundary. This means the type system catches broken references at compile time, and you can refactor tool IDs without grep-and-pray.

### 4. Dynamic tools are properly layered

The search → load → grant → cleanup lifecycle is well-separated:
- `dynamic-tool-catalog.ts` — metadata registry
- `dynamic-tool-search.ts` — BM25-style matching
- `dynamic-tool-grants.ts` — session-scoped permission grants
- `dynamic-tool-discovery.ts` — the tools that let the model drive the flow

Each file has a clear single responsibility. The catalog doesn't know about sessions. The grant system doesn't know about search scoring.

### 5. Skills are just markdown files with a thin registration wrapper

```ts
export const readingSkill = defineBuddySkill({
  file: new URL("./SKILL.md", import.meta.url),
  content: READING_SKILL_CONTENT,
})
```

Skills don't have runtime code. They're documents. This is exactly right — skills are model guidance, not program logic. The `defineBuddySkill` wrapper just validates frontmatter and extracts metadata. Minimal ceremony, maximum portability.

### 6. The feature registry validates at startup

```ts
function validateFeatureSet(features) {
  // rejects duplicate feature IDs
  // rejects duplicate tool IDs
  // rejects duplicate subagent IDs
}
```

Catching composition errors at initialization rather than at runtime is the right call. It means you can't accidentally wire two features that share a tool ID without failing fast.

---

## What You Got Wrong (or at least not-great)

### 1. Cross-feature implementation imports exist and create invisible coupling

While `feature.ts` files are clean, the **implementation files inside features** do reach across feature boundaries:

| Source | Imports From | Why |
|--------|-------------|-----|
| `flashcards/subagents/flashcard-author.ts` | `reading/tools/ingest-full-text` | Subagent needs a tool from another feature |
| `lesson-workspace/service/operations.ts` | `memory/storage`, `memory/deterministic`, `memory/evidence` | Workspace operations write learner events |
| `question-sets/storage/submit-attempt.ts` | `memory/evidence` | Attempt submission records evidence |
| `flashcards/storage/review.ts` | `memory/evidence` | Review records evidence |
| `curriculum-planning/tools/commit-goal.ts` | `memory/goals/storage` | Goal commits write to memory |
| `curriculum-planning/tools/goal-state.ts` | `memory/goals/storage` | Goal state reads from memory |

**The impact**: Memory is a shared service that 4+ features depend on, but it's defined as a feature rather than as shared infrastructure. If you ever wanted to remove or replace the memory feature, you'd need to update flashcards, lesson-workspace, question-sets, and curriculum-planning. That's not pluggable.

The flashcard-author importing `ingestFullTextTool` from the reading feature is a design choice — the subagent deliberately shares a tool across features. It works because you pass tool objects directly. But it means flashcards and reading aren't independently removable.

> [!IMPORTANT]
> **Memory should arguably be `shared/` infrastructure, not a feature.** It acts as a service that multiple features depend on, not a composable capability unit. Alternatively, features should depend on a memory _contract_ (interface), not the memory implementation.

### 2. Persona prompt overlays bypass the feature model

The most important behavioral differences between personas live in prompt markdown files, not in the feature system:

- `math-buddy.p.md` — 85 lines of figure/calculator protocol
- `reading-buddy.p.md` — 87 lines of reading grounding rules

These prompts reference specific tool names (`render_figure`, `python_calculator`, `ingest_full_text`) but aren't connected to the feature that owns those tools. If you rename `render_figure`, the feature definition and the prompt overlay need to be updated independently. There's no compile-time or startup-time check that catches this.

This isn't necessarily wrong — prompt text is inherently stringly-typed — but it means the feature model is precise for **permissions** and loose for **behavior**. The system knows exactly which tools math-buddy can call, but the guidance for _how_ to call them lives in an unconnected markdown file.

### 3. Context attachment flags are persona-level, not feature-derived

```ts
context: {
  attachCurriculum: true,
  attachProgress: true,
  attachTeachingWorkspace: false,
  attachTeachingPolicy: false,
  attachFigureContext: true,  // only math-buddy sets this
}
```

This is manually specified per persona. But `attachFigureContext` should logically be derived from whether `mathFiguresFeature` is in the persona's feature list. The fact that it isn't means the context attachment system is a second, parallel way of expressing "what this persona can do" that can drift from the feature list.

### 4. The `feature-registry.ts` has a global singleton cache

```ts
let cachedFeatures: DefinedBuddyFeature[] | undefined

function validatedFeatures(): DefinedBuddyFeature[] {
  if (cachedFeatures) return cachedFeatures
  const features = [...ALL_BUDDY_FEATURES]
  validateFeatureSet(features)
  cachedFeatures = features
  return features
}
```

This works for single-process, but it means the feature set is process-global and can't be composed differently for different contexts within the same process. For where you are today (single-user, single-machine), this is fine. But it's a modularity ceiling — you can't have two different feature sets active simultaneously.

### 5. `register-tools.ts` registers ALL feature tools regardless of persona

```ts
for (const feature of allBuddyFeatures()) {
  const featureTools = collectFeatureTools(feature)
  // registers everything unless explicitly flagged off
}
```

This registers the superset of all tools across all features, then uses persona-level permission deny/allow to filter what the model sees. The filtering is correct, but it means every tool from every feature is always initialized and registered in the OpenCode adapter. Removing a feature from a persona doesn't reduce runtime initialization cost — it only hides tools via permissions.

This is a design trade-off, not a bug. But it means features are pluggable at the _access_ layer, not at the _initialization_ layer.

### 6. Persona runtime wiring duplicates what features should derive

```ts
// buddy.ts
runtime: {
  kind: "build",
  prompt: "",
  permission: { todoread: "deny", todowrite: "deny" },
  subagents: {
    "question-set-author": true,
    "flashcard-author": true,
    general: true,
    "learner-memory-consolidator": true,
  },
}
```

The `subagents` map here is a manual re-listing of subagent keys that should be derivable from `persona.features.flatMap(f => f.subagents)`. You have `deriveRuntimePersonaSubagents` in `persona-profiles.ts` that does this derivation, but then the persona definition _also_ specifies subagents manually, and the manual list wins when present. This creates a risk of feature-list and subagent-list drift.

---

## Scorecard

| Dimension | Grade | Notes |
|-----------|-------|-------|
| **Feature isolation at boundary** | A | Zero cross-feature imports in `feature.ts` files |
| **Composition model** | A- | Clean pipeline; context flags are the weak spot |
| **Type safety** | A | Object refs over strings, const generics, clean types |
| **Dynamic tool lifecycle** | A | Search → load → grant → cleanup is well-separated |
| **Skill design** | A | Markdown-first, thin registration, no runtime coupling |
| **Cross-feature coupling in implementations** | C+ | Memory is a shared service masquerading as a feature |
| **Prompt-to-feature coherence** | C | Prompt overlays reference tools without any structural connection |
| **Initialization vs. access separation** | B- | Tools register globally, permissions filter per-persona |
| **Derivation vs. duplication** | B- | Context flags and subagent maps partially duplicated vs. derived |

## Overall: B+ / Good

You've done a good job. The decisions that are hardest to fix later — the composition model, the feature boundary, the dynamic tool lifecycle — are done well. The things that are weaker — memory coupling, prompt coherence, derivation gaps — are all fixable without architectural changes.

The fact that the persona collapse question is even askable is proof the modularity is working. In a poorly modular system, you wouldn't be able to reason about "just merge the feature lists and convert prompts to skills." You can because the feature boundaries are real.

**Where this sits relative to the broader space**: better than most production codebases I see at this scale, not yet at the level of something like a well-designed plugin system (e.g., VS Code extensions, Figma plugins). The gap is mostly that features are pluggable at the authoring/access layer but not at the initialization layer, and memory is a shared service without a proper contract boundary.
