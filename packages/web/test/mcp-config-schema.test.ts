import { describe, expect, test } from "bun:test"
import {
  buildConfigFromDraft,
  emptyDraft,
  mcpNeedsAuth,
  mcpNeedsClientRegistration,
  parseMcpConfigMap,
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

describe("MCP config map parsing", () => {
  test("keeps valid environment entries when one value is not a string", () => {
    const parsed = parseMcpConfigMap({
      mcp: {
        local: {
          type: "local",
          command: ["uvx", "server"],
          environment: { TOKEN: "secret", PORT: 8080 },
        },
      },
    })

    expect(parsed.local).toEqual({
      type: "local",
      command: ["uvx", "server"],
      environment: { TOKEN: "secret" },
    })
  })

  test("keeps valid remote headers when one value is not a string", () => {
    const parsed = parseMcpConfigMap({
      mcp: {
        remote: {
          type: "remote",
          url: "https://example.test/mcp",
          headers: { Authorization: "Bearer token", timeout: 30 },
        },
      },
    })

    expect(parsed.remote).toEqual({
      type: "remote",
      url: "https://example.test/mcp",
      headers: { Authorization: "Bearer token" },
    })
  })

  test("still rejects mixed-type maps in the editor form", () => {
    const result = buildConfigFromDraft({
      ...emptyDraft(),
      name: "local-server",
      type: "local",
      command: '["uvx"]',
      environmentText: '{"TOKEN":"secret","PORT":1}',
    })

    expect("fieldError" in result).toBe(true)
    if (!("fieldError" in result)) return
    expect(result.fieldError.field).toBe("environment")
  })
})
