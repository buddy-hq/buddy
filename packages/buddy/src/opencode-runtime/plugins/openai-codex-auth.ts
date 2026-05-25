import { createServer } from "node:http"
import { setTimeout as sleep } from "node:timers/promises"
import type { AuthHook } from "@opencode-ai/plugin"
import { Auth } from "@buddy/opencode-adapter/auth"

const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"
const ISSUER = "https://auth.openai.com"
const CODEX_API_ENDPOINT = "https://chatgpt.com/backend-api/codex/responses"
const OAUTH_PORT = 1455
const OAUTH_POLLING_SAFETY_MARGIN_MS = 3_000
const OPENAI_PROVIDER_ID = "openai"
const WINDOW_CLOSE_DELAY_MS = 1_500
const OPENCODE_OAUTH_USER_AGENT = "opencode/local"

type PkceCodes = {
  verifier: string
  challenge: string
}

type TokenResponse = {
  id_token: string
  access_token: string
  refresh_token: string
  expires_in?: number
}

type IdTokenClaims = {
  chatgpt_account_id?: string
  organizations?: Array<{ id: string }>
  email?: string
  "https://api.openai.com/auth"?: {
    chatgpt_account_id?: string
  }
}

type PendingOAuth = {
  pkce: PkceCodes
  state: string
  resolve: (tokens: TokenResponse) => void
  reject: (error: Error) => void
}

type StoredOauthAuth = {
  type: "oauth"
  access: string
  refresh: string
  expires: number
  accountId?: string
}

const SUPERSEDED_AUTHORIZATION_ERROR = "Superseded by a newer authorization request"

function isStoredOauthAuth(value: StoredOauthAuth | { type: string }): value is StoredOauthAuth {
  return value.type === "oauth" && "access" in value && "refresh" in value && "expires" in value
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

function parseJwtClaims(token: string): IdTokenClaims | undefined {
  const parts = token.split(".")
  if (parts.length !== 3) return undefined

  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString())
  } catch {
    return undefined
  }
}

function extractAccountIdFromClaims(claims: IdTokenClaims) {
  return (
    claims.chatgpt_account_id ||
    claims["https://api.openai.com/auth"]?.chatgpt_account_id ||
    claims.organizations?.[0]?.id
  )
}

function extractAccountId(tokens: TokenResponse) {
  const idTokenClaims = parseJwtClaims(tokens.id_token)
  const idTokenAccountID = idTokenClaims && extractAccountIdFromClaims(idTokenClaims)
  if (idTokenAccountID) return idTokenAccountID

  const accessTokenClaims = parseJwtClaims(tokens.access_token)
  if (!accessTokenClaims) return undefined
  return extractAccountIdFromClaims(accessTokenClaims)
}

function buildAuthorizeUrl(redirectUri: string, pkce: PkceCodes, state: string) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    scope: "openid profile email offline_access",
    code_challenge: pkce.challenge,
    code_challenge_method: "S256",
    id_token_add_organizations: "true",
    codex_cli_simplified_flow: "true",
    state,
    originator: "opencode",
  })
  return `${ISSUER}/oauth/authorize?${params.toString()}`
}

async function exchangeCodeForTokens(code: string, redirectUri: string, pkce: PkceCodes) {
  const response = await fetch(`${ISSUER}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: CLIENT_ID,
      code_verifier: pkce.verifier,
    }).toString(),
  })

  if (!response.ok) {
    throw new Error(`Token exchange failed: ${response.status}`)
  }

  return (await response.json()) as TokenResponse
}

async function refreshAccessToken(refreshToken: string, issuer = ISSUER) {
  const response = await fetch(`${issuer}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    }).toString(),
  })

  if (!response.ok) {
    throw new Error(`Token refresh failed: ${response.status}`)
  }

  return (await response.json()) as TokenResponse
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
      <p>Buddy is reconnecting. You can close this window and return to Buddy.</p>
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
  getAuth: () => Promise<StoredOauthAuth | { type: string }>
  setAuth: (auth: StoredOauthAuth) => Promise<void>
  issuer?: string
  codexApiEndpoint?: string
}) {
  const issuer = input.issuer ?? ISSUER
  const codexApiEndpoint = input.codexApiEndpoint ?? CODEX_API_ENDPOINT
  let refreshPromise:
    | Promise<{
        access: string
        accountId: string | undefined
      }>
    | undefined

  return {
    apiKey: Auth.OAUTH_DUMMY_KEY,
    async fetch(requestInput: RequestInfo | URL, init?: RequestInit) {
      const auth = await input.getAuth()
      if (!isStoredOauthAuth(auth)) {
        return fetch(requestInput, init)
      }

      const sanitizedHeaders = new Headers(init?.headers)
      sanitizedHeaders.delete("authorization")
      sanitizedHeaders.delete("Authorization")

      let access = auth.access
      let accountId = auth.accountId

      if (!access || auth.expires < Date.now()) {
        if (!refreshPromise) {
          refreshPromise = refreshAccessToken(auth.refresh, issuer)
            .then(async (tokens) => {
              const nextAccountId = extractAccountId(tokens) || auth.accountId
              await input.setAuth({
                type: "oauth",
                refresh: tokens.refresh_token,
                access: tokens.access_token,
                expires: Date.now() + (tokens.expires_in ?? 3_600) * 1_000,
                ...(nextAccountId ? { accountId: nextAccountId } : {}),
              })

              return {
                access: tokens.access_token,
                accountId: nextAccountId,
              }
            })
            .finally(() => {
              refreshPromise = undefined
            })
        }

        const refreshed = await refreshPromise
        access = refreshed.access
        accountId = refreshed.accountId
      }

      sanitizedHeaders.set("authorization", `Bearer ${access}`)
      if (accountId) {
        sanitizedHeaders.set("ChatGPT-Account-Id", accountId)
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
      pendingOAuth?.reject(new Error("Login cancelled"))
      pendingOAuth = undefined
      res.writeHead(200)
      res.end("Login cancelled")
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

function waitForOAuthCallback(pkce: PkceCodes, state: string): Promise<TokenResponse> {
  return new Promise((resolve, reject) => {
    pendingOAuth?.reject(new Error(SUPERSEDED_AUTHORIZATION_ERROR))

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
              const tokens = await callbackPromise
              stopOAuthServer()
              const accountId = extractAccountId(tokens)
              return {
                type: "success" as const,
                refresh: tokens.refresh_token,
                access: tokens.access_token,
                expires: Date.now() + (tokens.expires_in ?? 3_600) * 1_000,
                ...(accountId ? { accountId } : {}),
              }
            },
          }
        },
      },
      {
        label: "ChatGPT Pro/Plus (headless)",
        type: "oauth",
        authorize: async () => {
          const deviceResponse = await fetch(`${ISSUER}/api/accounts/deviceauth/usercode`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "User-Agent": OPENCODE_OAUTH_USER_AGENT,
            },
            body: JSON.stringify({ client_id: CLIENT_ID }),
          })

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
            url: `${ISSUER}/codex/device`,
            instructions: `Enter code: ${deviceData.user_code}`,
            method: "auto" as const,
            async callback() {
              while (true) {
                const response = await fetch(`${ISSUER}/api/accounts/deviceauth/token`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "User-Agent": OPENCODE_OAUTH_USER_AGENT,
                  },
                  body: JSON.stringify({
                    device_auth_id: deviceData.device_auth_id,
                    user_code: deviceData.user_code,
                  }),
                })

                if (response.ok) {
                  const data = (await response.json()) as {
                    authorization_code: string
                    code_verifier: string
                  }
                  const tokenResponse = await fetch(`${ISSUER}/oauth/token`, {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body: new URLSearchParams({
                      grant_type: "authorization_code",
                      code: data.authorization_code,
                      redirect_uri: `${ISSUER}/deviceauth/callback`,
                      client_id: CLIENT_ID,
                      code_verifier: data.code_verifier,
                    }).toString(),
                  })

                  if (!tokenResponse.ok) {
                    throw new Error(`Token exchange failed: ${tokenResponse.status}`)
                  }

                  const tokens = (await tokenResponse.json()) as TokenResponse
                  const accountId = extractAccountId(tokens)
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
