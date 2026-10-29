import { describe, expect, test } from "bun:test"
import {
  buildConfigFromDraft,
  buildDraft,
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

test("MCP editors preserve unshown OAuth fields when editing a remote server", () => {
  const config = parseMcpConfigMap({
    mcp: {
      remote: {
        type: "remote",
        url: "https://example.test/mcp",
        oauth: {
          clientId: "existing-client",
          clientSecret: "existing-secret",
          scope: "read",
          callbackPort: 49152,
          redirectUri: "http://127.0.0.1:49152/oauth/callback?return=%2Fbench",
        },
      },
    },
  }).remote
  if (!config) throw new Error("MCP config was not parsed")

  const draft = buildDraft("remote", config)
  const result = buildConfigFromDraft({
    ...draft,
    url: "https://example.test/updated-mcp",
    scope: "read write",
    clientSecret: "",
  })

  expect(result).toEqual({
    name: "remote",
    config: {
      type: "remote",
      url: "https://example.test/updated-mcp",
      enabled: true,
      oauth: {
        clientId: "existing-client",
        scope: "read write",
        callbackPort: 49152,
        redirectUri: "http://127.0.0.1:49152/oauth/callback?return=%2Fbench",
      },
    },
  })
})

test("MCP editors preserve redacted secrets on save and support replacement and clearing", () => {
  const remote = buildDraft("remote", {
    type: "remote",
    url: "https://example.test/mcp",
    oauth: { clientSecret: "[REDACTED]" },
  })
  expect(buildConfigFromDraft(remote)).toMatchObject({
    config: { oauth: { clientSecret: "[REDACTED]" } },
  })
  expect(buildConfigFromDraft({ ...remote, clientSecret: "new-secret" })).toMatchObject({
    config: { oauth: { clientSecret: "new-secret" } },
  })
  expect(buildConfigFromDraft({ ...remote, clientSecret: "" })).toEqual({
    name: "remote",
    config: { type: "remote", url: "https://example.test/mcp", enabled: true, oauth: {} },
  })
  const headers = buildDraft("headers", {
    type: "remote",
    url: "https://example.test/mcp",
    oauth: false,
    headers: { Authorization: "[REDACTED]" },
  })
  expect(buildConfigFromDraft(headers)).toMatchObject({
    config: { headers: { Authorization: "[REDACTED]" } },
  })
  const local = buildDraft("local", {
    type: "local",
    command: ["fixture"],
    environment: { TOKEN: "[REDACTED]" },
  })
  expect(buildConfigFromDraft(local)).toMatchObject({
    config: { environment: { TOKEN: "[REDACTED]" } },
  })
  const cleared = buildConfigFromDraft({ ...local, environmentText: "" })
  expect(cleared).toEqual({
    name: "local",
    config: { type: "local", command: ["fixture"], enabled: true },
  })
})

for (const url of [
  "{env:MCP_ENDPOINT}",
  "{file:./mcp-endpoint.txt}",
  "{env:MCP_SCHEME}://example.test/mcp",
]) {
  test(`MCP editors retain the unresolved URL ${url} when saving another field`, () => {
    const config = parseMcpConfigMap({
      mcp: { fixture: { type: "remote", url, enabled: false, oauth: false } },
    }).fixture
    if (!config) throw new Error("MCP config was not parsed")
    const draft = buildDraft("fixture", config)
    expect(draft.url).toBe(url)
    expect(buildConfigFromDraft({ ...draft, timeout: "5000" })).toEqual({
      name: "fixture",
      config: { type: "remote", url, enabled: false, oauth: false, timeout: 5000 },
    })
  })
}
