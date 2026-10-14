import freeformFigureBefore from "./render-freeform-figure.before.md?raw"
import productBefore from "./product.before.md?raw"
import toolBefore from "./create-view.before.md?raw"
import visualGuidanceAfter from "./visual-guidance.after.md?raw"
import visualGuidanceBefore from "./visual-guidance.before.md?raw"
import skillBefore from "./whiteboard-authoring.before.md?raw"
import { replacePromptSpan, type PromptReview } from "../model"

const productBenchAfter =
  "Bench shows one tab's content at a time. When both an existing source and evolving reasoning matter, keep the source selected and reason in chat, or bring the essential source anchors into one whiteboard and develop the reasoning there. Do not assume two Bench tabs are visible together."

const toolSelectionBefore =
  "Choose this when the user requests a whiteboard or editable canvas, or when sketching, learner annotation, rearrangement, and a persistent reasoning record are part of the activity. A generic request to explain, draw, or show a diagram does not by itself select a whiteboard. Prefer a static renderer for a finished diagram, a computed plot for data or functions, and an HTML widget for a simulation or reusable controls. Continue an existing board when the user is working on it. Load the `whiteboard-authoring` skill before first use."

const toolSelectionAfter =
  `Choose a whiteboard when the user asks for one, or when a spatial explanation gains value from being built, annotated, rearranged, or revisited as the lesson unfolds. Buddy can lead the drawing; learner editing is optional. Examples of good whiteboard uses:

1. Work through a multi-step solution or derivation while keeping earlier steps visible.
2. Build a causal chain or feedback loop one relationship at a time.
3. Cluster ideas into a concept map, then add and revise the links between them.
4. Reveal a system architecture by placing components, boundaries, and connections as each role is explained.
5. Grow a timeline with events, causes, evidence, and turning points around stable anchors.
6. Put two competing models side by side and annotate where their explanations diverge.
7. Mark a misconception on an existing sketch, repair the relevant part, and show why it changes the conclusion.
8. Collect ideas during a brainstorm, then group, label, and connect them into a useful structure.
9. Leave a diagram or worked step incomplete so the learner can predict, add, or justify what comes next.
10. Keep a visual reasoning workspace through several turns, extending or revising it as understanding develops.

Continue an existing board when the user is working on it. A generic request to explain or draw does not alone select a whiteboard; choose it when the board's spatial construction or revision serves the explanation. Load the whiteboard-authoring skill before the first whiteboard_create_view call.`

const freeformSelectionBefore =
  "Use `render_figure` for supported constrained geometry, `python_calculator` for computed function graphs and data plots, and `render_mermaid` for static connections that fit its diagram formats. Use an HTML widget when user interaction or meaningful animation is required, and a whiteboard when shared editing or annotation is the activity. Do not use SVG merely to restyle prose, lists, or tables."

const freeformSelectionAfter =
  "Use `render_figure` for supported constrained geometry, `python_calculator` for computed function graphs and data plots, and `render_mermaid` for static connections that fit its diagram formats. Use an HTML widget when user interaction or meaningful animation is required. Use a whiteboard when seeing a custom spatial explanation develop step by step or revising the same canvas matters; learner annotation is another reason. Do not use SVG merely to restyle prose, lists, or tables."

const skillDescriptionBefore =
  'description: "Author clear, editable whiteboards with Buddy\'s compact drawing program. Use after selecting a shared canvas workflow: explicit whiteboard or Excalidraw work, learner drawing and annotation, rearranging ideas together, or preserving and revising a visual reasoning record across turns. A generic request to draw, explain, or show a diagram does not by itself select this skill. Do not use for a finished static diagram, a simulation with controls, or document authoring unless canvas editing is part of the requested activity. Read before using whiteboard tools."'

const skillDescriptionAfter =
  'description: "Author Buddy whiteboards with the editable teaching canvas. Load before the first whiteboard_create_view call for drawing format, teaching workflow, and board editing rules."'

const skillRelationshipBefore =
  "Use this skill when the visual canvas itself is the teaching surface. In combined work, first choose the teaching model or framework if needed, then use this skill to decide how the agent should draw, write, pace, compare, preserve, and check understanding on the canvas."

const skillRelationshipAfter =
  "Once a whiteboard has been chosen, use this skill to decide how Buddy should draw, write, pace, compare, preserve, and check understanding on the canvas. Choose a teaching model or framework separately when needed."

const skillAfter = [
  [skillDescriptionBefore, skillDescriptionAfter],
  ["User: [work through x together on this whiteboard...]", "User: [explain or work through x on this whiteboard...]"],
  [
    'Example prompt: "Build a photosynthesis explanation with me on the whiteboard; leave space for me to label the inputs."',
    'Example prompt: "Explain how photosynthesis works step by step on the whiteboard."',
  ],
  [
    'Example prompt: "Put an editable MCP Apps sequence diagram on our whiteboard so we can annotate it together."',
    'Example prompt: "Show the MCP Apps sequence flow on the whiteboard."',
  ],
  [skillRelationshipBefore, skillRelationshipAfter],
].reduce((prompt, [original, replacement]) => replacePromptSpan(prompt, original, replacement), skillBefore)

export const WHITEBOARD_SELECTION_REVIEW: PromptReview = {
  id: "whiteboard-selection",
  label: "Proposal 01",
  title: "Whiteboard routing and skill loading",
  summary:
    "Keep shared visual guidance lean. Put ten positive whiteboard teaching examples in the tool description, and use the skill description to identify and load the authoring guide before drawing.",
  note: "Complete prompt files on both sides. Five coordinated comparisons; Buddy's live prompt sources have not been changed.",
  comparisons: [
    {
      id: "visual-guidance",
      target: "personas/prompts/shared/visual-guidance.p.md",
      sourcePath: "packages/buddy/src/learning/personas/prompts/shared/visual-guidance.p.md",
      title: "Keep shared visual guidance lean",
      explanation:
        "The shared prompt currently contains format-specific selection rules, including a detailed whiteboard rule. Keep only the general visual teaching principle and capability list. Each tool owns its specific selection guidance.",
      before: visualGuidanceBefore,
      after: visualGuidanceAfter,
      beforeSummary: [
        "Lists formats and detailed selection rules",
        "Repeats the whiteboard tool's routing job",
      ],
      afterSummary: [
        "States when a visual helps and names the available media",
        "Leaves medium-specific triggers to tool descriptions",
      ],
      expectedEffects: [
        "Less conflicting guidance between shared prompt and tools",
        "No process-level routing in shared visual guidance",
      ],
    },
    {
      id: "bench-visibility",
      target: "personas/prompts/shared/product.p.md",
      sourcePath: "packages/buddy/src/learning/personas/prompts/shared/product.p.md",
      title: "State the one-visible-tab constraint",
      explanation:
        "Bench can keep several tabs, but only one is visible at a time. A source and a newly opened whiteboard cannot serve as simultaneously visible reference and workspace.",
      before: productBefore,
      after: replacePromptSpan(
        productBefore,
        "\n\n## Writing and formatting",
        `\n\n${productBenchAfter}\n\n## Writing and formatting`,
      ),
      beforeSummary: ["Lists Bench content and layouts", "No active-tab visibility rule"],
      afterSummary: [
        "One Bench tab visible at a time",
        "Source stays visible with chat reasoning, or anchors move onto one board",
      ],
      expectedEffects: [
        "Fewer teaching plans that rely on two visible Bench tabs",
        "Source and board can still be used in sequence",
      ],
    },
    {
      id: "tool-selection",
      target: "features/whiteboard/tools/create-view.md",
      sourcePath: "packages/buddy/src/learning/features/whiteboard/tools/create-view.md",
      title: "Give the whiteboard tool ten positive examples",
      explanation:
        "Make the whiteboard tool the main router. Ten short teaching situations show how construction, annotation, prediction, comparison, and revision make a board useful even when the learner never edits it. A compact boundary prevents a generic draw request from automatically choosing the board.",
      before: toolBefore,
      after: replacePromptSpan(toolBefore, toolSelectionBefore, toolSelectionAfter),
      beforeSummary: [
        "Explicit board or shared sketching as the main trigger",
        "Generic explain or draw request insufficient",
        "Learner editing implied for proactive use",
      ],
      afterSummary: [
        "Ten positive teaching situations describe when to choose a board",
        "Buddy-led drawing and learner editing both qualify",
        "Generic visual requests alone do not select a board",
      ],
      expectedEffects: [
        "More appropriate boards for evolving explanations",
        "Fewer missed Buddy-led demonstrations and misconception repairs",
        "Generic visual requests still allow simpler media",
      ],
    },
    {
      id: "freeform-selection",
      target: "features/figure-rendering/freeform/tools/render-freeform-figure.md",
      sourcePath: "packages/buddy/src/learning/features/figure-rendering/freeform/tools/render-freeform-figure.md",
      title: "Align the competing SVG tool",
      explanation:
        "The freeform-figure description currently says whiteboard use depends on shared editing or annotation. Aligning this alternative prevents it from overriding the broader whiteboard rule.",
      before: freeformFigureBefore,
      after: replacePromptSpan(
        freeformFigureBefore,
        freeformSelectionBefore,
        freeformSelectionAfter,
      ),
      beforeSummary: ["Whiteboard reserved for shared editing or annotation"],
      afterSummary: [
        "Whiteboard also for evolving spatial explanations",
        "Learner annotation remains useful but optional",
      ],
      expectedEffects: [
        "SVG remains available for precise finished vectors",
        "Fewer conflicting tool descriptions",
      ],
    },
    {
      id: "skill-guidance",
      target: "features/whiteboard/skills/whiteboard-authoring/SKILL.md",
      sourcePath: "packages/buddy/src/learning/features/whiteboard/skills/whiteboard-authoring/SKILL.md",
      title: "Make the skill a pre-drawing guide",
      explanation:
        "Buddy's runtime matches tasks to skill descriptions, so the short description still names whiteboard authoring. It tells Buddy to load the drawing and teaching guide before the first tool call without repeating the tool's ten selection examples.",
      before: skillBefore,
      after: skillAfter,
      beforeSummary: [
        "Skill description duplicates medium routing",
        "Shared editing drives selection",
        "Examples assume learner contribution",
      ],
      afterSummary: [
        "Identifies whiteboard authoring for skill discovery",
        "Loads guide before first drawing call",
        "Medium choice stays in the tool description",
        "Examples include complete Buddy-led explanations",
      ],
      expectedEffects: [
        "Skill description no longer competes with tool routing",
        "Buddy-led drawing remains a valid skill workflow",
      ],
    },
  ],
}
