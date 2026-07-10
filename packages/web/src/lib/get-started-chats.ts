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
    title: "Explore projectile motion",
    prompt:
      "Help me understand projectile motion for JEE physics by building an interactive simulation in the Bench. Let me change launch speed and angle and see the trajectory, horizontal and vertical velocity, and range update together. Use the simulation to explain why horizontal velocity stays constant while vertical velocity changes, then ask me one prediction question before revealing the answer. Start by creating the interactive visual instead of giving me a long explanation.",
  },
  {
    id: "study-kit",
    title: "Build a JEE revision kit",
    prompt:
      "I am revising electrostatics for JEE. Build a compact revision kit in the Bench: a visual concept map connecting Coulomb's law, electric field, potential, and potential energy; a five-question diagnostic question set with feedback; and a focused flashcard deck based on the most common confusions. Keep formulas readable, distinguish vectors from scalars, and start immediately.",
  },
] as const satisfies readonly GetStartedChat[]

const EDUCATOR_GET_STARTED_CHATS = [
  {
    id: "lesson-plan",
    title: "Plan a standards-aligned lesson",
    prompt:
      "I teach Grade 8 science in the US. Find the most relevant NGSS standard for why seasons change and show the exact standard you selected. Then create an editable 45-minute lesson in the Bench with a misconception-first opener, a simple model-based activity, differentiation for support and extension, and a three-question exit ticket. Make it classroom-ready.",
  },
  {
    id: "classroom-activity",
    title: "Create an interactive activity",
    prompt:
      "Create a student-facing interactive activity in the Bench for a mixed-ability Grade 7 maths class where students drag data points and see mean and median update in real time. Include one deliberately misleading data set, immediate feedback, brief teacher notes, and a three-question formative check. Make it ready to use without extra setup.",
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
  enabled: boolean
  hasChats: boolean
  hasStartHandler: boolean
  currentDirectoryIsInbox: boolean
  forceVisible: boolean
}): boolean {
  if (!input.hasChats || !input.hasStartHandler) return false
  return input.forceVisible || (input.enabled && input.currentDirectoryIsInbox)
}
