import { describe, expect, test } from "bun:test"
import {
  createErrorRecoveryContinueDraft,
  createErrorRecoveryPromptInput,
} from "../src/lib/directory-chat/chat-error-recovery"

describe("chat error recovery", () => {
  test("continues from preserved turn progress instead of rebuilding the failed prompt", () => {
    expect(createErrorRecoveryContinueDraft()).toEqual({
      value: "Continue",
      parts: [
        {
          type: "text",
          text: "Continue",
        },
      ],
      attachments: [],
      cursor: "Continue".length,
    })
  })

  test("targets recovery at the failed session without active workspace context", () => {
    const draft = createErrorRecoveryContinueDraft()

    expect(createErrorRecoveryPromptInput(draft, "ses_failed")).toEqual({
      content: "Continue",
      parts: draft.parts,
      attachments: draft.attachments,
      targetSessionID: "ses_failed",
      clearDrafts: false,
      includeActiveContext: false,
    })
  })
})
