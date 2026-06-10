import z from "zod"

const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 3_600
export const OPENAI_CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"
export const OPENAI_CODEX_AUTH_ISSUER = "https://auth.openai.com"
export const OPENAI_PROVIDER_ID = "openai"

const authorizationTokenResponseSchema = z.object({
  id_token: z.string().optional(),
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number().optional(),
})

const refreshTokenResponseSchema = z.object({
  id_token: z.string().optional(),
  access_token: z.string(),
  refresh_token: z.string().optional(),
  expires_in: z.number().optional(),
})

const idTokenClaimsSchema = z
  .object({
    chatgpt_account_id: z.string().optional(),
    organizations: z.array(z.object({ id: z.string() })).optional(),
    email: z.string().optional(),
    "https://api.openai.com/auth": z
      .object({
        chatgpt_account_id: z.string().optional(),
      })
      .optional(),
  })
  .passthrough()

export type OpenAICodexTokenResponse = z.infer<typeof authorizationTokenResponseSchema>
type OpenAICodexRefreshTokenResponse = z.infer<typeof refreshTokenResponseSchema>

export type OpenAICodexStoredAuth = {
  type: "oauth"
  access: string
  refresh: string
  expires: number
  accountId?: string
}

type OpenAICodexAuthValue = OpenAICodexStoredAuth | { type: string } | undefined

type ResolveOpenAICodexAuthInput = {
  getAuth: () => Promise<OpenAICodexAuthValue>
  setAuth: (auth: OpenAICodexStoredAuth) => Promise<void>
  issuer: string
}

let activeRefresh:
  | {
      refreshToken: string
      promise: Promise<OpenAICodexStoredAuth>
    }
  | undefined

export function isOpenAICodexStoredAuth(
  value: OpenAICodexAuthValue,
): value is OpenAICodexStoredAuth {
  return Boolean(
    value &&
      value.type === "oauth" &&
      "access" in value &&
      typeof value.access === "string" &&
      "refresh" in value &&
      typeof value.refresh === "string" &&
      "expires" in value &&
      typeof value.expires === "number",
  )
}

export function parseOpenAICodexTokenResponse(value: unknown): OpenAICodexTokenResponse {
  return authorizationTokenResponseSchema.parse(value)
}

function parseJwtClaims(token: string) {
  const parts = token.split(".")
  if (parts.length !== 3) return undefined

  try {
    const parsed: unknown = JSON.parse(Buffer.from(parts[1], "base64url").toString())
    const result = idTokenClaimsSchema.safeParse(parsed)
    return result.success ? result.data : undefined
  } catch {
    return undefined
  }
}

function extractAccountIdFromClaims(claims: z.infer<typeof idTokenClaimsSchema>) {
  return (
    claims.chatgpt_account_id ||
    claims["https://api.openai.com/auth"]?.chatgpt_account_id ||
    claims.organizations?.[0]?.id
  )
}

export function extractOpenAICodexAccountId(
  tokens: Pick<OpenAICodexRefreshTokenResponse, "access_token" | "id_token">,
) {
  const idTokenClaims = tokens.id_token ? parseJwtClaims(tokens.id_token) : undefined
  const idTokenAccountID = idTokenClaims && extractAccountIdFromClaims(idTokenClaims)
  if (idTokenAccountID) return idTokenAccountID

  const accessTokenClaims = parseJwtClaims(tokens.access_token)
  if (!accessTokenClaims) return undefined
  return extractAccountIdFromClaims(accessTokenClaims)
}

async function refreshAccessToken(refreshToken: string, issuer: string) {
  const response = await fetch(`${issuer}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: OPENAI_CODEX_CLIENT_ID,
    }).toString(),
  })

  if (!response.ok) {
    throw new Error(`Token refresh failed: ${response.status}`)
  }

  return refreshTokenResponseSchema.parse(await response.json())
}

export async function resolveOpenAICodexAuth(
  input: ResolveOpenAICodexAuthInput,
): Promise<OpenAICodexStoredAuth | undefined> {
  const auth = await input.getAuth()
  if (!isOpenAICodexStoredAuth(auth)) return undefined
  if (auth.access && auth.expires >= Date.now()) return auth

  if (!activeRefresh || activeRefresh.refreshToken !== auth.refresh) {
    const promise = refreshAccessToken(auth.refresh, input.issuer).then(async (tokens) => {
      const accountId = extractOpenAICodexAccountId(tokens) || auth.accountId
      const nextAuth: OpenAICodexStoredAuth = {
        type: "oauth",
        refresh: tokens.refresh_token ?? auth.refresh,
        access: tokens.access_token,
        expires:
          Date.now() +
          (tokens.expires_in ?? DEFAULT_ACCESS_TOKEN_TTL_SECONDS) * 1_000,
        ...(accountId ? { accountId } : {}),
      }
      const currentAuth = await input.getAuth()
      if (isOpenAICodexStoredAuth(currentAuth) && currentAuth.refresh === auth.refresh) {
        await input.setAuth(nextAuth)
      }
      return nextAuth
    })

    activeRefresh = {
      refreshToken: auth.refresh,
      promise,
    }

    void promise.then(
      () => {
        if (activeRefresh?.promise === promise) activeRefresh = undefined
      },
      () => {
        if (activeRefresh?.promise === promise) activeRefresh = undefined
      },
    )
  }

  return activeRefresh.promise
}
