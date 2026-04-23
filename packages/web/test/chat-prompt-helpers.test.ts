import { describe, expect, test } from "bun:test"
import { buildPromptDraftFromUserMessage } from "../src/lib/directory-chat/chat-prompt-helpers"
import {
  PROMPT_PART_TYPE_TEXT,
  WORKSPACE_FILE_REFERENCE_PART_TYPE,
} from "../src/components/prompt/prompt-types"
import { createMessageWithParts, createUserMessageInfo } from "./test-utils"

describe("buildPromptDraftFromUserMessage", () => {
  test("restores inline file references as structured prompt parts", () => {
    const message = createMessageWithParts(
      createUserMessageInfo({ id: "msg-1", sessionID: "ses-1" }),
      [
        {
          id: "part-1",
          sessionID: "ses-1",
          messageID: "msg-1",
          type: "text",
          text: "Summarize ",
        },
        {
          id: "part-2",
          sessionID: "ses-1",
          messageID: "msg-1",
          type: "file",
          mime: "text/plain",
          filename: "README.md",
          url: "file:///repo/README.md",
        },
        {
          id: "part-3",
          sessionID: "ses-1",
          messageID: "msg-1",
          type: "text",
          text: " and ",
        },
        {
          id: "part-4",
          sessionID: "ses-1",
          messageID: "msg-1",
          type: "file",
          mime: "text/plain",
          filename: "resources/book/processed/full-text.md",
          url: "file:///repo/resources/book/processed/full-text.md",
        },
      ],
    )

    const draft = buildPromptDraftFromUserMessage(message, "/repo")

    expect(draft).toEqual({
      value: "Summarize @README.md and @resources/book/processed/full-text.md",
      parts: [
        {
          type: PROMPT_PART_TYPE_TEXT,
          text: "Summarize ",
        },
        {
          type: WORKSPACE_FILE_REFERENCE_PART_TYPE,
          path: "README.md",
        },
        {
          type: PROMPT_PART_TYPE_TEXT,
          text: " and ",
        },
        {
          type: WORKSPACE_FILE_REFERENCE_PART_TYPE,
          path: "resources/book/processed/full-text.md",
        },
      ],
      attachments: [],
      cursor: "Summarize @README.md and @resources/book/processed/full-text.md".length,
    })
  })
})
