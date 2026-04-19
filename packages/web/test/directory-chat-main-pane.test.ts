import { describe, expect, test } from "bun:test"
import {
  resolveAutoCompactionWarning,
  resolveCurrentSessionQuestions,
} from "../src/components/directory-chat/directory-chat-main-pane"
import {
  createAssistantMessageInfo,
  createMessageWithParts,
  createProviderInfo,
  createProviderModelInfo,
} from "./test-utils"

describe("directory chat main pane helpers", () => {
  test("shows only pending questions for the active session", () => {
    const questions = resolveCurrentSessionQuestions({
      sessionID: "session-2",
      pendingQuestions: [
        {
          id: "question-1",
          sessionID: "session-1",
          questions: [],
        },
        {
          id: "question-2",
          sessionID: "session-2",
          questions: [],
        },
      ],
    })

    expect(questions.map((question) => question.id)).toEqual(["question-2"])
  })

  test("suppresses compaction warnings when auto-compaction is disabled", () => {
    const warning = resolveAutoCompactionWarning({
      autoCompactionEnabled: false,
      providers: [
        createProviderInfo({
          id: "anthropic",
          connected: true,
          models: [
            createProviderModelInfo({
              id: "sonnet",
              providerID: "anthropic",
              limit: {
                context: 200_000,
                input: 200_000,
                output: 32_000,
              },
            }),
          ],
        }),
      ],
      messages: [
        createMessageWithParts(
          createAssistantMessageInfo({
            id: "assistant-1",
            sessionID: "session-1",
            providerID: "anthropic",
            modelID: "sonnet",
            time: { created: 1 },
            tokens: {
              input: 170_000,
              output: 10_000,
              reasoning: 0,
              cache: {
                read: 0,
                write: 0,
              },
            },
            cost: 0,
          }),
        ),
      ],
    })

    expect(warning).toBeUndefined()
  })
})
