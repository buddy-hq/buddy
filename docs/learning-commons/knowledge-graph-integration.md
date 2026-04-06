# Knowledge Graph Integration for Buddy

## Recommendation

Buddy should integrate Knowledge Graph as a **local standards intelligence layer**, not as a new top-level product mode.

It should:

- help resolve vague topics into standards
- expose prerequisite and progression structure
- decompose standards into teachable skills
- feed existing Buddy systems: goals, practice, assessment, learner memory, and question sets

It should **not** try to become a curriculum browser or ship full lesson content, because the dataset does not contain full lesson bodies or question banks.

## Why This Fits Buddy

Buddy already has the right architecture:

- local backend process with routes in `packages/buddy/src/index.ts`
- tool-based runtime in `packages/buddy/src/learning/tools/tool-catalog.ts`
- goals as first-class artifacts in `packages/buddy/src/learning/curriculum/goals/tools/`
- learner memory as file-first artifacts in `packages/buddy/src/learning/learner-model/`
- practice and assessment already recorded against goal IDs

The best use of Knowledge Graph is to improve the **quality of planning and sequencing** inside that existing system.

## Product Position

Knowledge Graph should power four product behaviors.

### 1. Standards-aware goal planning

When the learner says:

> I want to learn fractions

Buddy should:

1. search relevant standards
2. choose or suggest a standard / standard cluster
3. generate testable goals grounded in that standard
4. store normal Buddy goals with references to the standard

This fits Buddy's current principle that goals drive everything.

### 2. Prerequisite-aware remediation

When the learner says:

> I'm stuck on 6.NS.B.4

Buddy should:

1. resolve the standard
2. fetch prerequisite standards / prior progression
3. fetch supporting learning components
4. generate catch-up practice before continuing

This is the highest-value use case.

### 3. Better practice and assessment generation

Knowledge Graph should improve:

- targeted practice prompts
- concept checks
- mastery checks
- transfer tasks

Example:

- target standard: `HSG-CO.B.6`
- learning components:
  - `Given two figures, use the definition of congruence in terms of rigid motions to decide if they are congruent`
  - `Use descriptions of rigid motion and transformed geometric figures to predict the effects rigid motion has on figures in the coordinate plane`

Buddy can use those components to generate narrower, more teachable tasks.

### 4. Crosswalk support

When the learner changes states or needs alignment:

> I learned math in Texas. What's the California equivalent?

Buddy should use standard alignment data to map standards across jurisdictions.

This is valuable, but lower priority than prerequisites.

## What Buddy Should Not Do Initially

- no separate "Knowledge Graph" tab or mode
- no raw graph browsing UI
- no attempt to ship all curriculum metadata to the main UX
- no hosted Learning Commons MCP dependency in core flows
- no auto-mutating learner goals from graph structure without explicit tool use

The graph should stay mostly invisible to the learner.

## Data Strategy

### Shipping format

Use a **local SQLite database compressed with zstd**.

Why:

- fits Buddy's local-first model
- much faster runtime queries than raw JSONL
- easy to version and replace
- works well with Buddy's Bun backend

### Recommended packaged scope

Phase 1 package:

- `StandardsFrameworkItem`
- `LearningComponent`
- relationship types:
  - `supports`
  - `hasChild`
  - `buildsTowards`
  - `hasStandardAlignment`

Optional in later phase:

- `hasEducationalAlignment`
- lesson / activity / assessment metadata

### Recommended initial content scope

Start with:

- `Multi-State` Math and ELA

Reason:

- best size / value tradeoff
- Common Core covers many Buddy use cases
- enough to prove goal planning + prerequisite remediation

Then add:

- state packs
- additional subjects

## Tool Strategy

Do **not** depend on the hosted Learning Commons MCP in core product behavior.

It is useful as inspiration, not as the product dependency.

Buddy should implement local tools with the same basic jobs.

### Required local tools

1. `search_standards`
2. `get_standard`
3. `get_learning_components`
4. `get_prerequisites`
5. `get_next_standards`
6. `get_crosswalk`

### Why tools, not prompt stuffing

The agent cannot use the graph reliably without explicit retrieval primitives.

Tools let the model:

- resolve exact codes like `6.NS.B.4`
- search by topic like `fractions`
- fetch structured prerequisites
- fetch granular skills for practice generation

## Recommended Product Flow

### Flow A: Topic -> goals -> practice

1. learner asks to study a topic
2. Buddy calls `search_standards`
3. Buddy either picks a likely standard or asks a short disambiguation question
4. Buddy writes normal Buddy goals
5. goals include standard references in metadata / concept tags
6. Buddy moves into practice using learning components

### Flow B: Stuck learner -> remediation

1. learner names a standard or a narrow topic
2. Buddy calls `get_standard`
3. Buddy calls `get_prerequisites`
4. Buddy checks learner artifacts for prior evidence / misconceptions
5. Buddy generates a short remediation ladder:
   - review prerequisite
   - one guided practice task
   - one independent task
   - one quick check
6. Buddy records outcomes against existing goal IDs

### Flow C: Assessment and follow-up

1. Buddy generates a concept check tied to goal IDs
2. learner submits attempt
3. Buddy records assessment and evidence as it already does
4. unresolved weaknesses become normal feedback / misconception artifacts
5. future sessions pull these back through `learner_snapshot_read`

This keeps Knowledge Graph as input to Buddy's current evidence loop, not a separate loop.

## Data Model Recommendation

Keep Knowledge Graph references lightweight inside Buddy.

### Goal artifacts

Add optional metadata fields such as:

- `standardCode`
- `standardJurisdiction`
- `standardCaseIdentifierUUID`
- `learningComponentRefs[]`

Do not replace Buddy goals with standards. Goals remain Buddy-native and testable.

### Learner profile / workspace context

Optionally allow:

- preferred jurisdiction
- preferred subject scope
- grade band

This improves search defaults without making standards mandatory.

## Development Pipeline

### Phase 0: Offline data prep

Build a repeatable import pipeline that:

1. downloads versioned KG data
2. filters to the selected scope
3. imports into SQLite
4. creates indexes
5. outputs a versioned compressed artifact

Example output:

- `kg-ccss-core-v1.7.0.db.zst`

### Phase 1: Local retrieval layer

Implement a local Buddy module, for example:

- `packages/buddy/src/learning/knowledge-graph/`

Responsibilities:

- open local DB
- run indexed queries
- normalize standard search / code lookup
- return Buddy-friendly result shapes

### Phase 2: Tool layer

Add tool definitions and register them in the normal learning tool catalog.

Important rule:

- expose semantics, not SQL

### Phase 3: Prompt and orchestration integration

Use KG tools in three places only:

- goal-writing / scoping flows
- practice generation
- assessment / remediation planning

Do not inject standards context into every conversation by default.

Retrieve only when relevant.

### Phase 4: Learner artifact integration

Persist standard references on goals and optionally on practice / assessment artifacts.

This enables:

- progress by standard
- remediation by prerequisite chain
- future spaced review by concept cluster

### Phase 5: UI exposure

Start small.

Good first UX:

- show resolved standard on a goal card
- show prerequisite warning when relevant
- show "based on standard X" on generated practice

Avoid building a graph explorer until the retrieval loop proves useful.

## MVP Recommendation

Ship this first:

1. local SQLite pack for `Multi-State` Math + ELA
2. tools:
   - `search_standards`
   - `get_standard`
   - `get_learning_components`
   - `get_prerequisites`
3. goal metadata for standard refs
4. practice generation that uses learning components
5. remediation flow when learner is stuck

Do **not** ship first:

- hosted MCP integration
- curriculum alignment UI
- full lesson / activity surfaces
- all-state packs

## Success Criteria

Product success looks like:

- Buddy creates more precise goals from vague subject requests
- Buddy gives better remediation when the learner is stuck
- practice is more targeted and less generic
- learner memory stays in Buddy artifacts, not in graph-specific state
- the learner does not need to understand the graph to benefit from it

## Example End-to-End

Learner says:

> I'm struggling with rigid motions and congruence.

Buddy should:

1. resolve likely target standard `HSG-CO.B.6`
2. retrieve its learning components
3. retrieve prerequisites:
   - `8.G.A.2`
   - `HSG-CO.A.5`
4. check learner evidence and misconceptions
5. write or refine topic goals
6. generate one guided practice task on the missing prerequisite
7. generate one transfer check for the target standard
8. record outcomes in the existing learner artifact flow

That is the right product pattern: **graph-informed Buddy behavior, not graph-centric Buddy UX**.

---

## Implementation File References

Use these existing Buddy files as reference when implementing:

### Tool System Patterns

- `packages/buddy/src/learning/tools/tool-catalog.ts` — how tool groups are organized
- `packages/buddy/src/learning/tools/create-buddy-tool.ts` — base tool factory
- `packages/buddy/src/learning/curriculum/goals/tools/decide-scope.ts` — example tool with LLM reasoning
- `packages/buddy/src/learning/curriculum/goals/tools/state.ts` — example query tool
- `packages/buddy/src/learning/learner-model/tools/query.ts` — learner state query pattern

### Goal System

- `packages/buddy/src/learning/curriculum/goals/tools/tools.ts` — goal tool group
- `packages/buddy/src/learning/curriculum/goals/types.ts` — goal schemas
- `packages/buddy/src/learning/curriculum/goals/writer.agent.ts` — goal-writing agent
- `packages/buddy/src/learning/learner-model/repository/types.ts` — artifact schemas including GoalArtifact

### Learner Model

- `packages/buddy/src/learning/learner-model/ARCHITECTURE.md` — learner system design
- `packages/buddy/src/learning/learner-model/index.ts` — public API surface
- `packages/buddy/src/learning/learner-model/tools/tools.ts` — learner tool exports
- `packages/buddy/src/learning/learner-model/workflows/record-practice.ts` — practice workflow
- `packages/buddy/src/learning/learner-model/workflows/record-assessment.ts` — assessment workflow

### Intent Capabilities

- `packages/buddy/src/learning/intents/learn/capabilities.ts` — learn intent tools
- `packages/buddy/src/learning/intents/practice/capabilities.ts` — practice intent tools
- `packages/buddy/src/learning/intents/assess/capabilities.ts` — assess intent tools

### Persona Configuration

- `packages/buddy/src/learning/personas/registry.ts` — persona definitions and tool defaults
- `packages/buddy/src/learning/personas/buddy/agent.ts` — general buddy agent config
- `packages/buddy/src/learning/personas/math-buddy/agent.ts` — math-focused persona

### Routes / API Surface

- `packages/buddy/src/routes/learner.ts` — learner HTTP routes
- `packages/buddy/src/routes/teaching.ts` — teaching workspace routes
- `packages/buddy/src/index.ts` — main app router

### Pedagogy Tools (Where Practice Generation Lives)

- `packages/buddy/src/learning/capabilities/pedagogy/tools/definitions.ts` — pedagogy tool definitions
- `packages/buddy/src/learning/capabilities/question-set/service.ts` — question set generation

### Where to Add New Code

**New module location:**
```
packages/buddy/src/learning/knowledge-graph/
  ├── service.ts          # DB queries and normalization
  ├── tools/
  │   ├── tools.ts        # tool group export
  │   ├── search.ts       # search_standards tool
  │   ├── get.ts          # get_standard tool
  │   ├── components.ts   # get_learning_components tool
  │   ├── prereqs.ts      # get_prerequisites tool
  │   └── crosswalk.ts    # get_crosswalk tool
  ├── types.ts            # KG-specific type definitions
  └── register.ts         # tool registration helper
```

**Tool registration:**
- Add to `packages/buddy/src/learning/tools/tool-catalog.ts` under a new `knowledgeGraph` group
- Follow pattern of `goalTools`, `learnerTools`

**Goal metadata extension:**
- Extend `GoalArtifactSchema` in `packages/buddy/src/learning/learner-model/repository/types.ts`
- Add optional standard reference fields

**Data asset location:**
```
packages/buddy/assets/knowledge-graph/
  └── ccss-core-v1.7.0.db.zst   # compressed SQLite pack
```

**First-run setup:**
- Decompress to app data directory (follow pattern in existing first-run initialization)
- Open with Bun SQLite on backend startup

### Data Import Pipeline (Offline)

Location for import scripts:
```
scripts/knowledge-graph/
  ├── download.sh         # fetch versioned JSONL
  ├── filter.ts           # filter to scope
  ├── import.ts           # JSONL → SQLite
  ├── index.ts            # create indexes
  └── compress.ts         # zstd compression
```

### Testing Reference

- `packages/buddy/test/learning/` — existing learning system tests
- Follow patterns for tool testing and workflow testing
- Test tools in isolation, test workflows with full artifact lifecycle

### External Data Location

- `~/Code/learning-commons/knowledge-graph/` — cloned repo with downloaded JSONL files
- `~/Code/learning-commons/knowledge-graph/nodes.jsonl` — standards and components
- `~/Code/learning-commons/knowledge-graph/relationships.jsonl` — edges and alignments
