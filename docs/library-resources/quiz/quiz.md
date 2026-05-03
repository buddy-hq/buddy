
# How To Use This Document

Use this document in this order during implementation:

1. Start with the engineering plan.
   - This is the implementation source of truth.
   - It locks the chosen architecture, interfaces, defaults, and test expectations.
   - If an engineer needs to know what to build, this section should be enough.
2. Use the product plan to understand the intended behavior.
   - This explains ownership, flow, context, persistence, and UI expectations in product terms.
   - It should stay aligned with the engineering plan, but it is secondary to the engineering plan for implementation details.
3. Use the appendices as reference material.
   - They explain why certain decisions were made.
   - They document how Buddy native subagents work and how Perseus models MCQ and grouped questions.
   - They are there to guide data-model and runtime decisions, not to override the implementation plan.

If there is ever a conflict:

- engineering plan wins for implementation details
- product plan wins for user-facing intent
- appendices are explanatory reference, not the primary spec

maintain a log file in docs/quiz/log.md for your checklist and logging updates.

make sure you never edit the quiz.md file. make sure to refer to quiz.md if your context is compacted.

also make sure typechecks pass, tests pass and the bun run dev:desktop:electron and build command runs.

REMEMBER: tauri is legacy; we are not worried about it's test, its code and so on. we are only worried about electron and web. 

skills for how to follow react best practices and how to design lie here /Users/prashantbhudwal/Code/buddy/.agents/skills

refer to them when needed


# Engineering plan 

## Summary

The plan is implementation-ready now. No further product decisions are required.

Locked defaults:
- Retry policy: allow multiple attempts; each submit creates a new attempt record.
- Feedback policy: show full review immediately after submit.
- Learner-memory policy: write a summarized learner record for every attempt.
- Default group type when unspecified: `quiz`.
- Sidebar scope: workspace/notebook-scoped, matching the Mermaid artifact pattern.
- Data model root: use a generic `question-set.v1` artifact with `groupType`.

## Key Changes

### Runtime ownership
- Buddy remains the primary agent and orchestrator.
- `question-set-author` is a native subagent under Buddy.
- `question-set-author` generates the full answerful MCQ question-set payload and persists it via `save_question_set`.
- Buddy receives only the small handoff and calls `render_saved_question_set(artifactID)` so the main session owns the inline render.

### Persistence and grading
- Persist one immutable answerful `question-set.v1` artifact per generated group.
- Persist one append-only `question-set-attempt.v1` record per submission.
- Grade attempts deterministically in backend code, never with an agent.
- Use the saved answerful artifact as the grading source of truth.
- Expose only an answerless/public projection to the UI before submission.

### Public interfaces
- `save_question_set`
  - input: full answerful MCQ question-set payload
  - output: `artifactID`, `title`, `questionCount`, `groupType`
- `render_saved_question_set`
  - input: `artifactID`
  - output: render metadata plus answerless/public question-set payload or reference
- `GET /question-set-artifacts`
  - returns public answerless question-set artifacts for sidebar listing
- `GET /question-set-artifacts/:artifactID`
  - returns public answerless question-set artifact for rehydration
- `POST /question-set-artifacts/:artifactID/attempts`
  - input: `answers: Array<{ questionID; selectedChoiceIds: string[] }>`
  - output: evaluated result with total score, per-question correctness, selected IDs, correct IDs, explanations, and rationales needed for full review

### MCQ data shape
- Use a Buddy-native `QuestionSetArtifact` wrapper with typed questions.
- For V1, every question is `type: "mcq"` and carries a Perseus-inspired answerful `payload`.
- Do not persist a separate authored rubric object for MCQ.
- Derive the public render payload and deterministic grading rubric from the saved answerful MCQ payload.
- Attempt input remains `selectedChoiceIds`.

## Test Plan

- Generate a question set through the subagent and verify the parent session renders it by `artifactID` without re-emitting the full payload.
- Verify public artifact reads never expose `correct` flags or hidden rationale data before submission.
- Grade single-select MCQ correctly.
- Grade multi-select MCQ correctly.
- Reject invalid choice IDs.
- Verify grading derives its rubric from the saved answerful payload rather than a separately authored rubric object.
- Enforce `countChoices` when enabled.
- Enforce `none of the above` exclusivity when enabled.
- Confirm each retry creates a new attempt record and a new learner-memory write.
- Confirm full review UI shows score, per-question correctness, explanation, and rationale after submit.
- Confirm unspecified `groupType` defaults to `quiz`.

## Assumptions

- `question.tsx` is unrelated and must not be reused for question-set rendering.
- The question-set sidebar uses the existing workspace artifact pattern rather than a chat-only artifact scope.
- Learner-memory writes are summaries, not raw question-set payload copies.
- V1 supports only MCQ and multi-select; no partial streaming, free-response grading, or notebook-wide context discovery UI.


--- 
# Product Plan

## Scope

V1 is for MCQ and multi-select question sets.

Goals:

- Buddy stays the primary agent.
- Question-set generation happens through a native Buddy subagent.
- The question-set subagent generates the question-set content and persists it.
- Question sets render inline in chat and also appear in the right sidebar.
- Question-set attempts are graded deterministically by backend code.
- Generated question-set data, attempts, and learner-memory records are persisted separately.

Non-goals for V1:

- no separate top-level question-set agent
- no Perseus runtime
- no free-response grading
- no partial streaming of question-set questions
- no notebook-wide multi-chat context selection UI

## Core Decisions

### Buddy vs subagent

- `buddy` owns the learner-facing flow.
- `question-set-author` is a native subagent under Buddy.
- `question-set-author` generates the full structured MCQ question-set payload in one call, including answerful MCQ payloads for every question.
- `question-set-author` persists that authored payload through `save_question_set`.
- `question-set-author` does not grade attempts or write learner-memory records.

### Tool ownership

- `save_question_set` is called by `question-set-author`.
- `render_saved_question_set` is called by the main Buddy agent.
- Reason:
  - the subagent should own specialized question-set generation
  - the main Buddy session should own learner-facing display in the parent transcript
- This avoids re-emitting the full question-set payload from the main agent just to render it.

### Evaluation ownership

- User responses are checked by a backend question-set evaluation service, not by an agent.
- For MCQ, the saved answerful payload is the source of truth.
- The grading rubric is derived from that saved payload, not authored or persisted as a separate top-level object.
- For MCQ, grading should be deterministic:
  - compare `selectedChoiceIds`
  - validate selected IDs against saved choice IDs
  - enforce `countChoices` when present
  - enforce `none of the above` exclusivity when present
  - compute correctness
  - attach per-choice rationale and explanation data
- Agent reasoning is not needed for V1 grading.

### Persistence split

- Question-set artifact:
  - immutable answerful authored question-set document
- Question-set attempt:
  - append-only submitted answers + evaluation result
- Learner state:
  - summarized memory record written through `learner_practice_record` or `learner_assessment_record`

The rendered UI should use an answerless/public projection of the saved question-set artifact so the client does not receive `correct` flags or hidden rationale data before submission.

This keeps product UI state separate from learner-memory state.

## Responsibilities

### Main Buddy agent

- understand the learner request
- gather context from the current chat and shared resources
- decide whether a question set is appropriate
- delegate question-set authoring to `question-set-author`
- receive a small handoff from the subagent
- call `render_saved_question_set`
- optionally explain the result after backend grading completes

### `question-set-author` subagent

- take a bounded context bundle
- optionally read specific provided resources if Buddy points it at them
- generate a complete structured MCQ question-set payload
  - group metadata
  - all questions in the group
  - answerful MCQ payload for each question
- call `save_question_set`
- hand back a small machine-readable result such as:
  - `artifactID`
  - `title`
  - `questionCount`

### `save_question_set` tool

- validate the authored question-set payload
- persist a `question-set.v1` artifact
- return artifact metadata

### `render_saved_question_set` tool

- accept an `artifactID`
- load the saved question-set artifact
- derive an answerless/public render payload
- return metadata needed for inline rendering in the main Buddy session
- avoid requiring the parent agent to resend the full question-set payload

### question-set attempt route/service

- accept submitted answers
- load the referenced question-set artifact
- derive the MCQ rubric from the saved answerful payload
- grade deterministically against that derived rubric
- persist the attempt result
- write summarized learner-memory records
- return evaluated result payload to the UI

## Context Model

For V1, context should come from one chat session plus explicitly available resources.

Buddy should construct a context bundle for `question-set-author` instead of making the subagent discover everything itself.

The bundle should include:

- a concise summary of the current learner request
- a summary of relevant recent chat turns
- learner snapshot highlights if relevant
- goal IDs if the question set is tied to goals
- explicit resource references
  - local file paths
  - notebook resources
  - attachments the user already provided
- question-set constraints
  - number of questions
  - difficulty
  - topic boundaries
  - target `groupType`

V1 rule:

- Buddy should only ask `question-set-author` to read resources that Buddy has already identified as relevant.
- `question-set-author` should not wander the whole notebook by default.

## End-to-end Flow

1. The learner asks Buddy for a question set.
2. Buddy gathers context from the current chat, learner state, and explicit resources.
3. Buddy delegates to `question-set-author` with a narrow task and a context bundle.
4. `question-set-author` generates the complete structured answerful MCQ question-set payload for the whole group.
5. `question-set-author` calls `save_question_set`.
6. `save_question_set` persists the immutable question-set artifact and returns `artifactID`.
7. `question-set-author` hands `artifactID` and summary metadata back to Buddy.
8. Buddy calls `render_saved_question_set(artifactID)`.
9. `render_saved_question_set` loads the saved question set, strips answerful fields, and returns render metadata for the main session.
10. Web renders the question set inline in the transcript and lists it in the right sidebar.
11. The learner submits answers to `POST /question-set-artifacts/:artifactID/attempts`.
12. Backend loads the saved answerful question-set artifact and grades the attempt deterministically.
13. Backend persists the attempt and records learner state.
14. The evaluated result is returned to the UI and shown inline.
15. Buddy can optionally react to the graded result in follow-up conversation.

## Attempt Recording

“Attempts are submitted separately and recorded into learner state” means:

1. question-set generation and question-set attempts are different operations
2. the generated question-set artifact is not mutated when the learner submits answers
3. each submission creates a new attempt record
4. learner memory gets a summarized record, not the full raw UI artifact
5. grading uses the saved authored question-set artifact, not a fresh model call

Concretely:

- `save_question_set`
  - writes `question-set.v1/<artifactID>.json`
- `submit question-set attempt`
  - writes `question-set-attempt.v1/<attemptID>.json`
  - calls `learner_practice_record` or `learner_assessment_record`

Suggested learner-memory write behavior:

- use `learner_practice_record` when `groupType` is `practice`
- use `learner_assessment_record` when `groupType` is `assessment`
- use `learner_practice_record` by default in V1 when `groupType` is `quiz`

The learner-memory payload should be summarized, for example:

- goal IDs
- question-set title
- number correct / total
- weak concepts
- whether the learner completed, was partial, or got stuck
- surface: `"question-set"`

## V1 Data Shapes

```ts
type GroupType = "quiz" | "practice" | "assessment"

type QuestionSetArtifactBase = {
  artifactID: string
  kind: "question-set.v1"
  groupType: GroupType
  title: string
  instructions?: string
  contextSummary?: string
  createdAt: string
  createdBy: {
    sessionID: string
    messageID: string
    callID: string
    subagent: "question-set-author"
  }
}

type SavedQuestionSetArtifact = QuestionSetArtifactBase & {
  questions: SavedQuestion[]
}

type PublicQuestionSetArtifact = QuestionSetArtifactBase & {
  questions: PublicQuestion[]
}

type SavedQuestion = {
  id: string
  type: "mcq"
  prompt: string
  goalIds: string[]
  explanation?: string
  payload: SavedMcqPayload
}

type PublicQuestion = {
  id: string
  type: "mcq"
  prompt: string
  goalIds: string[]
  explanation?: string
  payload: PublicMcqPayload
}

type SavedMcqPayload = {
  multipleSelect: boolean
  countChoices?: boolean
  numCorrect?: number
  hasNoneOfTheAbove?: boolean
  randomize?: boolean
  choices: SavedMcqChoice[]
}

type SavedMcqChoice = {
  id: string
  content: string
  correct: boolean
  rationale?: string
  isNoneOfTheAbove?: boolean
}

type PublicMcqPayload = {
  multipleSelect: boolean
  countChoices?: boolean
  numCorrect?: number
  hasNoneOfTheAbove?: boolean
  randomize?: boolean
  choices: PublicMcqChoice[]
}

type PublicMcqChoice = {
  id: string
  content: string
  isNoneOfTheAbove?: boolean
}

type DerivedMcqRubric = {
  correctChoiceIds: string[]
  countChoices?: boolean
  hasNoneOfTheAbove?: boolean
  rationalesByChoiceId?: Record<string, string>
}

type QuestionSetAttemptAnswer = {
  questionID: string
  selectedChoiceIds: string[]
}

type QuestionSetAttemptRecord = {
  attemptID: string
  artifactID: string
  submittedAt: string
  answers: QuestionSetAttemptAnswer[]
  result: QuestionSetEvaluationResult
}

type QuestionSetEvaluationResult = {
  totalQuestions: number
  correctQuestions: number
  status: "completed" | "partial" | "stuck"
  questions: Array<{
    questionID: string
    correct: boolean
    selectedChoiceIds: string[]
    correctChoiceIds: string[]
    explanation?: string
    choices: Array<{
      choiceID: string
      selected: boolean
      correct: boolean
      rationale?: string
    }>
  }>
}
```

## UI Surface

Do not reuse `packages/web/src/components/chat/tools/render/question.tsx`.

That file is for the existing agent question flow, not the question-set product surface.

V1 should use a dedicated question-set render path:

- inline transcript rendering for the `render_saved_question_set` tool result
- a dedicated right-sidebar `question-set` tab/panel
- a dedicated attempt submission interaction

This should mirror the Mermaid product pattern, but with question-set-specific UI and data.

## Rough File Plan

### Backend

- add `question-set-author` subagent registration
- expose `question-set-author` from Buddy primary agent
- add `learning/capabilities/question-set/`
  - `types.ts`
  - `path.ts`
  - `service.ts`
  - `tools/save-question-set.ts`
  - `tools/render-saved-question-set.ts`
  - `tools/register.ts`
- add routes
  - `routes/question-set-artifacts.ts`
  - `POST /question-set-artifacts/:artifactID/attempts`

### Web

- add `render/question-set/`
  - `index.tsx`
  - `question-set-tool-card.tsx`
  - `question-set-inline-view.tsx`
- add `WorkspaceQuestionSetPanel`
- add `question-set` to right-sidebar tab/surface plumbing

## Existing Code Seams To Reuse

Native subagent pattern:

- `/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/personas/buddy/agent.ts`
- `/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/agent-factories.ts`
- `/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/curriculum/practice/practice.agent.ts`

Artifact + inline/sidebar rendering pattern:

- `/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/capabilities/figures/mermaid/tools/render-mermaid.ts`
- `/Users/prashantbhudwal/Code/buddy/packages/buddy/src/routes/mermaid-artifacts.ts`
- `/Users/prashantbhudwal/Code/buddy/packages/web/src/components/chat/tools/render/mermaid/index.tsx`
- `/Users/prashantbhudwal/Code/buddy/packages/web/src/components/layout/workspace-mermaid-panel.tsx`

Question-set surface plumbing gap to finish:

- `/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/shared/teaching-vocabulary.ts`
- `/Users/prashantbhudwal/Code/buddy/packages/web/src/components/layout/chat-right-sidebar.tsx`
- `/Users/prashantbhudwal/Code/buddy/packages/web/src/state/ui-preferences.ts`
- `/Users/prashantbhudwal/Code/buddy/packages/web/src/state/chat-actions.ts`

## Appendix: How Buddy Native Subagents Work

Buddy native subagents are not a separate product runtime. They are capabilities of the primary Buddy agent.

The important runtime behavior is:

1. Buddy exposes subagents through `availableSubagents`.
2. The shared factory converts those into `task` permissions.
3. When Buddy delegates, it uses the native `task` tool.
4. The `task` tool starts a separate subagent session and runs that subagent prompt.
5. The subagent result is returned to the parent session as text.
6. The parent agent then decides what to do next.

Relevant code seams:

- primary agent subagent list: `/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/personas/buddy/agent.ts`
- `availableSubagents` -> `task` permission wiring: `/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/agent-factories.ts`
- example native subagent: `/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/curriculum/practice/practice.agent.ts`
- native `task` tool runtime: `/Users/prashantbhudwal/Code/buddy/vendor/opencode/packages/opencode/src/tool/task.ts`
- tool execution runtime: `/Users/prashantbhudwal/Code/buddy/vendor/opencode/packages/opencode/src/tool/tool.ts`
- parent session loop after tool calls: `/Users/prashantbhudwal/Code/buddy/vendor/opencode/packages/opencode/src/session/prompt.ts`

Two consequences matter for question-set design.

### 1. A tool is local code, but the caller still has to emit the tool args

If the main Buddy agent calls a tool with the full question-set payload, the main agent has to output that payload in the tool arguments.

That means this flow is inefficient:

- Buddy calls `question-set-author`
- `question-set-author` generates full question-set JSON
- Buddy calls `render_question_set(fullQuestionSetJson)`

The parent ends up re-emitting the full question-set payload.

### 2. Subagent results do not automatically become parent-session artifacts

Today the native `task` tool returns the subagent result as text to the parent session. It does not automatically surface subagent tool renders as parent-session inline artifacts.

That is why this plan uses two separate tools:

- `save_question_set`
  - called by `question-set-author`
  - takes the full structured question set
  - validates and persists it
  - returns `artifactID`

- `render_saved_question_set`
  - called by the main Buddy agent
  - takes only `artifactID`
  - attaches the saved question set to the main session UI

This preserves the right ownership split:

- Buddy owns orchestration, context curation, and learner-facing flow.
- `question-set-author` owns specialized question-set generation.
- backend code owns persistence and deterministic grading.
- web owns rendering of the saved artifact.

### Why Buddy still prepares context

Even though `question-set-author` is specialized, Buddy should still prepare the context bundle before delegation.

That bundle should include only what the subagent actually needs:

- relevant chat summary
- learner snapshot highlights
- target goals or topic scope
- explicit user asks
- references to attached or locally available resources Buddy wants the subagent to read

This keeps the subagent focused and prevents it from guessing what context to inspect across the workspace.

## Appendix: Exact Perseus MCQ Schema

In Perseus, MCQ is the `radio` widget.

The important modeling detail is that the prompt does not live inside the radio options. The prompt lives in the surrounding `PerseusRenderer.content`, and the radio widget is referenced from that content through a widget slot.

### Item-Level Shape

```ts
type PerseusItem = {
  question: PerseusRenderer
  hints: Hint[]
  answerArea?: PerseusAnswerArea | undefined
}

type PerseusRenderer = {
  content: string
  widgets: PerseusWidgetsMap
  metadata?: any
  images: {
    [imageUrl: string]: PerseusImageDetail
  }
}
```

For an MCQ, the renderer content typically looks like:

```md
What is 2 + 2?

[[☃ radio 1]]
```

And `widgets["radio 1"]` holds the actual answer widget data.

### Widget Wrapper

```ts
type WidgetOptions<Type extends string, Options extends Record<string, unknown>> = {
  type: Type
  static?: boolean
  graded?: boolean
  alignment?: string
  options: Options
  key?: number | null
  version?: {
    major: number
    minor: number
  }
}

type RadioWidget = WidgetOptions<"radio", PerseusRadioWidgetOptions>
```

### Radio Widget Options

```ts
type PerseusRadioWidgetOptions = {
  choices: PerseusRadioChoice[]
  hasNoneOfTheAbove?: boolean
  countChoices?: boolean
  numCorrect?: number
  randomize?: boolean
  multipleSelect?: boolean
  deselectEnabled?: boolean
}

type PerseusRadioChoice = {
  content: string
  id: string
  rationale?: string
  correct?: boolean
  isNoneOfTheAbove?: boolean
}
```

For v3 parsing, Perseus expects the widget to be shaped as:

```ts
type PerseusRadioWidgetV3 = {
  type: "radio"
  version?: {
    major: 3
    minor: number
  }
  options: {
    numCorrect?: number
    choices: Array<{
      content: string
      rationale?: string
      correct?: boolean
      isNoneOfTheAbove?: boolean
      id: string
    }>
    hasNoneOfTheAbove?: boolean
    countChoices?: boolean
    randomize?: boolean
    multipleSelect?: boolean
    deselectEnabled?: boolean
  }
}
```

Notes:

- the parser defaults missing or empty choice IDs to generated values like `radio-choice-0`
- `correct` and `rationale` are part of the authoring/scoring data, not the learner-facing public render payload

### Scoring Inputs

```ts
type PerseusRadioRubric = {
  choices: PerseusRadioChoice[]
  countChoices?: boolean
}

type PerseusRadioUserInput = {
  selectedChoiceIds: string[]
}
```

This is the part of Perseus that is most worth copying directly for Buddy attempts:

- stable opaque choice IDs
- user input as `selectedChoiceIds`
- grading against IDs rather than display order

### Learner-Facing Public Render Shape

Perseus does not expose `correct` and `rationale` in the public radio options it sends to the client.

```ts
type RadioPublicWidgetOptions = {
  choices: ReadonlyArray<{
    id: string
    content: string
    isNoneOfTheAbove?: boolean
  }>
  hasNoneOfTheAbove?: boolean
  countChoices?: boolean
  numCorrect?: number
  randomize?: boolean
  multipleSelect?: boolean
  deselectEnabled?: boolean
}
```

`numCorrect` is only meaningfully exposed when Perseus decides it is safe and useful to do so, specifically for multi-select flows where the learner is expected to choose a fixed number of answers.

### Minimal MCQ Example

```ts
const item: PerseusItem = {
  question: {
    content: "What is 2 + 2?\n\n[[☃ radio 1]]",
    widgets: {
      "radio 1": {
        type: "radio",
        version: {major: 3, minor: 0},
        options: {
          choices: [
            {id: "a", content: "3", correct: false, rationale: "Too low."},
            {id: "b", content: "4", correct: true},
            {id: "c", content: "5", correct: false, rationale: "Too high."},
          ],
          countChoices: false,
          randomize: false,
          multipleSelect: false,
        },
      },
    },
    images: {},
  },
  hints: [],
}
```

### What This Means For Buddy

If Buddy wants to be close to Perseus for MCQ, the necessary MCQ-side fields are:

- `choices[].id`
- `choices[].content`
- `choices[].correct`
- `choices[].rationale`
- `choices[].isNoneOfTheAbove`
- `hasNoneOfTheAbove`
- `countChoices`
- `numCorrect`
- `randomize`
- `multipleSelect`
- `selectedChoiceIds`

Buddy-specific fields such as `prompt`, `goalIds`, `groupType`, and artifact metadata still need to live outside this radio widget shape, because Perseus does not model them as part of `PerseusRadioWidgetOptions`.

## Appendix: How Perseus Stores Multiple Questions

Perseus does have a way to store a collection of questions, but it is not a generic top-level `Quiz` type.

There are three relevant layers:

1. `PerseusItem`
2. `graded-group`
3. `graded-group-set`

### 1. Single Exercise: `PerseusItem`

This is the main scored exercise unit in Perseus.

```ts
type PerseusItem = {
  question: PerseusRenderer
  hints: Hint[]
  answerArea?: PerseusAnswerArea | undefined
}
```

This is what `ServerItemRenderer` renders as a normal exercise.

For a normal MCQ, the question prompt lives in `question.content` and the answer widget lives in `question.widgets["radio 1"]`.

### 2. One Self-Contained Question Group: `graded-group`

Perseus has a widget for a self-contained scoreable group:

```ts
type PerseusGradedGroupWidgetOptions = {
  title: string
  hasHint?: boolean | null | undefined
  hint?: PerseusRenderer | null | undefined
  content: string
  widgets: PerseusWidgetsMap
  widgetEnabled?: boolean | null | undefined
  immutableWidgets?: boolean | null | undefined
  images: {
    [key: string]: PerseusImageDetail
  }
}
```

This is effectively a mini question block:

- title
- prompt/content
- nested widgets
- optional hint
- nested images

If the question inside the group is MCQ, then the group content would include something like `[[☃ radio 1]]`, and the group `widgets` map would contain that radio widget.

### 3. A Set of Question Groups: `graded-group-set`

Perseus has a set container:

```ts
type PerseusGradedGroupSetWidgetOptions = {
  gradedGroups: PerseusGradedGroupWidgetOptions[]
}
```

So a collection of questions is stored as:

- one outer renderer/article content
- one `graded-group-set` widget slot
- `gradedGroups: [...]` containing the question groups

Conceptually:

```ts
const articleLikeRenderer: PerseusRenderer = {
  content: "# Section\n\n[[☃ graded-group-set 1]]",
  widgets: {
    "graded-group-set 1": {
      type: "graded-group-set",
      options: {
        gradedGroups: [
          group1,
          group2,
          group3,
        ],
      },
    },
  },
  images: {},
}
```

### Important Rendering Behavior

`graded-group-set` stores all groups, but the normal widget runtime does not render all of them at once.

It typically:

- keeps an internal `currentGroup`
- renders one active group
- advances through the set with a next-question flow

So this is closer to a guided multi-part set than a generic “show me 10 question sets at once” container.

### What This Means For Buddy

If Buddy wants:

- one MCQ exercise
  - `PerseusItem` is the closest Perseus-native shape

- a Perseus-style bundled sequence of questions
  - `graded-group-set` is the closest built-in collection shape

- a product-level question-set artifact with:
  - title
  - group type
  - learning goals
  - multiple questions
  - attempts
  - result history
  - sidebar persistence

then Buddy still needs its own wrapper.

That wrapper can contain questions shaped like Perseus-style MCQ payloads, but the wrapper itself is Buddy-owned:

```ts
type QuestionSetArtifact = {
  artifactID: string
  kind: "question-set.v1"
  groupType: "quiz" | "practice" | "assessment"
  title: string
  instructions?: string
  questions: Question[]
  createdAt: string
}

type Question = {
  id: string
  type: "mcq"
  prompt: string
  goalIds: string[]
  payload: {
    choices: Array<{
      id: string
      content: string
      rationale?: string
      correct?: boolean
      isNoneOfTheAbove?: boolean
    }>
    hasNoneOfTheAbove?: boolean
    countChoices?: boolean
    numCorrect?: number
    randomize?: boolean
    multipleSelect?: boolean
  }
}
```

So the clean distinction is:

- Perseus gives you item and grouped-question shapes.
- Buddy gives you the question-set/product wrapper around them.
