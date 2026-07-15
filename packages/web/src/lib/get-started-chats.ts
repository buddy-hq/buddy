import type { PrimaryUse } from "@/state/project-config-readers"

export const GET_STARTED_CHAT_IDS = [
  "buddy-help-tour",
  "whiteboard-problem",
  "concept-in-motion",
  "practice-set",
  "read-a-classic",
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
} as const satisfies Record<GetStartedCapability, string>

/** Lucide icon keys resolved in the board UI. */
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
} as const
export type GetStartedIconId = (typeof GET_STARTED_ICON)[keyof typeof GET_STARTED_ICON]

export type GetStartedChat = {
  id: GetStartedChatID
  title: string
  /** Leading Lucide icon on board cards (not sidebar). */
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

/** Learner order: fastest wow first; Grand Tour last (narrow mode shows first 3). */
const LEARNER_GET_STARTED_CHATS = [
  {
    id: "whiteboard-problem",
    title: "Solve on the Board",
    icon: GET_STARTED_ICON.whiteboard,
    description: "You’ll leave with a solved quadratic and a second problem you can try yourself.",
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
    title: "Run a Population Sim",
    icon: GET_STARTED_ICON.simulation,
    description: "You’ll get a tiny natural-selection toy you can tweak once.",
    prompt:
      "Help me get the idea of natural selection. Build one small interactive Bench widget only: a beetle population with a single slider (predator pressure) and a simple count or bar that updates. No multi-screen UI, no long tutorial copy. Start with the widget, keep chat short, and stop after one brief line on what I can try. That is the only deliverable — no quiz and no second artifact.",
    capabilities: [
      GET_STARTED_CAPABILITY.bench,
      GET_STARTED_CAPABILITY.htmlWidget,
    ],
  },
  {
    id: "read-a-classic",
    title: "Read a Classic",
    icon: GET_STARTED_ICON.reading,
    description: "You’ll get a free classic open in the reader, ready to study with Buddy.",
    prompt:
      "Help me start reading a free classic from Project Gutenberg. Load the reading skill first, then work from it. Prefer The Adventures of Sherlock Holmes (Arthur Conan Doyle) if it has a real EPUB download; otherwise pick another short, well-known public-domain classic with a real EPUB. Bring that EPUB into this workspace, prepare it as a reading resource, open it on the Bench reader, and then help me begin — a short grounded orientation to the book and one clear next reading step. Prefer EPUB over plain text so the built-in reader can open it. Keep the chat short; put the book on Bench, not a long lecture in chat. Do not use the to-do list tool for this. When you finish, briefly tell me what you did (which book, that it’s open in the reader), then invite me to select something in the book and see what happens.",
    capabilities: [
      GET_STARTED_CAPABILITY.bench,
      GET_STARTED_CAPABILITY.reader,
    ],
  },
  {
    id: "practice-set",
    title: "Make Flashcards",
    icon: GET_STARTED_ICON.practice,
    description: "You’ll get a tiny 5-card deck you can open in Practice.",
    prompt:
      "I am learning photosynthesis for high school biology. Create exactly one flashcard deck on the Bench with exactly 5 cards (basic and cloze mix, one idea per card) for the most common confusions. Save it so I can open it in Practice. Do not create a quiz, question set, or any other artifact. Keep the chat short.",
    capabilities: [
      GET_STARTED_CAPABILITY.bench,
      GET_STARTED_CAPABILITY.flashcards,
      GET_STARTED_CAPABILITY.practiceRail,
    ],
  },
  BUDDY_HELP_TOUR_CHAT,
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

const GET_STARTED_CHATS_BY_PRIMARY_USE = {
  learn: LEARNER_GET_STARTED_CHATS,
  teach: EDUCATOR_GET_STARTED_CHATS,
} as const satisfies Record<PrimaryUse, readonly GetStartedChat[]>

const DEFAULT_GET_STARTED_PRIMARY_USE = "learn" satisfies PrimaryUse

export function isGetStartedFlowDevtoolsMode(value: string): value is GetStartedFlowDevtoolsMode {
  return Object.values(GET_STARTED_FLOW_DEVTOOLS_MODE).some((mode) => mode === value)
}

export function getStartedChatsForPrimaryUse(primaryUse: PrimaryUse | undefined) {
  return GET_STARTED_CHATS_BY_PRIMARY_USE[primaryUse ?? DEFAULT_GET_STARTED_PRIMARY_USE]
}

export function getStartedChatsForDevtoolsMode(
  devtoolsMode: Exclude<
    GetStartedFlowDevtoolsMode,
    | typeof GET_STARTED_FLOW_DEVTOOLS_MODE.appState
    | typeof GET_STARTED_FLOW_DEVTOOLS_MODE.hidden
  >,
): readonly GetStartedChat[] {
  return devtoolsMode === GET_STARTED_FLOW_DEVTOOLS_MODE.student
    ? LEARNER_GET_STARTED_CHATS
    : EDUCATOR_GET_STARTED_CHATS
}
