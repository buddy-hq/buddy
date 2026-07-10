import { beforeEach, describe, expect, test } from "bun:test"
import {
  GET_STARTED_CHAT_TEST_MODE,
  getStartedChatsForPrimaryUse,
  getStartedChatsForTestMode,
  shouldShowGetStartedChats,
} from "../src/lib/get-started-chats"
import { useGetStartedChatTestMode } from "../src/state/get-started-chat-test-mode"

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

    expect(chats.map((chat) => chat.id)).toEqual(["visual-explainer", "study-kit"])
    expect(chats.every((chat) => chat.prompt.includes("Bench"))).toBe(true)
  })

  test("provides educator scenarios that produce classroom-ready material", () => {
    const chats = getStartedChatsForPrimaryUse("teach")

    expect(chats.map((chat) => chat.id)).toEqual(["lesson-plan", "classroom-activity"])
    expect(chats.every((chat) => chat.prompt.includes("Bench"))).toBe(true)
  })

  test("maps each developer test state to the complete matching prompt set", () => {
    expect(getStartedChatsForTestMode(GET_STARTED_CHAT_TEST_MODE.hidden)).toEqual([])
    expect(
      getStartedChatsForTestMode(GET_STARTED_CHAT_TEST_MODE.student).map((chat) => chat.id),
    ).toEqual(["visual-explainer", "study-kit"])
    expect(
      getStartedChatsForTestMode(GET_STARTED_CHAT_TEST_MODE.teacher).map((chat) => chat.id),
    ).toEqual(["lesson-plan", "classroom-activity"])
  })

  test("forces test prompts to remain visible after a chat exists", () => {
    expect(
      shouldShowGetStartedChats({
        hasChats: true,
        hasStartHandler: true,
        currentDirectoryIsInbox: false,
        currentDirectoryHasSessions: true,
        forceVisible: true,
      }),
    ).toBe(true)

    expect(
      shouldShowGetStartedChats({
        hasChats: true,
        hasStartHandler: true,
        currentDirectoryIsInbox: true,
        currentDirectoryHasSessions: true,
        forceVisible: false,
      }),
    ).toBe(false)
  })

  test("updates the shared developer selection", () => {
    useGetStartedChatTestMode.getState().setMode(GET_STARTED_CHAT_TEST_MODE.teacher)
    expect(useGetStartedChatTestMode.getState().mode).toBe(GET_STARTED_CHAT_TEST_MODE.teacher)
  })
})
