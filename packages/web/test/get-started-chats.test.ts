import { beforeEach, describe, expect, test } from "bun:test"
import {
  GET_STARTED_CAPABILITY,
  GET_STARTED_FLOW_DEVTOOLS_MODE,
  GET_STARTED_LEARNER_MODEL_TIER,
  getStartedChatsForPrimaryUse,
  getStartedChatsForDevtoolsMode,
  resolveGetStartedLearnerModelTier,
  type GetStartedCapability,
  type GetStartedChat,
} from "../src/lib/get-started-chats"
import { useGetStartedFlowDevtools } from "../src/state/get-started-flow-devtools"
import { useGetStartedFlowStore } from "../src/state/get-started-flow-store"

const LEARNER_CHAT_IDS = [
  "whiteboard-explainer",
  "interactive-simulation",
  "read-odyssey",
  "research-question",
  "skills-showcase",
] as const

const EDUCATOR_CHAT_IDS = [
  "classroom-activity",
  "whiteboard-brainstorm",
  "differentiated-task",
  "standards-lesson",
  "buddy-help-tour",
] as const

function hasCapability(chat: GetStartedChat, capability: GetStartedCapability): boolean {
  return chat.capabilities.includes(capability)
}

beforeEach(() => {
  sessionStorage.clear()
  useGetStartedFlowDevtools.getState().setMode(GET_STARTED_FLOW_DEVTOOLS_MODE.appState)
  useGetStartedFlowStore.getState().setEnabled(true)
})

describe("get started chats", () => {
  test("falls back to bounded learner prompts when personalization and model are unavailable", () => {
    expect(getStartedChatsForPrimaryUse(undefined).map((chat) => chat.id)).toEqual([
      ...LEARNER_CHAT_IDS,
    ])
    expect(getStartedChatsForPrimaryUse(undefined)[0]?.title).toBe("How Does an AI Agent Work?")
  })

  test("provides five bounded learner scenarios for the anonymous free model", () => {
    const chats = getStartedChatsForPrimaryUse("learn")

    expect(chats.map((chat) => chat.id)).toEqual([...LEARNER_CHAT_IDS])
    expect(chats).toHaveLength(5)
    expect(
      chats.slice(0, 4).every((chat) => hasCapability(chat, GET_STARTED_CAPABILITY.bench)),
    ).toBe(true)
    expect(chats.every((chat) => chat.capabilities.length > 0)).toBe(true)
    expect(chats.every((chat) => chat.description.trim().length > 0)).toBe(true)
    expect(chats.every((chat) => chat.icon.trim().length > 0)).toBe(true)
    expect(chats.find((chat) => chat.id === "interactive-simulation")?.title).toBe(
      "Release a Double Pendulum",
    )
    const classic = chats.find((chat) => chat.id === "read-odyssey")
    expect(classic?.title).toBe("Read The Odyssey")
    expect(classic?.icon).toBe("reading")
    expect(classic?.prompt.toLowerCase()).toContain("gutenberg")
    expect(classic?.prompt.toLowerCase()).toContain("epub")
    expect(classic?.prompt.toLowerCase()).toContain("bench")
    expect(classic?.prompt.toLowerCase()).toContain("reader")
    expect(classic?.prompt.toLowerCase()).toContain("book itself must be visible and open")
    expect(chats[1]?.prompt.toLowerCase()).toContain("directly on the bench")
    const research = chats.find((chat) => chat.id === "research-question")
    expect(research?.prompt.toLowerCase()).toContain("exactly one research subagent")
    const skills = chats.find((chat) => chat.id === "skills-showcase")
    expect(skills?.title).toBe("Decode Caffeine")
    expect(skills?.capabilities).toContain(GET_STARTED_CAPABILITY.skills)
    expect(skills?.prompt.toLowerCase()).toContain("load the teach-chemistry skill")
    expect(skills?.prompt.toLowerCase()).toContain("one accurate chemistry structure")
  })

  test("provides five richer learner scenarios for connected models", () => {
    const chats = getStartedChatsForPrimaryUse(
      "learn",
      GET_STARTED_LEARNER_MODEL_TIER.connected,
    )

    expect(chats.map((chat) => chat.id)).toEqual([...LEARNER_CHAT_IDS])
    expect(chats).toHaveLength(5)
    expect(chats[0]?.title).toBe("How Does Buddy Work?")
    expect(chats[1]?.title).toBe("Travel Through Space")
    expect(chats[2]?.title).toBe("Read The Odyssey")
    expect(chats[2]?.prompt.toLowerCase()).toContain("book itself must be visible and open")
    expect(chats[3]?.title).toBe("Why Does Roman Concrete Last?")
    expect(chats[3]?.prompt.toLowerCase()).toContain("exactly two research subagents in parallel")
    expect(chats[3]?.prompt.toLowerCase()).toContain("directly on the bench—not in chat")
    expect(chats[4]?.title).toBe("Why Does One pH Point Matter?")
    expect(chats[4]?.prompt.toLowerCase()).toContain(
      "load the teach-chemistry and teach-mathematics skills",
    )
    expect(chats[4]?.prompt.toLowerCase()).toContain(
      "chemistry-native structure diagram of the hydronium ion",
    )
    expect(chats[4]?.prompt.toLowerCase()).toContain("tenfold change")
  })

  test("derives the learner prompt tier from the active provider model", () => {
    expect(resolveGetStartedLearnerModelTier(undefined)).toBe(GET_STARTED_LEARNER_MODEL_TIER.free)
    expect(resolveGetStartedLearnerModelTier("opencode/deepseek-v4-flash-free")).toBe(
      GET_STARTED_LEARNER_MODEL_TIER.free,
    )
    expect(resolveGetStartedLearnerModelTier("openai/gpt-5.6-sol")).toBe(
      GET_STARTED_LEARNER_MODEL_TIER.connected,
    )
  })

  test("provides educator scenarios that produce classroom-ready material", () => {
    const chats = getStartedChatsForPrimaryUse("teach")

    expect(chats.map((chat) => chat.id)).toEqual([...EDUCATOR_CHAT_IDS])
    expect(chats).toHaveLength(5)
    expect(
      chats.every(
        (chat) =>
          chat.prompt.toLowerCase().includes("bench") ||
          chat.prompt.toLowerCase().includes("whiteboard"),
      ),
    ).toBe(true)
    expect(chats.every((chat) => hasCapability(chat, GET_STARTED_CAPABILITY.bench))).toBe(true)
    expect(chats.every((chat) => chat.capabilities.length > 0)).toBe(true)
    expect(chats.every((chat) => chat.description.trim().length > 0)).toBe(true)
    expect(chats.every((chat) => chat.icon.trim().length > 0)).toBe(true)
  })

  test("maps each developer audience override to the complete matching prompt set", () => {
    expect(
      getStartedChatsForDevtoolsMode(GET_STARTED_FLOW_DEVTOOLS_MODE.student).map((chat) => chat.id),
    ).toEqual([...LEARNER_CHAT_IDS])
    expect(
      getStartedChatsForDevtoolsMode(
        GET_STARTED_FLOW_DEVTOOLS_MODE.student,
        GET_STARTED_LEARNER_MODEL_TIER.connected,
      )[0]?.title,
    ).toBe("How Does Buddy Work?")
    expect(
      getStartedChatsForDevtoolsMode(GET_STARTED_FLOW_DEVTOOLS_MODE.teacher).map((chat) => chat.id),
    ).toEqual([...EDUCATOR_CHAT_IDS])
  })

  test("keeps the existing Buddy Help tour scoped to educator starters", () => {
    const studentTour = getStartedChatsForPrimaryUse("learn").find(
      (chat) => chat.id === "buddy-help-tour",
    )
    const teacherTour = getStartedChatsForPrimaryUse("teach").find(
      (chat) => chat.id === "buddy-help-tour",
    )

    expect(studentTour).toBeUndefined()
    expect(teacherTour).toBeDefined()
    expect(teacherTour?.prompt.toLowerCase()).toContain("buddy-help")
    expect(teacherTour?.capabilities).toContain(GET_STARTED_CAPABILITY.buddyHelp)
    expect(teacherTour?.capabilities).toContain(GET_STARTED_CAPABILITY.htmlWidget)
  })

  test("keeps the developer audience independent from the shared visibility preference", () => {
    useGetStartedFlowStore.getState().setEnabled(false)
    useGetStartedFlowDevtools.getState().setMode(GET_STARTED_FLOW_DEVTOOLS_MODE.teacher)
    expect(useGetStartedFlowDevtools.getState().mode).toBe(GET_STARTED_FLOW_DEVTOOLS_MODE.teacher)
    expect(useGetStartedFlowStore.getState().enabled).toBe(false)

    useGetStartedFlowStore.getState().setEnabled(true)
    useGetStartedFlowDevtools.getState().setMode(GET_STARTED_FLOW_DEVTOOLS_MODE.hidden)
    expect(useGetStartedFlowStore.getState().enabled).toBe(true)

    useGetStartedFlowDevtools.getState().setMode(GET_STARTED_FLOW_DEVTOOLS_MODE.appState)
    expect(useGetStartedFlowStore.getState().enabled).toBe(true)
  })
})
