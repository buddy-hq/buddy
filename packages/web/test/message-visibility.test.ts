import { describe, expect, test } from "bun:test"
import {
  isHiddenFromUserMessage,
  isSvgAutoRepairAssistantMessage,
  isSvgAutoRepairMessageID,
} from "../src/components/chat/utils/message-visibility"
import type { MessageWithParts } from "../src/state/chat-types"
import { createAssistantMessageInfo } from "./test-utils"

function userMessage(id: string): MessageWithParts {
  return {
    info: {
      id,
      sessionID: "ses_visibility",
      role: "user",
      time: { created: 1 },
      agent: "buddy",
      model: {
        providerID: "opencode",
        modelID: "claude-sonnet",
      },
      tools: {},
    },
    parts: [],
  }
}

describe("message visibility", () => {
  test("recognizes only SVG auto-repair message IDs", () => {
    expect(isSvgAutoRepairMessageID("msg_buddy_svg_auto_repair_deadbeef")).toBe(true)
    expect(isSvgAutoRepairMessageID("msg_buddy_mermaid_auto_repair_deadbeef")).toBe(false)
    expect(isSvgAutoRepairMessageID(undefined)).toBe(false)
  })

  test("recognizes assistant messages parented by an SVG repair turn", () => {
    expect(
      isSvgAutoRepairAssistantMessage(
        createAssistantMessageInfo({
          id: "msg_repair_assistant",
          sessionID: "ses_visibility",
          parentID: "msg_buddy_svg_auto_repair_deadbeef",
        }),
      ),
    ).toBe(true)
    expect(
      isSvgAutoRepairAssistantMessage(
        createAssistantMessageInfo({
          id: "msg_regular_assistant",
          sessionID: "ses_visibility",
          parentID: "msg_regular_user",
        }),
      ),
    ).toBe(false)
  })

  test("hides SVG and Mermaid synthetic repair prompts", () => {
    expect(
      isHiddenFromUserMessage(userMessage("msg_buddy_svg_auto_repair_deadbeef")),
    ).toBe(true)
    expect(
      isHiddenFromUserMessage(userMessage("msg_buddy_mermaid_auto_repair_deadbeef")),
    ).toBe(true)
    expect(isHiddenFromUserMessage(userMessage("msg_regular_user"))).toBe(false)
  })
})
