import { expect, test } from "bun:test"
import { parseToolState } from "../src/components/chat/tools/parse-tool-state"
import { isPermissionDenied } from "../src/components/chat/tools/tool-permission"
import type { MessagePart } from "../src/state/chat-types"

test("reads a rejected outcome through the web parser", () => {
  const part: MessagePart = {
    id: "prt_denied",
    sessionID: "ses_denied",
    messageID: "msg_denied",
    type: "tool",
    tool: "shell",
    callID: "call_denied",
    state: {
      status: "error",
      input: { command: "echo test" },
      error: "Try a different command",
      errorType: "permission.rejected",
      outcome: { type: "rejected", message: "Try a different command" },
      time: { start: 1, end: 2 },
    },
  }
  const state = parseToolState(part)
  expect(state.outcome).toEqual({ type: "rejected", message: "Try a different command" })
  expect(isPermissionDenied(state)).toBe(true)
  expect(isPermissionDenied({ ...state, outcome: { type: "interrupted" } })).toBe(false)
})
