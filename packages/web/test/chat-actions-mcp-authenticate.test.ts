import "../happydom"
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import type { McpAuthAuthenticateResponses, McpStatusResponses } from "@buddy/sdk"

const DIRECTORY = "/workspace/mcp-authenticate-test"
let authenticationResult: McpAuthAuthenticateResponses[200]
let reloadedStatuses: McpStatusResponses[200]

const buddyClient = await import("../src/lib/buddy-client")
mock.module("@/lib/buddy-client", () => ({
  ...buddyClient,
  getBuddyClient: () => ({
    mcp: {
      auth: {
        authenticate: async () => ({
          data: authenticationResult,
          error: undefined,
          response: new Response(null, { status: 200 }),
        }),
      },
      status: async () => ({
        data: reloadedStatuses,
        error: undefined,
        response: new Response(null, { status: 200 }),
      }),
    },
  }),
}))

const [{ authenticateMcpServer }, { useChatStore }] = await Promise.all([
  import("../src/state/chat-actions"),
  import("../src/state/chat-store"),
])

describe("authenticateMcpServer", () => {
  beforeEach(() => {
    localStorage.clear()
    authenticationResult = { status: "failed", error: "Authorization expired" }
    reloadedStatuses = { server: { status: "failed", error: "Authorization expired" } }
    useChatStore.setState({ directories: {}, lastSessionByDirectory: {}, openProjects: [] })
  })

  afterEach(() => {
    useChatStore.setState({ directories: {}, lastSessionByDirectory: {}, openProjects: [] })
    localStorage.clear()
  })

  test("reloads statuses and rejects with the failed sign-in reason", async () => {
    await expect(authenticateMcpServer(DIRECTORY, "server")).rejects.toThrow(
      "Authorization expired",
    )

    expect(useChatStore.getState().directories[DIRECTORY]?.mcpStatus).toEqual({
      server: { status: "failed", error: "Authorization expired" },
    })
  })

  test("resolves to the reloaded statuses after connecting", async () => {
    authenticationResult = { status: "connected" }
    reloadedStatuses = { server: { status: "connected" } }

    await expect(authenticateMcpServer(DIRECTORY, "server")).resolves.toEqual({
      server: { status: "connected" },
    })
    expect(useChatStore.getState().directories[DIRECTORY]?.mcpStatus).toEqual({
      server: { status: "connected" },
    })
  })
})
