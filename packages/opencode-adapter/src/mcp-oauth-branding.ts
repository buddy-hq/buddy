import { ServerResponse } from "node:http"
import { McpOAuthProvider } from "opencode/mcp/oauth-provider"

export const BUDDY_MCP_OAUTH_CLIENT_NAME = "Buddy"
export const BUDDY_MCP_OAUTH_CLIENT_URI = "https://hibuddy.in"
export const BUDDY_MCP_OAUTH_LOGO_URI = "https://hibuddy.in/apple-touch-icon.png"

const OPENCODE_MCP_OAUTH_SUCCESS_TITLE = "<title>OpenCode - Authorization Successful</title>"
const OPENCODE_MCP_OAUTH_ERROR_TITLE = "<title>OpenCode - Authorization Failed</title>"
const OPENCODE_MCP_OAUTH_SUCCESS_COPY = "return to OpenCode"
const BUDDY_MCP_OAUTH_WINDOW_CLOSE_DELAY_MS = 1_500

type McpOAuthClientMetadata = McpOAuthProvider["clientMetadata"]

let clientMetadataBrandingPatched = false
let callbackHtmlBrandingPatched = false

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readString(value: unknown) {
  return typeof value === "string" ? value : undefined
}

function readStringArray(value: unknown) {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string")
    ? value
    : undefined
}

function brandClientMetadata(input: unknown, fallbackRedirectUrl: string): McpOAuthClientMetadata {
  const metadata = isRecord(input) ? input : {}
  const redirectUris = readStringArray(metadata.redirect_uris) ?? [fallbackRedirectUrl]
  const tokenEndpointAuthMethod = readString(metadata.token_endpoint_auth_method)
  const grantTypes = readStringArray(metadata.grant_types)
  const responseTypes = readStringArray(metadata.response_types)
  const scope = readString(metadata.scope)

  return {
    redirect_uris: redirectUris,
    client_name: BUDDY_MCP_OAUTH_CLIENT_NAME,
    client_uri: BUDDY_MCP_OAUTH_CLIENT_URI,
    logo_uri: BUDDY_MCP_OAUTH_LOGO_URI,
    ...(tokenEndpointAuthMethod
      ? { token_endpoint_auth_method: tokenEndpointAuthMethod }
      : {}),
    ...(grantTypes ? { grant_types: grantTypes } : {}),
    ...(responseTypes ? { response_types: responseTypes } : {}),
    ...(scope ? { scope } : {}),
  }
}

export function buildBuddyMcpOAuthSuccessHtml() {
  return `<!doctype html>
<html>
  <head>
    <title>Buddy - Authorization Successful</title>
    <style>
      body {
        font-family:
          system-ui,
          -apple-system,
          sans-serif;
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
        margin: 0;
        background: #131010;
        color: #f1ecec;
      }
      .container {
        text-align: center;
        padding: 2rem;
        max-width: 32rem;
      }
      h1 {
        color: #f1ecec;
        margin-bottom: 1rem;
      }
      p {
        color: #b7b1b1;
        line-height: 1.5;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>Authorization Successful</h1>
      <p>Buddy is connected. You can go back to the Buddy app.</p>
    </div>
    <script>
      setTimeout(() => {
        try {
          window.close()
        } catch {}
      }, ${BUDDY_MCP_OAUTH_WINDOW_CLOSE_DELAY_MS})
    </script>
  </body>
</html>`
}

export function brandMcpOAuthCallbackHtml(html: string) {
  if (
    html.includes(OPENCODE_MCP_OAUTH_SUCCESS_TITLE) &&
    html.includes(OPENCODE_MCP_OAUTH_SUCCESS_COPY)
  ) {
    return buildBuddyMcpOAuthSuccessHtml()
  }

  if (!html.includes(OPENCODE_MCP_OAUTH_ERROR_TITLE)) {
    return html
  }

  return html
    .replace(OPENCODE_MCP_OAUTH_ERROR_TITLE, "<title>Buddy - Authorization Failed</title>")
    .replace("background: #1a1a2e; color: #eee;", "background: #131010; color: #f1ecec;")
    .replace("h1 { color: #f87171; margin-bottom: 1rem; }", "h1 { color: #fc533a; margin-bottom: 1rem; }")
    .replace("p { color: #aaa; }", "p { color: #b7b1b1; }")
    .replace("color: #fca5a5;", "color: #ff917b;")
    .replace("background: rgba(248,113,113,0.1);", "background: #3c140d;")
}

function brandMcpOAuthCallbackChunk(chunk: unknown) {
  return typeof chunk === "string" ? brandMcpOAuthCallbackHtml(chunk) : chunk
}

function ensureMcpOAuthClientMetadataBrandingPatched() {
  if (clientMetadataBrandingPatched) {
    return
  }

  const descriptor = Object.getOwnPropertyDescriptor(McpOAuthProvider.prototype, "clientMetadata")
  const originalGet = descriptor?.get
  if (!originalGet) {
    throw new Error("MCP OAuth provider clientMetadata getter is unavailable")
  }

  Object.defineProperty(McpOAuthProvider.prototype, "clientMetadata", {
    configurable: true,
    get(this: McpOAuthProvider) {
      const original: unknown = originalGet.call(this)
      return brandClientMetadata(original, this.redirectUrl)
    },
  })

  clientMetadataBrandingPatched = true
}

export function createMcpOAuthCallbackBrandedEnd(
  originalEnd: ServerResponse["end"],
): ServerResponse["end"] {
  function brandedEnd(this: ServerResponse, callback?: () => void): ServerResponse
  function brandedEnd(this: ServerResponse, chunk: string | Uint8Array, callback?: () => void): ServerResponse
  function brandedEnd(
    this: ServerResponse,
    chunk: string | Uint8Array,
    encoding: BufferEncoding,
    callback?: () => void,
  ): ServerResponse
  function brandedEnd(
    this: ServerResponse,
    chunkOrCallback?: string | Uint8Array | (() => void),
    encodingOrCallback?: BufferEncoding | (() => void),
    callback?: () => void,
  ): ServerResponse {
    if (typeof chunkOrCallback === "function") {
      return Reflect.apply(originalEnd, this, [chunkOrCallback])
    }

    const chunk = brandMcpOAuthCallbackChunk(chunkOrCallback)
    if (typeof encodingOrCallback === "function") {
      return Reflect.apply(originalEnd, this, [chunk, encodingOrCallback])
    }
    if (callback) {
      return Reflect.apply(originalEnd, this, [chunk, encodingOrCallback, callback])
    }
    if (encodingOrCallback) {
      return Reflect.apply(originalEnd, this, [chunk, encodingOrCallback])
    }
    if (chunk === undefined) {
      return Reflect.apply(originalEnd, this, [])
    }
    return Reflect.apply(originalEnd, this, [chunk])
  }

  return brandedEnd
}

function ensureMcpOAuthCallbackBrandingPatched() {
  if (callbackHtmlBrandingPatched) {
    return
  }

  ServerResponse.prototype.end = createMcpOAuthCallbackBrandedEnd(ServerResponse.prototype.end)
  callbackHtmlBrandingPatched = true
}

export function ensureMcpOAuthBrandingPatched() {
  ensureMcpOAuthClientMetadataBrandingPatched()
  ensureMcpOAuthCallbackBrandingPatched()
}
