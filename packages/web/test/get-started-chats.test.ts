import { beforeEach, describe, expect, test } from "bun:test"
import {
  GET_STARTED_CAPABILITY,
  GET_STARTED_CHAT_TEST_MODE,
  getStartedChatsForPrimaryUse,
  getStartedChatsForTestMode,
} from "../src/lib/get-started-chats"
import { useGetStartedChatTestMode } from "../src/state/get-started-chat-test-mode"
import { useGetStartedFlowStore } from "../src/state/get-started-flow-store"

const LEARNER_CHAT_IDS = [
  "buddy-help-tour",
  "whiteboard-problem",
  "concept-in-motion",
  "practice-set",
  "map-and-notes",
] as const

const EDUCATOR_CHAT_IDS = [
  "buddy-help-tour",
  "whiteboard-brainstorm",
  "standards-lesson",
  "classroom-activity",
  "differentiated-task",
] as const

beforeEach(() => {
  sessionStorage.clear()
  useGetStartedChatTestMode.getState().setMode(GET_STARTED_CHAT_TEST_MODE.hidden)
})

describe("get started chats", () => {
  test("does not expose starter chats until the user chooses a primary use", () => {
    expect(getStartedChatsForPrimaryUse(undefined)).toEqual([])
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
  })

  test("maps each developer test state to the complete matching prompt set", () => {
    expect(getStartedChatsForTestMode(GET_STARTED_CHAT_TEST_MODE.hidden)).toEqual([])
    expect(
      getStartedChatsForTestMode(GET_STARTED_CHAT_TEST_MODE.student).map((chat) => chat.id),
    ).toEqual([...LEARNER_CHAT_IDS])
    expect(
      getStartedChatsForTestMode(GET_STARTED_CHAT_TEST_MODE.teacher).map((chat) => chat.id),
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

  test("updates the shared developer selection", () => {
    useGetStartedChatTestMode.getState().setMode(GET_STARTED_CHAT_TEST_MODE.teacher)
    expect(useGetStartedChatTestMode.getState().mode).toBe(GET_STARTED_CHAT_TEST_MODE.teacher)
    expect(useGetStartedFlowStore.getState().enabled).toBe(true)

    useGetStartedChatTestMode.getState().setMode(GET_STARTED_CHAT_TEST_MODE.hidden)
    expect(useGetStartedFlowStore.getState().enabled).toBe(false)
  })
})
