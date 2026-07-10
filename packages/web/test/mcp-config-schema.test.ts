import { describe, expect, test } from "bun:test"
import {
  mcpNeedsAuth,
  mcpNeedsClientRegistration,
} from "../src/components/mcp-dialog/mcp-config-schema"
import type { McpStatusInfo } from "../src/state/chat-types"

const NEEDS_AUTH = { status: "needs_auth" } as const satisfies McpStatusInfo
const NEEDS_CLIENT_REGISTRATION = {
  status: "needs_client_registration",
  error: "A pre-registered OAuth client ID is required.",
} as const satisfies McpStatusInfo

describe("MCP connection requirements", () => {
  test("keeps sign-in and client-registration requirements distinct", () => {
    expect(mcpNeedsAuth(NEEDS_AUTH)).toBe(true)
    expect(mcpNeedsClientRegistration(NEEDS_AUTH)).toBe(false)
    expect(mcpNeedsAuth(NEEDS_CLIENT_REGISTRATION)).toBe(false)
    expect(mcpNeedsClientRegistration(NEEDS_CLIENT_REGISTRATION)).toBe(true)
  })
})
