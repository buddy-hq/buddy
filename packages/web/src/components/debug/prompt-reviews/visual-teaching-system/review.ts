import imagegenBefore from "./imagegen-description.before.md?raw"
import learningCompanionBefore from "./learning-companion.before.md?raw"
import presentHtmlWidgetBefore from "./present-html-widget.before.md?raw"
import productBefore from "./product.before.md?raw"
import pythonCalculatorBefore from "./python-calculator.before.md?raw"
import readingBefore from "./reading.before.md?raw"
import renderFigureBefore from "./render-figure.before.md?raw"
import renderFreeformFigureBefore from "./render-freeform-figure.before.md?raw"
import renderMermaidBefore from "./render-mermaid.before.md?raw"
import teachingBefore from "./teaching.before.md?raw"
import visualGuidanceBefore from "./visual-guidance.before.md?raw"
import { replacePromptSpan, type PromptReview } from "../model"

const visualGuidanceAfter = replacePromptSpan(
  visualGuidanceBefore,
  "For simple questions, answer directly without a visual tool call unless a visual was requested. Confusion alone does not imply a diagram is needed; address the specific gap. Do not choose a tool because it is available or easy to generate. When a visual helps, focus it on one teaching point, explain how to read it, and use partial diagrams only when completing them serves the activity.",
  `For simple questions, answer directly without a visual tool call unless a visual was requested. Confusion alone does not imply a diagram is needed; address the specific gap. Do not choose a tool because it is available or easy to generate. When a visual helps, focus it on one teaching point and explain how to read it.

First identify what the learner needs to do with the material: inspect evidence, compare exact values, see a relationship, test a change, or follow developing reasoning. If wording, image detail, markings, axes, scale, or provenance is the evidence, show the source or a faithful extract and direct attention to that feature. A recreated illustration is not a substitute for evidence. Use a transcription or cropped figure when it preserves the details the task requires.

Choose the presentation sequence for the task. Build a representation in stages when each addition helps explain a new relationship. Show a complete, stable representation when the learner needs the whole configuration for comparison, repeated inspection, or prediction. Revise a representation when an attempt can be compared with evidence or a stronger model. Do not assume progressive reveal, animation, or more interaction improves learning by itself. Keep earlier states available when the learner must compare them with later ones.`,
)

const productAfter = replacePromptSpan(
  productBefore,
  "\n\n## Writing and formatting",
  `

Bench has one visible tab at a time. When a source is the evidence, keep its resource, document, or figure selected and use chat to guide inspection of an exact passage, region, axis, or mark. When an evolving spatial record is needed, use a whiteboard; when editable prose or a worked record is needed, use a document. Keep the problem, definitions, assumptions, key steps, or learner attempt in the material the learner will revisit. If the displayed item cannot hold those notes, record the concise anchor in chat or an editable document. Use bench_read_context and bench_present to return to a tab; do not assume an unselected tab remains visible.

## Writing and formatting`,
)

const teachingAfter = replacePromptSpan(
  teachingBefore,
  "Use the evidence you receive. If they demonstrate understanding, acknowledge briefly and continue. If they reveal a gap, address that gap with a focused explanation, example, or scaffold. Further questions are appropriate when resolving a demonstrated gap or when the learner has requested practice or a quiz.",
  `Use the evidence you receive. If they demonstrate understanding, acknowledge briefly and continue. If they reveal a gap, address that gap with a focused explanation, example, or scaffold. Further questions are appropriate when resolving a demonstrated gap or when the learner has requested practice or a quiz.

In guided learning, model enough to make the first move intelligible, then give the learner a meaningful next step to try. Shift from worked example to supported attempt to more independent work as their actual reasoning warrants. Do not withhold a clear answer to force participation, or require a reply after every explanatory step.`,
)

const learningCompanionAfter = replacePromptSpan(
  learningCompanionBefore,
  [
    "- use `teaching-models` to pick a model at the beginning of the session if you are highly confident that the user has started the session with an intention to learn. when in doubt, choose socratic.",
    "  - OR, use the skill whenever you feel that the learner is getting into a mindset to learn.",
    "- DON'T trigger the skill if the user is asking for general assistance or help.",
  ].join("\n"),
  `- Use teaching-models when the learner clearly wants to understand, practice, or recover from confusion, including when that intent emerges later in the conversation.
- Choose the teaching move from the learner's request and available evidence. Explain directly or model a worked example when that serves them; use diagnostic questioning when their response will reveal a consequential gap or help them reason.
- Do not trigger the skill for unrelated general assistance.`,
)

const readingAfter = replacePromptSpan(
  readingBefore,
  "# Reading Modes\n",
  `# Source as learner-facing evidence
When the learning task depends on the source's exact wording, figure, table, image signal, layout, axes, or provenance, present that source on Bench with bench_present if it is not already visible. Direct the learner to the relevant page, passage, figure, or region and make the evidence-bearing feature the object of interpretation, comparison, or prediction. Keep the source selected while reasoning in chat. A faithful excerpt or transcription is sufficient when it preserves the feature being studied; do not insist on an original page layout for its own sake. If the source changes or the learner supplies a selection, inspect the current context before referring to it.

# Reading Modes
`,
)

const presentHtmlWidgetAfter = replacePromptSpan(
  presentHtmlWidgetBefore,
  "For ordinary worksheets, handouts, and document-form quizzes, follow `teaching-resource-authoring`; use HTML only when runtime behavior is needed.",
  `For ordinary worksheets, handouts, and document-form quizzes, follow teaching-resource-authoring; use HTML only when runtime behavior is needed.

Author the activity around a meaningful learner action: control the pace of a changing process, vary a causal input and see its consequence, test a prediction, compare controlled cases, or align linked representations. Make the relevant change and feedback legible; include a stable reference or comparison when earlier states matter. Give the learner a specific thing to observe or explain. Controls without interpretable feedback are not a reason to use a widget. Buddy does not automatically receive the learner's control actions, so ask for the resulting observation when it affects the next teaching move.`,
)

const renderFigureAfter = replacePromptSpan(
  renderFigureBefore,
  "Prefer explicit `constraints` for derived geometry such as points on segments, perpendicular feet, or line intersections instead of hand-placing dependent points.",
  `Prefer explicit constraints for derived geometry such as points on segments, perpendicular feet, or line intersections instead of hand-placing dependent points. Preserve the mathematical relationships the learner must infer or prove: incidence, parallelism, perpendicularity, angle, length, and orientation when relevant. A plausible-looking sketch is not evidence that a relation holds. Overall screen scale need not be literal unless scale or measurement is itself the learning target. Label the parts used in the reasoning and call out any schematic or not-to-scale aspect that could mislead.`,
)

const pythonCalculatorAfter = replacePromptSpan(
  pythonCalculatorBefore,
  "For plots, create Matplotlib or Seaborn figures from computed or supplied values.",
  `Plot when the learning task concerns variation, covariation, distribution, uncertainty, or how a function changes. Use a table or text for a few exact values or lookups. For a plot, make axes, units, scale, series, and uncertainty legible; preserve the source data or computation behind any claim. Ask the learner to read a specific pattern or contrast from the graph when that advances the lesson. For plots, create Matplotlib or Seaborn figures from computed or supplied values.`,
)

const renderMermaidAfter = replacePromptSpan(
  renderMermaidBefore,
  "Keep the diagram focused on the relevant connections. Use scaffolds or incomplete diagrams only when the learning activity calls for the learner to complete them.",
  `Keep the diagram focused on the relevant connections. Place short labels by the nodes or links they explain, and omit decorative or irrelevant detail. A complete diagram can be the right starting point when the learner needs to inspect the whole structure, compare paths, or predict what happens next. Use scaffolds or incomplete diagrams when completion itself serves the activity, not as a default.`,
)

const renderFreeformFigureWithWhiteboardSelection = replacePromptSpan(
  renderFreeformFigureBefore,
  "Use `render_figure` for supported constrained geometry, `python_calculator` for computed function graphs and data plots, and `render_mermaid` for static connections that fit its diagram formats. Use an HTML widget when user interaction or meaningful animation is required, and a whiteboard when shared editing or annotation is the activity. Do not use SVG merely to restyle prose, lists, or tables.",
  "Use `render_figure` for supported constrained geometry, `python_calculator` for computed function graphs and data plots, and `render_mermaid` for static connections that fit its diagram formats. Use an HTML widget when user interaction or meaningful animation is required. Use a whiteboard when seeing a custom spatial explanation develop step by step or revising the same canvas matters; learner annotation is another reason. Do not use SVG merely to restyle prose, lists, or tables.",
)

const renderFreeformFigureAfter = replacePromptSpan(
  renderFreeformFigureWithWhiteboardSelection,
  "This tool checks SVG compilation and parsing; it does not verify the drawing's scientific, numerical, or geometric correctness.",
  `For a teaching diagram, simplify irrelevant visual detail while preserving the spatial or causal relationship being taught. Put labels close to their referents, align corresponding parts in comparisons, and make the intended reading order clear. Use realistic detail only when recognizing that appearance is part of the learning target; do not add realism merely to decorate an explanation.

This tool checks SVG compilation and parsing; it does not verify the drawing's scientific, numerical, or geometric correctness.`,
)

const imagegenAfter = replacePromptSpan(
  imagegenBefore,
  "For explanatory visuals, use image generation when the appearance of the scene or illustration is the point. A generic request to explain, draw, or show a diagram does not by itself select image generation; choose the best currently available visual capability for the requested result.",
  `For explanatory visuals, use image generation when an illustrative appearance is the point, such as an imagined scene or a recognizable everyday object. A generated image is an illustration, not an authentic source, specimen, scan, or measured result; present a real source when its details or recognition conditions are the lesson. For a relationship that needs exact geometry, controlled data, or clear causal structure, use the appropriate figure, plot, or diagram tool. A generic request to explain, draw, or show a diagram does not by itself select image generation.`,
)

export const VISUAL_TEACHING_SYSTEM_REVIEW: PromptReview = {
  id: "visual-teaching-system",
  label: "Proposal 02",
  status: "historical",
  title: "Teach through the whole visual system",
  summary:
    "Coordinate source inspection, Bench continuity, learner responsibility, static diagrams, geometry, graphs, generated images, and interactive widgets. Whiteboard selection remains in Proposal 01.",
  note: "Eleven complete before/after prompt files, frozen from the current workspace. These proposals synthesize docs/sources/deep-research-report (1) through (7); they do not change the live Buddy prompts. For overlapping shared-visual, Bench, and SVG files, Proposal 02 is the combined final recommendation; Proposal 01's whiteboard tool and skill proposals remain relevant. Report 6 does not establish a blanket advantage for progressive drawing or preserving every version, so the proposal makes those choices conditional.",
  comparisons: [
    {
      id: "representation-strategy",
      target: "personas/prompts/shared/visual-guidance.p.md",
      sourcePath: "packages/buddy/src/learning/personas/prompts/shared/visual-guidance.p.md",
      title: "Choose what the learner must inspect or do",
      explanation:
        "Reports 1, 2, and 6 support source inspection and task-specific construction, complete display, or revision. This shared prompt applies to both Buddy personas; tool descriptions retain medium-specific routing.",
      before: visualGuidanceBefore,
      after: visualGuidanceAfter,
      beforeSummary: ["Selects formats mainly by visual type", "Favors partial diagrams without a full sequence rule"],
      afterSummary: ["Starts from the learner's evidence and action", "Makes build, complete, and revise conditional choices"],
      expectedEffects: ["Fewer decorative or recreated visuals", "Better choice of source versus generated representation"],
    },
    {
      id: "bench-continuity",
      target: "personas/prompts/shared/product.p.md",
      sourcePath: "packages/buddy/src/learning/personas/prompts/shared/product.p.md",
      title: "Make Bench an explicit external memory",
      explanation:
        "Report 7's external-memory principle applies across Bench surfaces. This names where to keep an anchor and accounts for the product's one-visible-tab behavior.",
      before: productBefore,
      after: productAfter,
      beforeSummary: ["Defines Bench and layouts", "Does not say where a durable teaching record lives"],
      afterSummary: ["Keeps sources selected for inspection", "Places persistent work in a board, document, or chat anchor"],
      expectedEffects: ["Fewer invisible-reference assumptions", "More usable continuity across turns and tabs"],
    },
    {
      id: "learner-responsibility",
      target: "personas/prompts/shared/teaching.p.md",
      sourcePath: "packages/buddy/src/learning/personas/prompts/shared/teaching.p.md",
      title: "Fade support when the learner is ready",
      explanation:
        "Report 7's modeling-to-learner-responsibility pattern belongs in shared teaching guidance, not inside a visual tool. Existing check-for-understanding rules remain intact.",
      before: teachingBefore,
      after: teachingAfter,
      beforeSummary: ["Checks understanding from evidence", "Does not state when to hand over the next step"],
      afterSummary: ["Models a useful first move", "Fades from supported attempt to independent work when warranted"],
      expectedEffects: ["More purposeful learner contribution", "No forced participation during a requested explanation"],
    },
    {
      id: "teaching-model-entry",
      target: "personas/prompts/learning-companion.p.md",
      sourcePath: "packages/buddy/src/learning/personas/prompts/learning-companion.p.md",
      title: "Remove the automatic Socratic fallback",
      explanation:
        "The current default can turn evidence-based explanation into unnecessary questioning. The teaching-model skill already routes direct instruction, worked examples, and guided practice.",
      before: learningCompanionBefore,
      after: learningCompanionAfter,
      beforeSummary: ["Defaults to Socratic when unsure", "Skill trigger depends on confidence at session start"],
      afterSummary: ["Triggers on clear learning intent at any point", "Chooses explanation, modeling, or questioning from need"],
      expectedEffects: ["Less reflexive questioning", "Better use of worked examples and guided practice"],
    },
    {
      id: "source-inspection",
      target: "features/reading/skills/reading/SKILL.md",
      sourcePath: "packages/buddy/src/learning/features/reading/skills/reading/SKILL.md",
      title: "Let the learner inspect evidence in the source",
      explanation:
        "Report 1 distinguishes reasoning from source details from merely displaying an original. Reading owns the grounded source workflow; this adds a learner-facing Bench move without imposing facsimiles.",
      before: readingBefore,
      after: readingAfter,
      beforeSummary: ["Reads and cites the source internally", "No rule for presenting evidence-bearing details to the learner"],
      afterSummary: ["Shows the exact source detail when needed", "Accepts faithful extracts when they retain the evidence"],
      expectedEffects: ["More grounded source-based tasks", "Less passive document display"],
    },
    {
      id: "meaningful-interaction",
      target: "features/html-widgets/tools/present-html-widget.md",
      sourcePath: "packages/buddy/src/learning/features/html-widgets/tools/present-html-widget.md",
      title: "Give widgets a consequential learner action",
      explanation:
        "Report 2 supports pacing control, variable tests, controlled contrasts, and interpretable feedback more than generic clicking. The tool prompt is visible before Buddy authors the widget.",
      before: presentHtmlWidgetBefore,
      after: presentHtmlWidgetAfter,
      beforeSummary: ["Routes simulations and custom activities", "Does not specify what makes interaction educational"],
      afterSummary: ["Requires an observable manipulation and feedback", "Uses the learner's observation for the next move"],
      expectedEffects: ["Fewer decorative controls", "More informative learner experiments"],
    },
    {
      id: "geometry-accuracy",
      target: "features/figure-rendering/geometry/tools/render-figure.md",
      sourcePath: "packages/buddy/src/learning/features/figure-rendering/geometry/tools/render-figure.md",
      title: "Preserve task-critical geometry",
      explanation:
        "Report 4 separates mathematical accuracy from literal scale or visual realism. The constrained figure tool should encode relations the learner will reason from.",
      before: renderFigureBefore,
      after: renderFigureAfter,
      beforeSummary: ["Prefers constraints for derived points", "Does not say which visual inaccuracies mislead learning"],
      afterSummary: ["Preserves task-critical invariants", "Labels schematic or not-to-scale aspects when relevant"],
      expectedEffects: ["Fewer misleading plausible sketches", "More defensible geometric reasoning"],
    },
    {
      id: "quantitative-plots",
      target: "features/calculator/tools/python-calculator.md",
      sourcePath: "packages/buddy/src/learning/features/calculator/tools/python-calculator.md",
      title: "Plot relationships, not every number",
      explanation:
        "Report 5 finds graphs useful for function behavior and patterns across data, while tables can better serve exact lookup. The calculation tool owns plot generation.",
      before: pythonCalculatorBefore,
      after: pythonCalculatorAfter,
      beforeSummary: ["Explains how to make plots", "No task-level graph versus table rule"],
      afterSummary: ["Uses plots for change, distribution, and uncertainty", "Specifies axes, scales, units, and source data"],
      expectedEffects: ["More interpretable plots", "Fewer unnecessary graphs"],
    },
    {
      id: "complete-diagrams",
      target: "features/diagrams/tools/render-mermaid.md",
      sourcePath: "packages/buddy/src/learning/features/diagrams/tools/render-mermaid.md",
      title: "Use finished diagrams for active reasoning",
      explanation:
        "Reports 3 and 6 support focused static diagrams and show that a complete configuration can support prediction and repeated inspection. Incompleteness should serve a task, not be a default.",
      before: renderMermaidBefore,
      after: renderMermaidAfter,
      beforeSummary: ["Focuses on relevant connections", "Mentions incomplete scaffolds"],
      afterSummary: ["Keeps labels close to relations", "Treats complete diagrams as active reasoning material"],
      expectedEffects: ["Clearer finished diagrams", "Less arbitrary withholding of structure"],
    },
    {
      id: "purpose-built-figures",
      target: "features/figure-rendering/freeform/tools/render-freeform-figure.md",
      sourcePath: "packages/buddy/src/learning/features/figure-rendering/freeform/tools/render-freeform-figure.md",
      title: "Simplify custom figures for the lesson",
      explanation:
        "Report 3 favors relevant structure, close labels, and side-by-side correspondence. This combined after also carries Proposal 01's broader whiteboard-versus-SVG routing so the two reviews do not conflict when implemented.",
      before: renderFreeformFigureBefore,
      after: renderFreeformFigureAfter,
      beforeSummary: ["Selects custom SVG for layout", "Reserves whiteboards for shared editing"],
      afterSummary: ["Removes irrelevant detail and aligns labels", "Also routes evolving spatial explanations to whiteboard"],
      expectedEffects: ["More legible static figures", "Less decorative realism"],
    },
    {
      id: "illustration-versus-evidence",
      target: "features/image-generation/imagegen-description.md",
      sourcePath: "packages/buddy/src/learning/features/image-generation/imagegen-description.md",
      title: "Distinguish illustration from authentic evidence",
      explanation:
        "Reports 1 and 3 distinguish explanatory illustrations from authentic visual evidence. Generated images can illustrate appearance, but recognition from real images requires the actual source.",
      before: imagegenBefore,
      after: imagegenAfter,
      beforeSummary: ["Uses image generation for appearance", "Does not explicitly protect source evidence"],
      afterSummary: ["Uses generated images for illustrative appearance", "Routes authentic evidence and exact relationships elsewhere"],
      expectedEffects: ["Less confusion between illustration and source", "More appropriate renderer choice"],
    },
  ],
}
