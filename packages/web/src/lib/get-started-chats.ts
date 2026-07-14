import type { PrimaryUse } from "@/state/project-config-readers"

export const GET_STARTED_CHAT_IDS = [
  "buddy-help-tour",
  "whiteboard-problem",
  "concept-in-motion",
  "practice-set",
  "map-and-notes",
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
} as const satisfies Record<GetStartedCapability, string>

export type GetStartedChat = {
  id: GetStartedChatID
  title: string
  prompt: string
  capabilities: readonly GetStartedCapability[]
}

export const GET_STARTED_CHAT_TEST_MODE = {
  hidden: "hidden",
  student: "student",
  teacher: "teacher",
} as const
export type GetStartedChatTestMode =
  (typeof GET_STARTED_CHAT_TEST_MODE)[keyof typeof GET_STARTED_CHAT_TEST_MODE]

const BUDDY_HELP_TOUR_CHAT = {
  id: "buddy-help-tour",
  title: "Ask about Buddy",
  prompt:
    "Load the buddy-help skill. Using only what buddy-help actually says, build one interactive Bench widget that sketches what Buddy Help is and how I can ask Buddy anything about the app — layout, Bench, notebooks, Practice, Sources, Settings, and more. Show a few example questions I can type next time. Keep the chat short; put the tour in the widget. That is the only deliverable.",
  capabilities: [
    GET_STARTED_CAPABILITY.bench,
    GET_STARTED_CAPABILITY.htmlWidget,
    GET_STARTED_CAPABILITY.buddyHelp,
  ],
} as const satisfies GetStartedChat

const LEARNER_GET_STARTED_CHATS = [
  BUDDY_HELP_TOUR_CHAT,
  {
    id: "whiteboard-problem",
    title: "Solve on the board",
    prompt:
      "Walk me through solving a quadratic equation step by step on the whiteboard. Draw a clear worked example for x^2 - 5x + 6 = 0 on the board, then give me a similar problem and coach me with short steps. Use the question UI when you need my next step or prediction. Do not dump the full solution at once.",
    capabilities: [
      GET_STARTED_CAPABILITY.bench,
      GET_STARTED_CAPABILITY.whiteboard,
      GET_STARTED_CAPABILITY.workedExample,
      GET_STARTED_CAPABILITY.questionUi,
    ],
  },
  {
    id: "concept-in-motion",
    title: "Play with a simulation",
    prompt:
      "Help me understand natural selection. Build an interactive simulation in the Bench with a beetle population where I can change camouflage color and predator pressure and see how the population shifts over generations. Use the widget to teach, then ask me one prediction in the question UI before revealing why. Start by creating the interactive visual instead of giving me a long explanation.",
    capabilities: [
      GET_STARTED_CAPABILITY.bench,
      GET_STARTED_CAPABILITY.htmlWidget,
      GET_STARTED_CAPABILITY.questionUi,
    ],
  },
  {
    id: "practice-set",
    title: "Cards and a quiz",
    prompt:
      "I am learning photosynthesis for high school biology. Create a Practice pack on the Bench: a focused flashcard deck (basic and cloze cards, one idea per card) for the most common confusions, and a 6-question MCQ set with feedback and short explanations. Save both so I can review later from Practice.",
    capabilities: [
      GET_STARTED_CAPABILITY.bench,
      GET_STARTED_CAPABILITY.flashcards,
      GET_STARTED_CAPABILITY.questionSets,
      GET_STARTED_CAPABILITY.practiceRail,
    ],
  },
  {
    id: "map-and-notes",
    title: "Diagram a concept",
    prompt:
      "Explain the difference between correlation and causation for a first-year student. Put a clear Mermaid diagram on the Bench that shows how a confounder can create a fake relationship, then write a short editable Markdown study note with: the key idea, 2 good examples, 1 bad example, and a 3-bullet self-check. Start with the diagram, not a long lecture.",
    capabilities: [
      GET_STARTED_CAPABILITY.bench,
      GET_STARTED_CAPABILITY.mermaidDiagram,
      GET_STARTED_CAPABILITY.markdown,
    ],
  },
] as const satisfies readonly GetStartedChat[]

const EDUCATOR_GET_STARTED_CHATS = [
  BUDDY_HELP_TOUR_CHAT,
  {
    id: "whiteboard-brainstorm",
    title: "Brainstorm a unit",
    prompt:
      "Be my brainstorming partner on the whiteboard. I need to teach Grade 8 why seasons change. Sketch 2–3 possible lesson arcs on the board and help me choose the strongest. Stay on the whiteboard — do not write a full lesson plan or other documents yet.",
    capabilities: [GET_STARTED_CAPABILITY.bench, GET_STARTED_CAPABILITY.whiteboard],
  },
  {
    id: "standards-lesson",
    title: "Standards lesson",
    prompt:
      "I teach Grade 8 science in the US. Find the single best NGSS standard for why seasons change, show the exact standard code and text, then write a short editable lesson outline in the Bench with only: objective, three timed blocks, and materials. Stop there — no handouts, quizzes, or differentiation yet.",
    capabilities: [
      GET_STARTED_CAPABILITY.bench,
      GET_STARTED_CAPABILITY.standards,
      GET_STARTED_CAPABILITY.lessonWorkspace,
    ],
  },
  {
    id: "classroom-activity",
    title: "Interactive activity",
    prompt:
      "Create one student-facing interactive Bench widget for Grade 7 mean vs median with outliers. Students drag data points and both statistics update live. That is the only deliverable — no teacher notes, quizzes, or extra docs.",
    capabilities: [GET_STARTED_CAPABILITY.bench, GET_STARTED_CAPABILITY.htmlWidget],
  },
  {
    id: "differentiated-task",
    title: "Differentiate a task",
    prompt:
      "I have a Grade 6 fractions comparison task. Write one short editable Markdown document in the Bench with three versions of the same task: support, on-level, and extension. Keep it to one page. That is the only deliverable.",
    capabilities: [
      GET_STARTED_CAPABILITY.bench,
      GET_STARTED_CAPABILITY.markdown,
      GET_STARTED_CAPABILITY.differentiation,
    ],
  },
] as const satisfies readonly GetStartedChat[]

const GET_STARTED_CHATS_BY_PRIMARY_USE = {
  learn: LEARNER_GET_STARTED_CHATS,
  teach: EDUCATOR_GET_STARTED_CHATS,
} as const satisfies Record<PrimaryUse, readonly GetStartedChat[]>

const EMPTY_GET_STARTED_CHATS: readonly GetStartedChat[] = []

export function isGetStartedChatTestMode(value: string): value is GetStartedChatTestMode {
  return Object.values(GET_STARTED_CHAT_TEST_MODE).some((mode) => mode === value)
}

export function getStartedChatsForPrimaryUse(primaryUse: PrimaryUse | undefined) {
  if (!primaryUse) return EMPTY_GET_STARTED_CHATS
  return GET_STARTED_CHATS_BY_PRIMARY_USE[primaryUse]
}

export function getStartedChatsForTestMode(
  testMode: GetStartedChatTestMode,
): readonly GetStartedChat[] {
  if (testMode === GET_STARTED_CHAT_TEST_MODE.student) {
    return LEARNER_GET_STARTED_CHATS
  }
  if (testMode === GET_STARTED_CHAT_TEST_MODE.teacher) {
    return EDUCATOR_GET_STARTED_CHATS
  }
  return EMPTY_GET_STARTED_CHATS
}
