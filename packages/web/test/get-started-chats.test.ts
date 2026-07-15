import { beforeEach, describe, expect, test } from "bun:test"
import {
  GET_STARTED_CAPABILITY,
  GET_STARTED_FLOW_DEVTOOLS_MODE,
  getStartedChatsForPrimaryUse,
  getStartedChatsForDevtoolsMode,
} from "../src/lib/get-started-chats"
import { useGetStartedFlowDevtools } from "../src/state/get-started-flow-devtools"
import { useGetStartedFlowStore } from "../src/state/get-started-flow-store"

const LEARNER_CHAT_IDS = [
  "whiteboard-problem",
  "concept-in-motion",
  "read-a-classic",
  "practice-set",
  "buddy-help-tour",
] as const

const EDUCATOR_CHAT_IDS = [
  "classroom-activity",
  "whiteboard-brainstorm",
  "differentiated-task",
  "standards-lesson",
  "buddy-help-tour",
] as const

beforeEach(() => {
  sessionStorage.clear()
  useGetStartedFlowDevtools.getState().setMode(GET_STARTED_FLOW_DEVTOOLS_MODE.appState)
  useGetStartedFlowStore.getState().setEnabled(true)
})

describe("get started chats", () => {
  test("falls back to learner prompts when personalization has no audience", () => {
    expect(getStartedChatsForPrimaryUse(undefined).map((chat) => chat.id)).toEqual([
      ...LEARNER_CHAT_IDS,
    ])
  })

  test("provides learner scenarios that explicitly demonstrate Bench work", () => {
    const chats = getStartedChatsForPrimaryUse("learn")

    expect(chats.map((chat) => chat.id)).toEqual([...LEARNER_CHAT_IDS])
    expect(chats).toHaveLength(5)
    expect(
      chats.every(
        (chat) =>
          chat.prompt.toLowerCase().includes("bench") ||
          chat.prompt.toLowerCase().includes("whiteboard"),
      ),
    ).toBe(true)
    expect(chats.every((chat) => chat.capabilities.includes(GET_STARTED_CAPABILITY.bench))).toBe(
      true,
    )
    expect(chats.every((chat) => chat.capabilities.length > 0)).toBe(true)
    expect(chats.every((chat) => chat.description.trim().length > 0)).toBe(true)
    expect(chats.every((chat) => chat.icon.trim().length > 0)).toBe(true)
    expect(chats.find((chat) => chat.id === "buddy-help-tour")?.title).toBe("Take the Grand Tour")
    expect(chats.find((chat) => chat.id === "buddy-help-tour")?.icon).toBe("tour")
    const classic = chats.find((chat) => chat.id === "read-a-classic")
    expect(classic?.title).toBe("Read a Classic")
    expect(classic?.icon).toBe("reading")
    expect(classic?.prompt.toLowerCase()).toContain("gutenberg")
    expect(classic?.prompt.toLowerCase()).toContain("epub")
    expect(classic?.prompt.toLowerCase()).toContain("bench")
    expect(classic?.prompt.toLowerCase()).toContain("reader")
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
    expect(chats.every((chat) => chat.capabilities.includes(GET_STARTED_CAPABILITY.bench))).toBe(
      true,
    )
    expect(chats.every((chat) => chat.capabilities.length > 0)).toBe(true)
    expect(chats.every((chat) => chat.description.trim().length > 0)).toBe(true)
    expect(chats.every((chat) => chat.icon.trim().length > 0)).toBe(true)
  })

  test("maps each developer audience override to the complete matching prompt set", () => {
    expect(
      getStartedChatsForDevtoolsMode(GET_STARTED_FLOW_DEVTOOLS_MODE.student).map(
        (chat) => chat.id,
      ),
    ).toEqual([...LEARNER_CHAT_IDS])
    expect(
      getStartedChatsForDevtoolsMode(GET_STARTED_FLOW_DEVTOOLS_MODE.teacher).map(
        (chat) => chat.id,
      ),
    ).toEqual([...EDUCATOR_CHAT_IDS])
  })

  test("shares the Buddy Help tour across student and teacher starters", () => {
    const studentTour = getStartedChatsForPrimaryUse("learn").find(
      (chat) => chat.id === "buddy-help-tour",
    )
    const teacherTour = getStartedChatsForPrimaryUse("teach").find(
      (chat) => chat.id === "buddy-help-tour",
    )

    expect(studentTour).toBeDefined()
    expect(teacherTour).toBe(studentTour)
    expect(studentTour?.prompt.toLowerCase()).toContain("buddy-help")
    expect(studentTour?.capabilities).toContain(GET_STARTED_CAPABILITY.buddyHelp)
    expect(studentTour?.capabilities).toContain(GET_STARTED_CAPABILITY.htmlWidget)
  })

  test("keeps the developer audience independent from the shared visibility preference", () => {
    useGetStartedFlowStore.getState().setEnabled(false)
    useGetStartedFlowDevtools.getState().setMode(GET_STARTED_FLOW_DEVTOOLS_MODE.teacher)
    expect(useGetStartedFlowDevtools.getState().mode).toBe(
      GET_STARTED_FLOW_DEVTOOLS_MODE.teacher,
    )
    expect(useGetStartedFlowStore.getState().enabled).toBe(false)

    useGetStartedFlowStore.getState().setEnabled(true)
    useGetStartedFlowDevtools.getState().setMode(GET_STARTED_FLOW_DEVTOOLS_MODE.hidden)
    expect(useGetStartedFlowStore.getState().enabled).toBe(true)

    useGetStartedFlowDevtools.getState().setMode(GET_STARTED_FLOW_DEVTOOLS_MODE.appState)
    expect(useGetStartedFlowStore.getState().enabled).toBe(true)
  })
})
