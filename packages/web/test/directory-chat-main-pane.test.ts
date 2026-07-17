import { describe, expect, test } from "bun:test"
import {
  resolveRevertedUserMessageCount,
  resolveAutoCompactionWarning,
  resolveCurrentSessionQuestions,
} from "../src/components/directory-chat/directory-chat-main-pane"
import { canEditImagesForModel } from "../src/lib/image-editing"
import {
  createAssistantMessageInfo,
  createMessageWithParts,
  createProviderInfo,
  createProviderModelInfo,
  createUserMessageInfo,
} from "./test-utils"

describe("directory chat main pane helpers", () => {
  test("offers image editing only to image-capable OpenAI models", () => {
    expect(
      canEditImagesForModel({
        providerID: "openai",
        acceptsImages: true,
        chatGptOAuthReady: true,
      }),
    ).toBe(true)
    expect(
      canEditImagesForModel({
        providerID: "anthropic",
        acceptsImages: true,
        chatGptOAuthReady: true,
      }),
    ).toBe(false)
    expect(
      canEditImagesForModel({
        providerID: "openai",
        acceptsImages: false,
        chatGptOAuthReady: true,
      }),
    ).toBe(false)
    expect(
      canEditImagesForModel({
        providerID: "openai",
        acceptsImages: true,
        chatGptOAuthReady: false,
      }),
    ).toBe(false)
  })

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

  test("counts only reverted user messages for the restore banner", () => {
    const count = resolveRevertedUserMessageCount({
      revertMessageID: "msg-2",
      messages: [
        createMessageWithParts(createUserMessageInfo({ id: "msg-1", sessionID: "session-1" })),
        createMessageWithParts(
          createAssistantMessageInfo({ id: "assistant-1", sessionID: "session-1" }),
        ),
        createMessageWithParts(createUserMessageInfo({ id: "msg-2", sessionID: "session-1" })),
        createMessageWithParts(
          createAssistantMessageInfo({ id: "assistant-2", sessionID: "session-1" }),
        ),
        createMessageWithParts(createUserMessageInfo({ id: "msg-3", sessionID: "session-1" })),
      ],
    })

    expect(count).toBe(2)
  })
})
