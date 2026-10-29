import "../happydom"
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import type { QuestionRequest } from "../src/state/chat-types"

const DIRECTORY = "/workspace/load-questions-test"
let questionListResult = Promise.withResolvers<QuestionRequest[]>()
const questionList = mock(async () => ({
  data: await questionListResult.promise,
  error: undefined,
  response: new Response(null, { status: 200 }),
}))

const buddyClient = await import("../src/lib/buddy-client")
mock.module("@/lib/buddy-client", () => ({
  ...buddyClient,
  getBuddyClient: () => ({ question: { list: questionList } }),
}))

const [
  { loadQuestions, recordQuestionAsked, recordQuestionSettled },
  { useChatStore },
  { resetTranscriptRepositoryForTests },
] = await Promise.all([
  import("../src/state/chat-actions"),
  import("../src/state/chat-store"),
  import("../src/state/transcript-repository"),
])

describe("loadQuestions", () => {
  beforeEach(() => {
    localStorage.clear()
    questionList.mockClear()
    questionListResult = Promise.withResolvers<QuestionRequest[]>()
    resetTranscriptRepositoryForTests()
    useChatStore.setState({ directories: {}, lastSessionByDirectory: {}, openProjects: [] })
    useChatStore.getState().ensureOpenProject(DIRECTORY)
  })

  afterEach(() => {
    useChatStore.setState({ directories: {}, lastSessionByDirectory: {}, openProjects: [] })
    resetTranscriptRepositoryForTests()
  })

  test("keeps a question asked while the list is loading", async () => {
    const request: QuestionRequest = { id: "q-new", sessionID: "session-1", questions: [] }
    const loading = loadQuestions(DIRECTORY)
    try {
      recordQuestionAsked(DIRECTORY, request)
      useChatStore.getState().applyQuestionAsked(DIRECTORY, request)
    } finally {
      questionListResult.resolve([])
      await loading
    }

    expect(useChatStore.getState().directories[DIRECTORY]?.pendingQuestions).toEqual([request])
  })

  test("drops a question settled while the list is loading", async () => {
    const request: QuestionRequest = { id: "q-old", sessionID: "session-1", questions: [] }
    useChatStore.getState().applyQuestionAsked(DIRECTORY, request)
    const loading = loadQuestions(DIRECTORY)
    try {
      recordQuestionSettled(DIRECTORY, request.id)
      useChatStore.getState().applyQuestionResolved(DIRECTORY, request.id)
    } finally {
      questionListResult.resolve([request])
      await loading
    }

    expect(useChatStore.getState().directories[DIRECTORY]?.pendingQuestions).toEqual([])
  })
})
