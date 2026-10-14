import { expect, test } from "bun:test"
import { parseToolState } from "../src/components/chat/tools/parse-tool-state"
import { isPermissionDenied } from "../src/components/chat/tools/tool-permission"
import type { MessagePart } from "../src/state/chat-types"

test("preserves native permission rejection feedback through the web parser", () => {
  const part: MessagePart = {
    id: "prt_denied", sessionID: "ses_denied", messageID: "msg_denied",
    type: "tool", tool: "shell", callID: "call_denied",
    state: { status: "error", input: { command: "echo test" }, error: "Try a different command", errorType: "permission.rejected", time: { start: 1, end: 2 } },
  }
  const state = parseToolState(part)
  expect(state.errorType).toBe("permission.rejected")
  expect(state.error).toBe("Try a different command")
  expect(isPermissionDenied(state)).toBe(true)
  expect(isPermissionDenied({ ...state, errorType: "tool.execution" })).toBe(false)
})
