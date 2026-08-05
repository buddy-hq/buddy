import type { PrimaryUse } from "@/state/project-config-readers"
import { OPENCODE_PROVIDER_ID } from "@/lib/provider-ids"

export const GET_STARTED_CHAT_IDS = [
  "buddy-help-tour",
  "whiteboard-explainer",
  "interactive-simulation",
  "read-odyssey",
  "research-question",
  "skills-showcase",
  "whiteboard-brainstorm",
  "standards-lesson",
  "classroom-activity",
  "differentiated-task",
] as const
export type GetStartedChatID = (typeof GET_STARTED_CHAT_IDS)[number]

export const GET_STARTED_CAPABILITY = {
  bench: "bench",
  htmlWidget: "html-widget",
  questionUi: "question-ui",
  flashcards: "flashcards",
  questionSets: "question-sets",
  practiceRail: "practice-rail",
  mermaidDiagram: "mermaid-diagram",
  markdown: "markdown",
  whiteboard: "whiteboard",
  workedExample: "worked-example",
  standards: "standards",
  lessonWorkspace: "lesson-workspace",
  teacherNotes: "teacher-notes",
  differentiation: "differentiation",
  formativeCheck: "formative-check",
  buddyHelp: "buddy-help",
  reader: "reader",
  research: "research",
  skills: "skills",
  subagents: "subagents",
} as const
export type GetStartedCapability =
  (typeof GET_STARTED_CAPABILITY)[keyof typeof GET_STARTED_CAPABILITY]

export const GET_STARTED_CAPABILITY_LABEL = {
  [GET_STARTED_CAPABILITY.bench]: "Bench",
  [GET_STARTED_CAPABILITY.htmlWidget]: "Interactive widget",
  [GET_STARTED_CAPABILITY.questionUi]: "Question UI",
  [GET_STARTED_CAPABILITY.flashcards]: "Flashcards",
  [GET_STARTED_CAPABILITY.questionSets]: "Question sets",
  [GET_STARTED_CAPABILITY.practiceRail]: "Practice",
  [GET_STARTED_CAPABILITY.mermaidDiagram]: "Diagrams",
  [GET_STARTED_CAPABILITY.markdown]: "Markdown notes",
  [GET_STARTED_CAPABILITY.whiteboard]: "Whiteboard",
  [GET_STARTED_CAPABILITY.workedExample]: "Worked example",
  [GET_STARTED_CAPABILITY.standards]: "Standards",
  [GET_STARTED_CAPABILITY.lessonWorkspace]: "Lesson workspace",
  [GET_STARTED_CAPABILITY.teacherNotes]: "Teacher notes",
  [GET_STARTED_CAPABILITY.differentiation]: "Differentiation",
  [GET_STARTED_CAPABILITY.formativeCheck]: "Formative check",
  [GET_STARTED_CAPABILITY.buddyHelp]: "Buddy Help",
  [GET_STARTED_CAPABILITY.reader]: "Reader",
  [GET_STARTED_CAPABILITY.research]: "Research",
  [GET_STARTED_CAPABILITY.skills]: "Skills",
  [GET_STARTED_CAPABILITY.subagents]: "Subagents",
} as const satisfies Record<GetStartedCapability, string>

/** Icon keys resolved in the board UI. */
export const GET_STARTED_ICON = {
  tour: "tour",
  whiteboard: "whiteboard",
  simulation: "simulation",
  practice: "practice",
  reading: "reading",
  brainstorm: "brainstorm",
  standards: "standards",
  activity: "activity",
  differentiate: "differentiate",
  research: "research",
  skills: "skills",
} as const
export type GetStartedIconId = (typeof GET_STARTED_ICON)[keyof typeof GET_STARTED_ICON]

export type GetStartedChat = {
  id: GetStartedChatID
  title: string
  /** Leading icon on board cards (not sidebar). */
  icon: GetStartedIconId
  /** Short outcome-focused hover-card blurb (what you get, not how). */
  description: string
  prompt: string
  /** Shown as tags in the board hover card; also used for runtime/demo metadata. */
  capabilities: readonly GetStartedCapability[]
}

export const GET_STARTED_FLOW_DEVTOOLS_MODE = {
  appState: "app_state",
  hidden: "hidden",
  student: "student",
  teacher: "teacher",
} as const
export type GetStartedFlowDevtoolsMode =
  (typeof GET_STARTED_FLOW_DEVTOOLS_MODE)[keyof typeof GET_STARTED_FLOW_DEVTOOLS_MODE]

export const GET_STARTED_LEARNER_MODEL_TIER = {
  free: "free",
  connected: "connected",
} as const
export type GetStartedLearnerModelTier =
  (typeof GET_STARTED_LEARNER_MODEL_TIER)[keyof typeof GET_STARTED_LEARNER_MODEL_TIER]

export function resolveGetStartedLearnerModelTier(
  selectedModel: string | undefined,
): GetStartedLearnerModelTier {
  if (!selectedModel || selectedModel.startsWith(`${OPENCODE_PROVIDER_ID}/`)) {
    return GET_STARTED_LEARNER_MODEL_TIER.free
  }

  return GET_STARTED_LEARNER_MODEL_TIER.connected
}

const BUDDY_HELP_TOUR_CHAT = {
  id: "buddy-help-tour",
  title: "Take the Grand Tour",
  icon: GET_STARTED_ICON.tour,
  description: "A tiny map of Buddy and three things you can ask next.",
  prompt:
    "Load the buddy-help skill. Using only what buddy-help actually says, build one small Bench widget — a mini tour, not a full product guide. Show at most four labeled areas (for example Chat, Bench, Practice, Settings) and exactly three example questions I can type next. Keep chat short; put the tour in the widget. That is the only deliverable.",
  capabilities: [
    GET_STARTED_CAPABILITY.bench,
    GET_STARTED_CAPABILITY.htmlWidget,
    GET_STARTED_CAPABILITY.buddyHelp,
  ],
} as const satisfies GetStartedChat

/** Free-model order: bounded single-surface work first (narrow mode shows first 3). */
const FREE_LEARNER_GET_STARTED_CHATS = [
  {
    id: "whiteboard-explainer",
    title: "How Does an AI Agent Work?",
    icon: GET_STARTED_ICON.whiteboard,
    description: "See one agent work through a goal, a tool, a result, and the loop back around.",
    prompt:
      "Draw how an AI agent works on the whiteboard: it receives a goal, thinks, chooses a tool, acts, observes the result, and loops. Use one concrete example throughout. Keep it to five large connected steps with short labels.",
    capabilities: [
      GET_STARTED_CAPABILITY.bench,
      GET_STARTED_CAPABILITY.whiteboard,
    ],
  },
  {
    id: "interactive-simulation",
    title: "Release a Double Pendulum",
    icon: GET_STARTED_ICON.simulation,
    description: "Drag, release, and watch a tiny change turn into a completely different path.",
    prompt:
      "Build and open one compact double-pendulum simulation directly on the Bench. Let me drag, release, and reset it, and draw fading trails behind both arms so I can compare how tiny changes in the starting position produce completely different paths. Keep it to one screen with no tutorial, extra controls, or additional artifacts.",
    capabilities: [GET_STARTED_CAPABILITY.bench, GET_STARTED_CAPABILITY.htmlWidget],
  },
  {
    id: "read-odyssey",
    title: "Read The Odyssey",
    icon: GET_STARTED_ICON.reading,
    description: "Open The Odyssey at the moment its oldest witness recognizes the man who came home.",
    prompt:
      "Download a real public-domain EPUB of The Odyssey from Project Gutenberg, bring it into this workspace, prepare it as a reading resource, and open the actual book in the Bench reader. Do not stop after downloading it or merely summarize it in chat: the book itself must be visible and open on the Bench when you finish. Find the scene where Argos recognizes Odysseus, give me only the context needed to understand the moment, and leave me at that passage ready to read. Stay grounded in this edition.",
    capabilities: [GET_STARTED_CAPABILITY.bench, GET_STARTED_CAPABILITY.reader],
  },
  {
    id: "research-question",
    title: "Could Dinosaurs Actually Roar?",
    icon: GET_STARTED_ICON.research,
    description: "Get one compact evidence brief separating fossils, living relatives, and inference.",
    prompt:
      "Spawn exactly one research subagent to investigate whether dinosaurs could actually roar, using reliable palaeontology sources and evidence from fossils and living relatives. When it returns, put one compact, source-backed Markdown research note directly on the Bench—not in chat. Clearly separate evidence from inference and uncertainty. Do not create additional artifacts.",
    capabilities: [
      GET_STARTED_CAPABILITY.bench,
      GET_STARTED_CAPABILITY.markdown,
      GET_STARTED_CAPABILITY.research,
      GET_STARTED_CAPABILITY.subagents,
    ],
  },
  {
    id: "skills-showcase",
    title: "Decode Caffeine",
    icon: GET_STARTED_ICON.skills,
    description: "Use Buddy’s chemistry skill to read the atoms and rings inside a familiar molecule.",
    prompt:
      "Load the teach-chemistry skill and start with one sentence naming the specialized Buddy skill you are using and what it contributes. Render caffeine as one accurate chemistry structure directly in chat. In three short observations, help me identify its fused rings, two oxygen atoms, and four nitrogen atoms, then ask me one quick identification question. Use only one structure. Do not research, use subagents, create files, or create a Bench artifact.",
    capabilities: [GET_STARTED_CAPABILITY.skills],
  },
] as const satisfies readonly GetStartedChat[]

/** Connected-model order: richer agentic work first (narrow mode shows first 3). */
const CONNECTED_LEARNER_GET_STARTED_CHATS = [
  {
    id: "whiteboard-explainer",
    title: "How Does Buddy Work?",
    icon: GET_STARTED_ICON.whiteboard,
    description: "Trace one request through Buddy’s persona, capabilities, agent loop, and Bench.",
    prompt:
      "Load the Buddy Help skill and use it as the source of truth. Draw one clear whiteboard showing how Buddy handles a request—from my message, through its persona, features, skills, tools, and subagents, to a result in Chat or on the Bench. Show the agent loop, keep it to six large stages, and avoid product details that Buddy Help does not confirm.",
    capabilities: [
      GET_STARTED_CAPABILITY.bench,
      GET_STARTED_CAPABILITY.whiteboard,
      GET_STARTED_CAPABILITY.buddyHelp,
      GET_STARTED_CAPABILITY.skills,
      GET_STARTED_CAPABILITY.subagents,
    ],
  },
  {
    id: "interactive-simulation",
    title: "Travel Through Space",
    icon: GET_STARTED_ICON.simulation,
    description: "Pilot a ship, scan three planets, dodge asteroids, and bring back the science.",
    prompt:
      "Build and open one compact game directly on the Bench where I pilot a ship through the solar system, scan three planets, dodge asteroids, and collect science along the way. Give me steering and boost controls, a shield, visible progress, and one short fact when each planet is scanned. Start directly in the playable game: one level, one screen, no menu, no setup flow, and no additional artifacts.",
    capabilities: [GET_STARTED_CAPABILITY.bench, GET_STARTED_CAPABILITY.htmlWidget],
  },
  {
    id: "read-odyssey",
    title: "Read The Odyssey",
    icon: GET_STARTED_ICON.reading,
    description: "Open The Odyssey and closely read the recognition scene in its surrounding passage.",
    prompt:
      "Download a real public-domain EPUB of The Odyssey from Project Gutenberg, bring it into this workspace, prepare it as a reading resource, and open the actual book in the Bench reader. Do not stop after downloading it or merely summarize it in chat: the book itself must be visible and open on the Bench when you finish. Locate the scene where Argos recognizes Odysseus and leave the reader open at the surrounding passage. Give me a concise, edition-grounded close reading of how waiting, disguise, recognition, and death make the scene work, without creating another artifact.",
    capabilities: [GET_STARTED_CAPABILITY.bench, GET_STARTED_CAPABILITY.reader],
  },
  {
    id: "research-question",
    title: "Why Does Roman Concrete Last?",
    icon: GET_STARTED_ICON.research,
    description: "Compare material evidence and ancient sources in one compact research brief.",
    prompt:
      "Spawn exactly two research subagents in parallel. Have one investigate the material chemistry and self-healing evidence behind Roman concrete, and the other investigate archaeological evidence and what ancient sources actually support. Put their synthesized findings into one compact, source-backed Markdown research note directly on the Bench—not in chat. Separate established evidence, current hypotheses, and unresolved questions. Do not create additional artifacts.",
    capabilities: [
      GET_STARTED_CAPABILITY.bench,
      GET_STARTED_CAPABILITY.markdown,
      GET_STARTED_CAPABILITY.research,
      GET_STARTED_CAPABILITY.subagents,
    ],
  },
  {
    id: "skills-showcase",
    title: "Why Does One pH Point Matter?",
    icon: GET_STARTED_ICON.skills,
    description: "Combine chemistry and mathematics to reveal the tenfold change hidden in one pH step.",
    prompt:
      "Load the teach-chemistry and teach-mathematics skills. Start with one sentence naming both specialized Buddy skills and what each contributes. Use the chemistry skill to render one accurate chemistry-native structure diagram of the hydronium ion directly in chat—not only a text formula—and briefly connect it to what pH measures. Then use the mathematics skill to verify with one short calculation why moving from pH 4 to pH 3 represents a tenfold change in hydrogen-ion activity. Finish with one quick prediction using the question UI. Do not research, use subagents, create files, or create a Bench artifact.",
    capabilities: [
      GET_STARTED_CAPABILITY.questionUi,
      GET_STARTED_CAPABILITY.skills,
    ],
  },
] as const satisfies readonly GetStartedChat[]

/** Teacher order: fastest classroom wow first; Grand Tour last (narrow mode shows first 3). */
const EDUCATOR_GET_STARTED_CHATS = [
  {
    id: "classroom-activity",
    title: "Interactive activity",
    icon: GET_STARTED_ICON.activity,
    description: "You’ll get a tiny mean vs median toy students can poke once.",
    prompt:
      "Create one small student-facing Bench widget for Grade 7 mean vs median — keep it minimal. One simple interaction only (for example drag a single point or toggle one outlier on/off) and show mean and median as two numbers that update. No multi-screen UI, no teacher notes, no quiz, no extra docs. Present the widget and stop. That is the only deliverable.",
    capabilities: [GET_STARTED_CAPABILITY.bench, GET_STARTED_CAPABILITY.htmlWidget],
  },
  {
    id: "whiteboard-brainstorm",
    title: "Brainstorm a unit",
    icon: GET_STARTED_ICON.brainstorm,
    description: "You’ll leave with a chosen lesson direction for teaching seasons.",
    prompt:
      "Be my brainstorming partner on the whiteboard. I need to teach Grade 8 why seasons change. Sketch 2–3 possible lesson arcs on the board and help me choose the strongest. Stay on the whiteboard — do not write a full lesson plan or other documents yet.",
    capabilities: [GET_STARTED_CAPABILITY.bench, GET_STARTED_CAPABILITY.whiteboard],
  },
  {
    id: "differentiated-task",
    title: "Differentiate a task",
    icon: GET_STARTED_ICON.differentiate,
    description: "You’ll get three ready levels of the same fractions task.",
    prompt:
      "I have a Grade 6 fractions comparison task. Write one short editable Markdown document in the Bench with three versions of the same task: support, on-level, and extension. Keep it to one page. That is the only deliverable.",
    capabilities: [
      GET_STARTED_CAPABILITY.bench,
      GET_STARTED_CAPABILITY.markdown,
      GET_STARTED_CAPABILITY.differentiation,
    ],
  },
  {
    id: "standards-lesson",
    title: "Standards lesson",
    icon: GET_STARTED_ICON.standards,
    description: "You’ll get the matching standard and a ready lesson outline.",
    prompt:
      "I teach Grade 8 science in the US. Find the single best NGSS standard for why seasons change, show the exact standard code and text, then write a short editable lesson outline in the Bench with only: objective, three timed blocks, and materials. Stop there — no handouts, quizzes, or differentiation yet.",
    capabilities: [
      GET_STARTED_CAPABILITY.bench,
      GET_STARTED_CAPABILITY.standards,
      GET_STARTED_CAPABILITY.lessonWorkspace,
    ],
  },
  BUDDY_HELP_TOUR_CHAT,
] as const satisfies readonly GetStartedChat[]

const DEFAULT_GET_STARTED_PRIMARY_USE = "learn" satisfies PrimaryUse

export function isGetStartedFlowDevtoolsMode(value: string): value is GetStartedFlowDevtoolsMode {
  return Object.values(GET_STARTED_FLOW_DEVTOOLS_MODE).some((mode) => mode === value)
}

export function getStartedChatsForPrimaryUse(
  primaryUse: PrimaryUse | undefined,
  learnerModelTier: GetStartedLearnerModelTier = GET_STARTED_LEARNER_MODEL_TIER.free,
) {
  if ((primaryUse ?? DEFAULT_GET_STARTED_PRIMARY_USE) === "teach") {
    return EDUCATOR_GET_STARTED_CHATS
  }

  return learnerModelTier === GET_STARTED_LEARNER_MODEL_TIER.connected
    ? CONNECTED_LEARNER_GET_STARTED_CHATS
    : FREE_LEARNER_GET_STARTED_CHATS
}

export function getStartedChatsForDevtoolsMode(
  devtoolsMode: Exclude<
    GetStartedFlowDevtoolsMode,
    typeof GET_STARTED_FLOW_DEVTOOLS_MODE.appState | typeof GET_STARTED_FLOW_DEVTOOLS_MODE.hidden
  >,
  learnerModelTier: GetStartedLearnerModelTier = GET_STARTED_LEARNER_MODEL_TIER.free,
): readonly GetStartedChat[] {
  return devtoolsMode === GET_STARTED_FLOW_DEVTOOLS_MODE.student
    ? getStartedChatsForPrimaryUse("learn", learnerModelTier)
    : EDUCATOR_GET_STARTED_CHATS
}
