# Perseus Data Model

This note explains the Khan Academy Perseus mental model in plain language and maps it to Buddy's current quiz work.

## Short Version

Perseus is not "a list of question types".

Perseus has a layered model:

- `PerseusItem` = one full exercise/problem
- `PerseusRenderer` = a renderable block of markdown + widget placeholders
- `widget` = one interactive or content block inside that renderer

So the important distinction is:

- an exercise is the whole item
- a widget is one piece inside the exercise

## Core Shapes

### 1. `PerseusItem`

This is the top-level exercise object.

It usually contains:

- `question`
- `hints`
- sometimes `answerArea`

Mental model:

- one learner-facing problem
- one submit/check cycle
- one set of hints
- one scoring pass

Example shape:

```ts
type PerseusItem = {
  question: PerseusRenderer
  hints: Hint[]
  answerArea?: PerseusAnswerArea
}
```

### 2. `PerseusRenderer`

This is the markdown-like content block that Perseus knows how to render.

It contains:

- `content`: markdown/text with widget placeholders
- `widgets`: a map of widget IDs to widget configs
- `images`

Mental model:

- the prompt text lives here
- widget placeholders live in the content string
- the actual widget data lives in the `widgets` map

Example:

```md
What is 2 + 2?

[[☃ radio 1]]
```

Then `widgets["radio 1"]` contains the actual multiple-choice widget configuration.

### 3. `widget`

A widget is a self-contained component embedded into the renderer.

Examples:

- `radio`
- `dropdown`
- `numeric-input`
- `expression`
- `interactive-graph`
- `matcher`

But not every widget is an answer widget.

Some widgets are support/content widgets:

- `image`
- `video`
- `definition`
- `explanation`

Some widgets are containers:

- `graded-group`
- `graded-group-set`

## What Counts As "An Exercise" In Perseus

In Khan's system, the exercise is the whole `PerseusItem`, not the widget.

That means:

- `radio` is not an exercise
- `interactive-graph` is not an exercise
- `numeric-input` is not an exercise

Those are widget types used inside an exercise.

The exercise is the whole package:

- prompt
- widgets
- hints
- answerful scoring data

## What Counts As "A Question Type"

People often casually say "question type" when they really mean "answer widget type".

That is usually fine informally, but it is not the real Perseus data model.

The more accurate wording is:

- exercise/problem type: the top-level item shape and flow
- widget type: the specific interaction inside the problem

## Widget Categories

### Answer widgets

These are the widgets that actually collect and score learner input:

- `radio`
- `dropdown`
- `input-number`
- `numeric-input`
- `expression`
- `interactive-graph`
- `matcher`
- `matrix`
- `number-line`
- `orderer`
- `plotter`
- `sorter`
- `table`
- `categorizer`
- `free-response`
- `label-image`
- `grapher`
- `cs-program`

### Support/content widgets

These can appear inside content, but they are not the main answer mechanism:

- `image`
- `video`
- `definition`
- `explanation`
- `iframe`
- `molecule`
- `phet-simulation`
- `python-program`
- `interaction`
- `measurer`

### Container widgets

These organize or bundle other content/widgets:

- `group`
- `graded-group`
- `graded-group-set`

`graded-group` and `graded-group-set` are especially important because they let Khan put in-line checks inside article content.

## How Authors Actually Write Perseus Content

Perseus is not just "a markdown file creator", but markdown-like content is one of its core building blocks.

The authoring model is:

- authors usually use Perseus editor UIs, not raw files
- those editors serialize into JSON objects like `PerseusItem` and `PerseusRenderer`
- inside those JSON objects, the main text content is stored as extended Markdown strings

So the stored data is usually JSON, but the content inside the JSON is often markdown-like text.

The important split is:

- `content`: a string with text, math, markdown, and widget placeholders
- `widgets`: a map of widget IDs to widget configuration objects

Example mental model:

```ts
type PerseusRenderer = {
  content: "What is the slope?\n\n[[☃ numeric-input 1]]"
  widgets: {
    "numeric-input 1": {
      type: "numeric-input",
      options: { /* widget config */ }
    }
  }
  images: {}
}
```

So the author does not normally hand-author one big markdown file that magically knows everything.

Instead:

1. the author edits content in an editor
2. the editor lets them insert widgets
3. the editor stores widget configs separately
4. the final saved object is structured JSON

That is why the right phrase is:

- Perseus is a markdown-plus-widgets authoring and rendering system

not:

- Perseus is only markdown

## Can A Radio Choice Be An Image

Yes.

More precisely:

- a radio choice's `content` is not limited to plain text
- it is stored as a content string
- Perseus renders that choice content through the full renderer path

That means a choice can contain:

- text
- math
- markdown images
- and, conceptually, other renderable Perseus content

So a multiple-choice option can absolutely be image-based.

The clean mental model is:

- the answer widget is still `radio`
- but each choice inside that widget can contain rich content

So this is valid in spirit:

```ts
type RadioChoice = {
  id: "radio-choice-1"
  content: "![Triangle](https://cdn.example.com/triangle.png)"
  correct: true
}
```

That does not turn the choice into a separate image widget type.
It means the `radio` widget is using rich renderer content for each option label.

## The Real Mental Model

If you want the shortest accurate model, it is this:

- Perseus exercises are JSON objects
- those JSON objects contain markdown-like content strings
- widgets are embedded into that content via placeholders
- some widgets are answer widgets
- some widgets are support/content widgets
- some widgets are container widgets
- answer widgets can themselves contain rich content in some places, such as radio choice content

So your "two widget types" model is close, but slightly incomplete.

The better version is:

1. answer widgets
2. support/content widgets
3. container widgets

And separately:

- rich content can appear both in the main prompt and inside some answer widget fields

## Exercises Vs Articles

Perseus has two top-level surfaces:

- `PerseusItem` for exercises
- `PerseusArticle` for articles

Exercises:

- rendered by `ServerItemRenderer`
- externally scored
- have explicit exercise submission flow

Articles:

- rendered by `ArticleRenderer`
- are not normal exercises
- can still contain embedded in-line checks via `graded-group` / `graded-group-set`

So a "knowledge check in an article" is not the same thing as a normal exercise item.

## Answerful Vs Answerless Data

Perseus makes a strong distinction between:

- answerful data
- answerless/public data

Before attempt:

- the learner gets an answerless version
- hidden correctness/rubric data is removed

After submission/scoring:

- scoring uses the answerful item
- review can reveal correctness, rationales, and similar data

This is very close to the same split Buddy chose for question sets.

## Scoring Model

Perseus scoring is widget-driven.

The high-level flow is:

1. render a `PerseusItem`
2. collect user input from its widgets
3. validate the input
4. score each scoreable widget
5. combine the result into an exercise result

So scoring is not "score the markdown".
It is effectively "score the widgets referenced by the item".

## The Right Mental Model

Use this hierarchy:

1. Exercise
   `PerseusItem`
2. Question content
   `PerseusRenderer`
3. Embedded interactions
   widgets
4. Learner input
   widget-specific user input
5. Scoring
   widget scorers + item-level aggregation

If you keep that hierarchy straight, the rest of Perseus becomes much easier to understand.

## Mapping To Buddy

Buddy did not adopt the full Perseus exercise model.

Buddy currently has its own product wrapper:

- `question-set.v1`
- `question-set-attempt.v1`

And inside that wrapper, Buddy currently supports only one interaction family:

- MCQ / multi-select
- effectively closest to Perseus `radio`

So the closest mapping is:

- Buddy `QuestionSetArtifact` ~= Buddy-owned collection wrapper
- Buddy `Question` ~= simplified question record
- Buddy `Question.payload` ~= Perseus-inspired MCQ widget options
- Buddy attempt answers ~= Perseus-style `selectedChoiceIds`

Important difference:

- Perseus centers everything around one `PerseusItem` exercise
- Buddy currently centers everything around a multi-question `question-set` artifact

That means Buddy is currently borrowing a widget pattern from Perseus, not the full Perseus exercise architecture.

## Practical Summary

If you ask, "what types of exercises does Perseus have?", the precise answer is:

- Perseus has one main exercise container model: `PerseusItem`
- inside that, it supports many widget types
- some of those widgets are answer types
- some are support/content widgets
- some are container widgets

So the thing you should compare Buddy against is usually not "exercise type vs exercise type".
It is:

- Buddy question interaction type
- vs
- Perseus widget type

That is the comparison that actually lines up.
