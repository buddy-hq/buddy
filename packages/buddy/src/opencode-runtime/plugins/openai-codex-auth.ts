import { createServer } from "node:http"
import { setTimeout as sleep } from "node:timers/promises"
import type { AuthHook } from "@opencode-ai/plugin"
import { Auth } from "@buddy/opencode-adapter/auth"
import {
  extractOpenAICodexAccountId,
  isOpenAICodexStoredAuth,
  OPENAI_CODEX_AUTH_ISSUER,
  OPENAI_CODEX_CLIENT_ID,
  OPENAI_PROVIDER_ID,
  parseOpenAICodexTokenResponse,
  resolveOpenAICodexAuth,
  type OpenAICodexStoredAuth,
  type OpenAICodexTokenResponse,
} from "./openai-codex-credentials"

const CODEX_API_ENDPOINT = "https://chatgpt.com/backend-api/codex/responses"
const OAUTH_PORT = 1455
const OAUTH_POLLING_SAFETY_MARGIN_MS = 3_000
export { OPENAI_PROVIDER_ID }
const WINDOW_CLOSE_DELAY_MS = 1_500
const OPENCODE_OAUTH_USER_AGENT = "opencode/local"
const CANCELLED_AUTHORIZATION_ERROR = "Authorization cancelled"

type PkceCodes = {
  verifier: string
  challenge: string
}

type PendingOAuth = {
  pkce: PkceCodes
  state: string
  resolve: (tokens: OpenAICodexTokenResponse) => void
  reject: (error: Error) => void
}

const SUPERSEDED_AUTHORIZATION_ERROR = "Superseded by a newer authorization request"

type OpenAICodexAuthAbortKind = "cancelled" | "superseded"

class OpenAICodexAuthAbortError extends Error {
  readonly kind: OpenAICodexAuthAbortKind

  constructor(kind: OpenAICodexAuthAbortKind, message: string) {
    super(message)
    this.kind = kind
    this.name = "OpenAICodexAuthAbortError"
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

let oauthServer: ReturnType<typeof createServer> | undefined
let pendingOAuth: PendingOAuth | undefined

function rejectPendingOAuth(kind: OpenAICodexAuthAbortKind, message: string) {
  const current = pendingOAuth
  pendingOAuth = undefined
  current?.reject(new OpenAICodexAuthAbortError(kind, message))
  return Boolean(current)
}

export function cancelOpenAICodexAuthorization() {
  const cancelled = rejectPendingOAuth("cancelled", CANCELLED_AUTHORIZATION_ERROR)
  stopOAuthServer()
  return cancelled
}

function generateRandomString(length: number) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes)
    .map((value) => chars[value % chars.length])
    .join("")
}

function base64UrlEncode(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  const binary = String.fromCharCode(...bytes)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

async function generatePKCE(): Promise<PkceCodes> {
  const verifier = generateRandomString(43)
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const hash = await crypto.subtle.digest("SHA-256", data)
  return {
    verifier,
    challenge: base64UrlEncode(hash),
  }
}

function generateState() {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)).buffer)
}

function buildAuthorizeUrl(redirectUri: string, pkce: PkceCodes, state: string) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: OPENAI_CODEX_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: "openid profile email offline_access",
    code_challenge: pkce.challenge,
    code_challenge_method: "S256",
    id_token_add_organizations: "true",
    codex_cli_simplified_flow: "true",
    state,
    originator: "opencode",
  })
  return `${OPENAI_CODEX_AUTH_ISSUER}/oauth/authorize?${params.toString()}`
}

async function exchangeCodeForTokens(code: string, redirectUri: string, pkce: PkceCodes) {
  const response = await fetch(`${OPENAI_CODEX_AUTH_ISSUER}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: OPENAI_CODEX_CLIENT_ID,
      code_verifier: pkce.verifier,
    }).toString(),
  })

  if (!response.ok) {
    throw new Error(`Token exchange failed: ${response.status}`)
  }

  return parseOpenAICodexTokenResponse(await response.json())
}

export function buildBuddyCodexSuccessHtml() {
  return `<!doctype html>
<html>
  <head>
    <title>Buddy - Codex Authorization Successful</title>
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
      }, ${WINDOW_CLOSE_DELAY_MS})
    </script>
  </body>
</html>`
}

export function buildBuddyCodexErrorHtml(error: string) {
  const safeError = escapeHtml(error)
  return `<!doctype html>
<html>
  <head>
    <title>Buddy - Codex Authorization Failed</title>
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
        color: #fc533a;
        margin-bottom: 1rem;
      }
      p {
        color: #b7b1b1;
      }
      .error {
        color: #ff917b;
        font-family: monospace;
        margin-top: 1rem;
        padding: 1rem;
        background: #3c140d;
        border-radius: 0.5rem;
        white-space: pre-wrap;
        word-break: break-word;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>Authorization Failed</h1>
      <p>Buddy could not complete the OpenAI authorization flow.</p>
      <div class="error">${safeError}</div>
    </div>
  </body>
</html>`
}

export function createBuddyCodexLoader(input: {
  getAuth: () => Promise<OpenAICodexStoredAuth | { type: string }>
  setAuth: (auth: OpenAICodexStoredAuth) => Promise<void>
  issuer?: string
  codexApiEndpoint?: string
}) {
  const issuer = input.issuer ?? OPENAI_CODEX_AUTH_ISSUER
  const codexApiEndpoint = input.codexApiEndpoint ?? CODEX_API_ENDPOINT

  return {
    apiKey: Auth.OAUTH_DUMMY_KEY,
    async fetch(requestInput: RequestInfo | URL, init?: RequestInit) {
      const auth = await resolveOpenAICodexAuth({
        getAuth: input.getAuth,
        setAuth: input.setAuth,
        issuer,
      })
      if (!isOpenAICodexStoredAuth(auth)) {
        return fetch(requestInput, init)
      }

      const sanitizedHeaders = new Headers(init?.headers)
      sanitizedHeaders.delete("authorization")
      sanitizedHeaders.delete("Authorization")

      sanitizedHeaders.set("authorization", `Bearer ${auth.access}`)
      if (auth.accountId) {
        sanitizedHeaders.set("ChatGPT-Account-Id", auth.accountId)
      }

      const originalUrl =
        requestInput instanceof URL
          ? requestInput
          : new URL(typeof requestInput === "string" ? requestInput : requestInput.url)
      const targetUrl =
        originalUrl.pathname.includes("/v1/responses") ||
        originalUrl.pathname.includes("/chat/completions")
          ? new URL(codexApiEndpoint)
          : originalUrl

      return fetch(targetUrl, {
        ...init,
        headers: sanitizedHeaders,
      })
    },
  }
}

async function startOAuthServer() {
  const redirectUri = `http://localhost:${OAUTH_PORT}/auth/callback`
  if (oauthServer) {
    return { redirectUri }
  }

  oauthServer = createServer((req, res) => {
    const url = new URL(req.url || "/", `http://localhost:${OAUTH_PORT}`)

    if (url.pathname === "/auth/callback") {
      const code = url.searchParams.get("code")
      const state = url.searchParams.get("state")
      const error = url.searchParams.get("error")
      const errorDescription = url.searchParams.get("error_description")

      if (error) {
        const errorMessage = errorDescription || error
        pendingOAuth?.reject(new Error(errorMessage))
        pendingOAuth = undefined
        res.writeHead(200, { "Content-Type": "text/html" })
        res.end(buildBuddyCodexErrorHtml(errorMessage))
        return
      }

      if (!code) {
        const errorMessage = "Missing authorization code"
        pendingOAuth?.reject(new Error(errorMessage))
        pendingOAuth = undefined
        res.writeHead(400, { "Content-Type": "text/html" })
        res.end(buildBuddyCodexErrorHtml(errorMessage))
        return
      }

      if (!pendingOAuth || state !== pendingOAuth.state) {
        const errorMessage = "Invalid state - potential CSRF attack"
        pendingOAuth?.reject(new Error(errorMessage))
        pendingOAuth = undefined
        res.writeHead(400, { "Content-Type": "text/html" })
        res.end(buildBuddyCodexErrorHtml(errorMessage))
        return
      }

      const current = pendingOAuth
      pendingOAuth = undefined

      void exchangeCodeForTokens(code, redirectUri, current.pkce)
        .then((tokens) => current.resolve(tokens))
        .catch((oauthError: unknown) =>
          current.reject(
            oauthError instanceof Error ? oauthError : new Error("Token exchange failed"),
          ),
        )

      res.writeHead(200, { "Content-Type": "text/html" })
      res.end(buildBuddyCodexSuccessHtml())
      return
    }

    if (url.pathname === "/cancel") {
      cancelOpenAICodexAuthorization()
      res.writeHead(200)
      res.end(CANCELLED_AUTHORIZATION_ERROR)
      return
    }

    res.writeHead(404)
    res.end("Not found")
  })

  await new Promise<void>((resolve, reject) => {
    oauthServer?.listen(OAUTH_PORT, () => resolve())
    oauthServer?.on("error", reject)
  })

  return { redirectUri }
}

function stopOAuthServer() {
  oauthServer?.close()
  oauthServer = undefined
}

function waitForOAuthCallback(pkce: PkceCodes, state: string): Promise<OpenAICodexTokenResponse> {
  return new Promise((resolve, reject) => {
    rejectPendingOAuth("superseded", SUPERSEDED_AUTHORIZATION_ERROR)

    const timeout = setTimeout(
      () => {
        if (!pendingOAuth) return
        pendingOAuth = undefined
        reject(new Error("OAuth callback timeout - authorization took too long"))
      },
      5 * 60 * 1_000,
    )

    pendingOAuth = {
      pkce,
      state,
      resolve: (tokens) => {
        clearTimeout(timeout)
        resolve(tokens)
      },
      reject: (error) => {
        clearTimeout(timeout)
        reject(error)
      },
    }
  })
}

export function createOpenAICodexAuthHook(): NonNullable<AuthHook> {
  return {
    provider: OPENAI_PROVIDER_ID,
    async loader(getAuth) {
      const auth = await getAuth()
      if (auth.type !== "oauth") return {}

      return createBuddyCodexLoader({
        getAuth: async () => {
          const nextAuth = await getAuth()
          if (nextAuth.type !== "oauth") {
            return { type: nextAuth.type }
          }
          return {
            type: "oauth",
            access: nextAuth.access,
            refresh: nextAuth.refresh,
            expires: nextAuth.expires,
            ...(nextAuth.accountId ? { accountId: nextAuth.accountId } : {}),
          }
        },
        setAuth: async (nextAuth) => {
          await Auth.set(OPENAI_PROVIDER_ID, nextAuth)
        },
      })
    },
    methods: [
      {
        label: "ChatGPT Pro/Plus (browser)",
        type: "oauth",
        authorize: async () => {
          const { redirectUri } = await startOAuthServer()
          const pkce = await generatePKCE()
          const state = generateState()
          const authUrl = buildAuthorizeUrl(redirectUri, pkce, state)
          const callbackPromise = waitForOAuthCallback(pkce, state)

          return {
            url: authUrl,
            instructions:
              "Complete authorization in your browser. Buddy will reconnect automatically.",
            method: "auto" as const,
            callback: async () => {
              try {
                const tokens = await callbackPromise
                const accountId = extractOpenAICodexAccountId(tokens)
                return {
                  type: "success" as const,
                  refresh: tokens.refresh_token,
                  access: tokens.access_token,
                  expires: Date.now() + (tokens.expires_in ?? 3_600) * 1_000,
                  ...(accountId ? { accountId } : {}),
                }
              } finally {
                stopOAuthServer()
              }
            },
          }
        },
      },
      {
        label: "ChatGPT Pro/Plus (headless)",
        type: "oauth",
        authorize: async () => {
          const deviceResponse = await fetch(
            `${OPENAI_CODEX_AUTH_ISSUER}/api/accounts/deviceauth/usercode`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "User-Agent": OPENCODE_OAUTH_USER_AGENT,
              },
              body: JSON.stringify({ client_id: OPENAI_CODEX_CLIENT_ID }),
            },
          )

          if (!deviceResponse.ok) {
            throw new Error("Failed to initiate device authorization")
          }

          const deviceData = (await deviceResponse.json()) as {
            device_auth_id: string
            user_code: string
            interval: string
          }
          const interval = Math.max(Number.parseInt(deviceData.interval, 10) || 5, 1) * 1_000

          return {
            url: `${OPENAI_CODEX_AUTH_ISSUER}/codex/device`,
            instructions: `Enter code: ${deviceData.user_code}`,
            method: "auto" as const,
            async callback() {
              while (true) {
                const response = await fetch(
                  `${OPENAI_CODEX_AUTH_ISSUER}/api/accounts/deviceauth/token`,
                  {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      "User-Agent": OPENCODE_OAUTH_USER_AGENT,
                    },
                    body: JSON.stringify({
                      device_auth_id: deviceData.device_auth_id,
                      user_code: deviceData.user_code,
                    }),
                  },
                )

                if (response.ok) {
                  const data = (await response.json()) as {
                    authorization_code: string
                    code_verifier: string
                  }
                  const tokenResponse = await fetch(`${OPENAI_CODEX_AUTH_ISSUER}/oauth/token`, {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body: new URLSearchParams({
                      grant_type: "authorization_code",
                      code: data.authorization_code,
                      redirect_uri: `${OPENAI_CODEX_AUTH_ISSUER}/deviceauth/callback`,
                      client_id: OPENAI_CODEX_CLIENT_ID,
                      code_verifier: data.code_verifier,
                    }).toString(),
                  })

                  if (!tokenResponse.ok) {
                    throw new Error(`Token exchange failed: ${tokenResponse.status}`)
                  }

                  const tokens = parseOpenAICodexTokenResponse(await tokenResponse.json())
                  const accountId = extractOpenAICodexAccountId(tokens)
                  return {
                    type: "success" as const,
                    refresh: tokens.refresh_token,
                    access: tokens.access_token,
                    expires: Date.now() + (tokens.expires_in ?? 3_600) * 1_000,
                    ...(accountId ? { accountId } : {}),
                  }
                }

                if (response.status !== 403 && response.status !== 404) {
                  return { type: "failed" as const }
                }

                await sleep(interval + OAUTH_POLLING_SAFETY_MARGIN_MS)
              }
            },
          }
        },
      },
      {
        label: "Manually enter API Key",
        type: "api",
      },
    ],
  }
}
