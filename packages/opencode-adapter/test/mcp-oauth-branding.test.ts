import { describe, expect, test } from "bun:test"
import { IncomingMessage, ServerResponse } from "node:http"
import { Socket } from "node:net"
import { Effect } from "effect"
import type { McpAuth } from "opencode/mcp/auth"
import { McpOAuthProvider, OAUTH_CALLBACK_PATH } from "opencode/mcp/oauth-provider"
import {
  BUDDY_MCP_OAUTH_CLIENT_NAME,
  BUDDY_MCP_OAUTH_CLIENT_URI,
  BUDDY_MCP_OAUTH_LOGO_URI,
  brandMcpOAuthCallbackHtml,
  createMcpOAuthCallbackBrandedEnd,
  ensureMcpOAuthBrandingPatched,
} from "../src/mcp-oauth-branding"

const stubAuth: McpAuth.Interface = {
  all: () => Effect.succeed({}),
  get: () => Effect.succeed(undefined),
  getForUrl: () => Effect.succeed(undefined),
  set: () => Effect.void,
  remove: () => Effect.void,
  updateTokens: () => Effect.void,
  updateClientInfo: () => Effect.void,
  updateCodeVerifier: () => Effect.void,
  clearCodeVerifier: () => Effect.void,
  updateOAuthState: () => Effect.void,
  getOAuthState: () => Effect.succeed(undefined),
  clearOAuthState: () => Effect.void,
}

function makeProvider(config: ConstructorParameters<typeof McpOAuthProvider>[2]) {
  return new McpOAuthProvider(
    "linear",
    "https://mcp.linear.app/mcp",
    config,
    {
      onRedirect: async () => {},
    },
    stubAuth,
  )
}

describe("ensureMcpOAuthBrandingPatched", () => {
  test("preserves an end callback when encoding is explicitly undefined", () => {
    let receivedArgs: unknown[] = []
    let callbackInvoked = false
    const originalEnd: ServerResponse["end"] = function (this: ServerResponse, ...args: unknown[]) {
      receivedArgs = args
      return this
    }
    const callback = () => {
      callbackInvoked = true
    }
    const brandedEnd = createMcpOAuthCallbackBrandedEnd(originalEnd)
    const socket = new Socket()
    const response = new ServerResponse(new IncomingMessage(socket))

    try {
      brandedEnd.call(response, "response", undefined, callback)
    } finally {
      response.destroy()
      socket.destroy()
    }

    expect(receivedArgs).toEqual(["response", undefined, callback])
    expect(callbackInvoked).toBe(false)
  })

  test("brands dynamic MCP OAuth metadata while preserving redirect, scope, and auth method", () => {
    ensureMcpOAuthBrandingPatched()
    ensureMcpOAuthBrandingPatched()

    const provider = makeProvider({
      callbackPort: 6620,
      clientSecret: "secret",
      scope: "read write",
    })

    expect(provider.clientMetadata).toEqual({
      redirect_uris: [`http://127.0.0.1:6620${OAUTH_CALLBACK_PATH}`],
      client_name: BUDDY_MCP_OAUTH_CLIENT_NAME,
      client_uri: BUDDY_MCP_OAUTH_CLIENT_URI,
      logo_uri: BUDDY_MCP_OAUTH_LOGO_URI,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_post",
      scope: "read write",
    })
  })

  test("brands the local MCP OAuth callback success page", () => {
    const html = brandMcpOAuthCallbackHtml(`<!DOCTYPE html>
<html>
<head>
  <title>OpenCode - Authorization Successful</title>
</head>
<body>
  <p>You can close this window and return to OpenCode.</p>
</body>
</html>`)

    expect(html).toContain("<title>Buddy - Authorization Successful</title>")
    expect(html).toContain("Buddy is connected. You can go back to the Buddy app.")
    expect(html).not.toContain("OpenCode")
  })
})
