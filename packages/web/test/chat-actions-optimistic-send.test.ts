import "../happydom"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"

import { projectTimelineRows, type TimelineRow } from "../src/components/chat/chat-timeline-rows"
import {
  BUDDY_PROMPT_PART_METADATA_KEY,
  SELECTION_CONTEXT_PART_TYPE,
  TEXT_FILE_ATTACHMENT_PART_TYPE,
} from "../src/components/prompt/prompt-types"
import { sendPrompt } from "../src/state/chat-actions"
import { useChatStore } from "../src/state/chat-store"
import {
  getTranscriptMessages,
  resetTranscriptRepositoryForTests,
} from "../src/state/transcript-repository"
import {
  createAssistantMessageInfo,
  createFetchStub,
  createMessageWithParts,
  createUserMessageInfo,
  seedDirectoryChatState,
} from "./test-utils"

const DIRECTORY = "/repo-optimistic-send"
const SESSION_ID = "ses_optimistic_send"

describe("optimistic prompt send", () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
    globalThis.fetch = createFetchStub(async () => new Response(null, { status: 204 }))
    resetTranscriptRepositoryForTests()
    useChatStore.setState({ directories: {} })
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    useChatStore.setState({ directories: {} })
    resetTranscriptRepositoryForTests()
  })

  test("publishes the optimistic user turn before busy thinking", async () => {
    const previousUserMessageID = "msg_previous_user"
    const previousAssistantMessageID = "msg_previous_assistant"
    seedDirectoryChatState(DIRECTORY, {
      sessionID: SESSION_ID,
      messages: [
        createMessageWithParts(
          createUserMessageInfo({ id: previousUserMessageID, sessionID: SESSION_ID }),
          [
            {
              id: "prt_previous_user",
              sessionID: SESSION_ID,
              messageID: previousUserMessageID,
              type: "text",
              text: "Previous prompt",
            },
          ],
        ),
        createMessageWithParts(
          createAssistantMessageInfo({
            id: previousAssistantMessageID,
            sessionID: SESSION_ID,
            parentID: previousUserMessageID,
            finish: "stop",
          }),
          [
            {
              id: "prt_previous_assistant",
              sessionID: SESSION_ID,
              messageID: previousAssistantMessageID,
              type: "text",
              text: "Previous response",
              time: { start: 1, end: 2 },
            },
          ],
        ),
      ],
    })

    const selection = {
      type: SELECTION_CONTEXT_PART_TYPE,
      source: "markdown" as const,
      text: "A tall selected document excerpt",
      selectionKey: "selection-optimistic-send",
      path: "notes/product.md",
    }
    let rowsBeforePost: TimelineRow[] | undefined
    let messagesBeforePost = getTranscriptMessages(DIRECTORY, SESSION_ID)

    await sendPrompt(DIRECTORY, "", {
      sessionID: SESSION_ID,
      parts: [selection],
      optimisticParts: [selection],
      beforePostPrompt: async () => {
        messagesBeforePost = getTranscriptMessages(DIRECTORY, SESSION_ID)
        rowsBeforePost = projectTimelineRows({
          messages: messagesBeforePost,
          isBusy: true,
          sessionID: SESSION_ID,
          directory: DIRECTORY,
          activeSessionStatus: { type: "busy" },
          showReasoningSummaries: true,
        })
      },
    })

    const optimisticUserMessage = messagesBeforePost.at(-1)
    expect(optimisticUserMessage?.info.role).toBe("user")
    expect(optimisticUserMessage?.info.id).not.toBe(previousUserMessageID)
    expect(optimisticUserMessage?.parts).toEqual([
      expect.objectContaining({
        type: SELECTION_CONTEXT_PART_TYPE,
        text: selection.text,
        optimistic: true,
      }),
    ])

    const tailRows = rowsBeforePost?.slice(-2)
    expect(tailRows?.map((row) => row.type)).toEqual(["user", "activity"])
    expect(tailRows?.[0]?.userMessageID).toBe(optimisticUserMessage?.info.id)
    expect(tailRows?.[1]?.userMessageID).toBe(optimisticUserMessage?.info.id)
  })

  test("keeps typed content beside an optimistic text-file attachment", async () => {
    seedDirectoryChatState(DIRECTORY, {
      sessionID: SESSION_ID,
      messages: [],
    })
    const attachmentPart = {
      type: "text" as const,
      text: "Attached file (notes.md):\n# Notes",
      metadata: {
        [BUDDY_PROMPT_PART_METADATA_KEY]: {
          type: TEXT_FILE_ATTACHMENT_PART_TYPE,
          filename: "notes.md",
          mime: "text/plain",
        },
      },
    }
    let messagesBeforePost = getTranscriptMessages(DIRECTORY, SESSION_ID)

    await sendPrompt(DIRECTORY, "Summarize this", {
      sessionID: SESSION_ID,
      parts: [attachmentPart],
      optimisticParts: [attachmentPart],
      beforePostPrompt: async () => {
        messagesBeforePost = getTranscriptMessages(DIRECTORY, SESSION_ID)
      },
    })

    expect(messagesBeforePost.at(-1)?.parts).toEqual([
      expect.objectContaining({
        type: "text",
        text: "Summarize this",
        optimistic: true,
      }),
      expect.objectContaining({
        type: "text",
        text: attachmentPart.text,
        metadata: attachmentPart.metadata,
        optimistic: true,
      }),
    ])
  })
})
