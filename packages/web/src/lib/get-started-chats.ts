import type { PrimaryUse } from "@/state/project-config-readers"

export const GET_STARTED_CHAT_IDS = [
  "visual-explainer",
  "study-kit",
  "lesson-plan",
  "classroom-activity",
] as const
export type GetStartedChatID = (typeof GET_STARTED_CHAT_IDS)[number]

export type GetStartedChat = {
  id: GetStartedChatID
  title: string
  description: string
  prompt: string
}

export const GET_STARTED_CHAT_TEST_MODE = {
  hidden: "hidden",
  student: "student",
  teacher: "teacher",
} as const
export type GetStartedChatTestMode =
  (typeof GET_STARTED_CHAT_TEST_MODE)[keyof typeof GET_STARTED_CHAT_TEST_MODE]

const LEARNER_GET_STARTED_CHATS = [
  {
    id: "visual-explainer",
    title: "Learn through a visual",
    description: "Bench visual · practice · flashcards",
    prompt:
      "Teach me why the seasons change. Start by making a simple visual explanation in the Bench that I can explore. Then give me two short prediction questions, one at a time, and respond to my answers as we go. When we finish, make five flashcards I can keep for review. Keep the language simple, and make it clear why distance from the Sun is not what causes the seasons.",
  },
  {
    id: "study-kit",
    title: "Build a study kit",
    description: "Study guide · quiz · flashcards",
    prompt:
      "I am preparing for an exam on plate tectonics. Make me a compact study kit: create a visual study guide in the Bench that connects plate boundaries, earthquakes, volcanoes, and mountain building. Then give me a five-question quiz with feedback, and make a flashcard set I can revisit later. Start straight away without asking me for more information.",
  },
] as const satisfies readonly GetStartedChat[]

const EDUCATOR_GET_STARTED_CHATS = [
  {
    id: "lesson-plan",
    title: "Plan a lesson",
    description: "Bench plan · activity · exit ticket",
    prompt:
      "I teach a mixed-ability Year 8 science class. Build a practical 40-minute lesson on why the seasons change. Start with an editable lesson plan in the Bench. Then create a five-minute student activity and a three-question exit ticket. Include the common misconception that being closer to the Sun causes summer, and make the materials ready to use rather than theoretical.",
  },
  {
    id: "classroom-activity",
    title: "Make a classroom activity",
    description: "Interactive Bench activity · teacher notes",
    prompt:
      "Create a short, student-facing interactive activity that teaches how to read bar charts critically. Make the activity in the Bench, with one misleading chart students have to interrogate. Then write brief teacher notes explaining the intended answers and add a quick formative check I can use at the end. Keep it suitable for a mixed-ability middle-school class.",
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

export function shouldShowGetStartedChats(input: {
  hasChats: boolean
  hasStartHandler: boolean
  currentDirectoryIsInbox: boolean
  currentDirectoryHasSessions: boolean
  forceVisible: boolean
}): boolean {
  if (!input.hasChats || !input.hasStartHandler) return false
  return (
    input.forceVisible || (input.currentDirectoryIsInbox && !input.currentDirectoryHasSessions)
  )
}
