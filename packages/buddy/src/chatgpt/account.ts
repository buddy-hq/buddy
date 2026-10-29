import z from "zod"
import {
  ChatGPTReconnectRequired,
  type ChatGPTAccountModel,
  type ChatGPTAccountService,
  type ChatGPTAuth,
  type ChatGPTCredentials,
  type ChatGPTIdentity,
  type ChatGPTModelAvailability,
  type ChatGPTUsage,
} from "@buddy/agent-runtime/chatgpt"
import type { ExtensionLocation } from "@buddy/agent-runtime/extension"
import packageJson from "../../package.json"
import { AGENT_RUNTIME_INFO } from "../runtime/runtime-info"
import { createCodexImagesClient } from "../learning/features/image-generation/service/codex-images"
import { traceOpenAIAuth } from "./openai-auth-trace"

const CHATGPT_CODEX_MODELS_ENDPOINT = "https://chatgpt.com/backend-api/codex/models"
const CHATGPT_USAGE_ENDPOINT = "https://chatgpt.com/backend-api/wham/usage"
const OPENAI_USERINFO_ENDPOINT = "https://auth.openai.com/api/accounts/oauth/userinfo"
const MODEL_CACHE_TTL_MS = 5 * 60 * 1_000
const MODEL_RETRY_DELAY_MS = 15 * 60 * 1_000
const USAGE_CACHE_TTL_MS = 60 * 1_000
const USAGE_RETRY_DELAY_MS = 15 * 1_000
const BUDDY_USER_AGENT = `buddy/${packageJson.version}`
const EMPTY_MODEL_AVAILABILITY_ERROR = "OpenAI returned no account models"
const HTTP_STATUS_UNAUTHORIZED = 401
const OPENAI_ACCOUNT_ERROR_STATUS = "error"
const OPENAI_ACCOUNT_RECONNECT_REQUIRED_STATUS = "reconnect_required"
const LISTED_MODEL_VISIBILITY = "list"
const PERCENT_BASE = 100

const codexModelSchema = z
  .object({
    slug: z.string(),
    display_name: z.string().trim().min(1).nullish(),
    visibility: z.string(),
    context_window: z.number().int().positive().nullish(),
    max_context_window: z.number().int().positive().nullish(),
    max_output_tokens: z.number().int().positive().nullish(),
    input_modalities: z.array(z.string()).nullish(),
    supports_reasoning_summary_parameter: z.boolean().nullish(),
    effective_context_window_percent: z.number().positive().max(PERCENT_BASE).nullish(),
    supported_reasoning_levels: z
      .array(
        z
          .object({
            effort: z.string(),
          })
          .passthrough(),
      )
      .nullish(),
  })
  .passthrough()

const codexModelsResponseSchema = z.object({
  models: z.array(codexModelSchema),
})

const usageWindowSchema = z.object({
  used_percent: z.number(),
  reset_at: z.number(),
  limit_window_seconds: z.number(),
})

const usageRateLimitSchema = z.object({
  primary_window: usageWindowSchema.nullish(),
  secondary_window: usageWindowSchema.nullish(),
})

const usageAdditionalRateLimitSchema = z.object({
  limit_name: z.string().nullish(),
  metered_feature: z.string().nullish(),
  rate_limit: usageRateLimitSchema.nullish(),
})

const usageCreditsSchema = z.object({
  has_credits: z.boolean().default(false),
  unlimited: z.boolean().default(false),
  balance: z.union([z.number(), z.string()]).nullish(),
})

const usageResponseSchema = z
  .object({
    plan_type: z.string().nullish(),
    rate_limit: usageRateLimitSchema.nullish(),
    credits: usageCreditsSchema.nullish(),
    additional_rate_limits: z.array(usageAdditionalRateLimitSchema).nullish(),
  })
  .passthrough()

const openAIUserInfoSchema = z.object({ email: z.email() })

type FetchInput = Parameters<typeof fetch>[0]
type FetchInit = Parameters<typeof fetch>[1]

type ChatGPTAccountServiceOptions = {
  fetch?: (input: FetchInput, init?: FetchInit) => Promise<Response>
  now?: () => number
}

type ModelCache = {
  accountKey: string
  models: ChatGPTAccountModel[]
  modelIDs: string[]
  etag: string | undefined
  fetchedAtMs: number
}

type FailureCache = {
  accountKey: string
  authKey: string
  retryAtMs: number
  status: OpenAIAccountFailureStatus
}

type UsageCache = {
  accountKey: string
  response: Extract<ChatGPTUsage, { status: "ready" }>
  fetchedAtMs: number
}

type AccountRefresh<T> = {
  accountKey: string
  promise: Promise<T>
  requestID: symbol
}

type OpenAIAccountFailureStatus =
  | typeof OPENAI_ACCOUNT_ERROR_STATUS
  | typeof OPENAI_ACCOUNT_RECONNECT_REQUIRED_STATUS

class OpenAIAccountRequestError extends Error {
  readonly status: number

  constructor(requestName: string, status: number) {
    super(`${requestName} failed: ${status}`)
    this.name = "OpenAIAccountRequestError"
    this.status = status
  }
}

function resolveAccountFailureStatus(error: Error): OpenAIAccountFailureStatus {
  if (error instanceof ChatGPTReconnectRequired) {
    return OPENAI_ACCOUNT_RECONNECT_REQUIRED_STATUS
  }
  if (error instanceof OpenAIAccountRequestError && error.status === HTTP_STATUS_UNAUTHORIZED) {
    return OPENAI_ACCOUNT_RECONNECT_REQUIRED_STATUS
  }
  return OPENAI_ACCOUNT_ERROR_STATUS
}

function isAbortError(error: Error) {
  return error.name === "AbortError"
}

function accountHeaders(auth: ChatGPTAuth) {
  return Object.assign(
    {
      authorization: `Bearer ${auth.access}`,
      accept: "application/json",
      "user-agent": BUDDY_USER_AGENT,
    },
    auth.accountId ? { "ChatGPT-Account-Id": auth.accountId } : undefined,
  )
}

function normalizeUsageWindow(window: z.infer<typeof usageWindowSchema> | null | undefined) {
  if (!window) return null
  return {
    usedPercent: window.used_percent,
    resetsAt: new Date(window.reset_at * 1_000).toISOString(),
    windowSeconds: window.limit_window_seconds,
  }
}

function normalizeRateLimit(rateLimit: z.infer<typeof usageRateLimitSchema> | null | undefined) {
  return {
    primary: normalizeUsageWindow(rateLimit?.primary_window),
    secondary: normalizeUsageWindow(rateLimit?.secondary_window),
  }
}

function normalizeCreditBalance(value: string | number | null | undefined) {
  const numeric = z.number().finite().safeParse(value)
  if (numeric.success) return numeric.data
  const text = z.string().safeParse(value)
  if (!text.success) return null
  const parsed = Number(text.data)
  return Number.isFinite(parsed) ? parsed : null
}

function resolveAccountKey(auth: ChatGPTAuth) {
  return auth.credentialID ?? auth.accountId ?? auth.refresh
}

export function createChatGPTAccountService(
  _location: ExtensionLocation,
  credentials: ChatGPTCredentials,
  options: ChatGPTAccountServiceOptions = {},
): ChatGPTAccountService {
  const request = options.fetch ?? ((input, init) => fetch(input, init))
  const currentTime = options.now ?? (() => Date.now())
  const accountRequest = (input: FetchInput, init?: FetchInit) =>
    request(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(5_000) })
  const images = createCodexImagesClient({
    fetch: (url, init) => request(url, init),
    resolveAuth: () => credentials.resolve(),
    onRejected: (auth) => credentials.reject(auth),
  })
  let modelCache: ModelCache | undefined
  let modelFailure: FailureCache | undefined
  let modelRefresh: AccountRefresh<ModelCache> | undefined
  let usageCache: UsageCache | undefined
  let usageFailure: FailureCache | undefined
  let usageRefresh: AccountRefresh<ChatGPTUsage> | undefined
  const rejectedAccessTokens = new Set<string>()

  async function markAuthenticationRejected(auth: ChatGPTAuth) {
    rejectedAccessTokens.add(auth.access)
    await credentials.reject(auth)
  }

  function isAuthenticationRejected(auth: ChatGPTAuth) {
    return rejectedAccessTokens.has(auth.access)
  }

  async function readIdentity(): Promise<ChatGPTIdentity> {
    try {
      const auth = await credentials.resolve()
      if (!auth) return { status: "not_connected" }

      const response = await accountRequest(OPENAI_USERINFO_ENDPOINT, {
        headers: {
          authorization: `Bearer ${auth.access}`,
          accept: "application/json",
        },
      })
      if (!response.ok) return { status: "unavailable" }

      const result = openAIUserInfoSchema.safeParse(await response.json())
      if (!result.success) return { status: "unavailable" }

      const currentAuth = await credentials.resolve()
      if (
        !currentAuth ||
        resolveAccountKey(currentAuth) !== resolveAccountKey(auth) ||
        currentAuth.access !== auth.access
      ) {
        return { status: "unavailable" }
      }

      return { status: "ready", email: result.data.email }
    } catch {
      return { status: "unavailable" }
    }
  }

  async function fetchModels(auth: ChatGPTAuth, signal?: AbortSignal) {
    const accountKey = resolveAccountKey(auth)
    const currentCache = modelCache?.accountKey === accountKey ? modelCache : undefined
    const url = new URL(CHATGPT_CODEX_MODELS_ENDPOINT)
    url.searchParams.set("client_version", AGENT_RUNTIME_INFO.version)
    const headers = new Headers(accountHeaders(auth))
    if (currentCache?.etag) {
      headers.set("if-none-match", currentCache.etag)
    }

    const response = await accountRequest(url, { headers, signal })
    const fetchedAtMs = currentTime()
    if (response.status === 304 && currentCache) {
      return {
        ...currentCache,
        fetchedAtMs,
      }
    }
    if (!response.ok) {
      if (response.status === HTTP_STATUS_UNAUTHORIZED) {
        await markAuthenticationRejected(auth)
      }
      throw new OpenAIAccountRequestError("OpenAI model availability request", response.status)
    }

    const parsed = codexModelsResponseSchema.parse(await response.json())
    const models = parsed.models
      .filter((model) => model.visibility === LISTED_MODEL_VISIBILITY)
      .map((model): ChatGPTAccountModel => {
        const context = model.context_window ?? model.max_context_window
        return {
          id: model.slug,
          name: model.display_name ?? undefined,
          contextWindow: context
            ? Math.floor(
                (context * (model.effective_context_window_percent ?? PERCENT_BASE)) / PERCENT_BASE,
              )
            : undefined,
          maxOutputTokens: model.max_output_tokens ?? undefined,
          inputModalities: model.input_modalities ?? undefined,
          reasoningEfforts: model.supported_reasoning_levels?.map(({ effort }) => effort),
          reasoningSummary: model.supports_reasoning_summary_parameter ?? undefined,
        }
      })
    const modelIDs = models.map((model) => model.id)
    if (modelIDs.length === 0) {
      throw new Error(EMPTY_MODEL_AVAILABILITY_ERROR)
    }

    return {
      accountKey,
      models,
      modelIDs,
      etag: response.headers.get("etag") ?? undefined,
      fetchedAtMs,
    } satisfies ModelCache
  }

  function startModelRefresh(auth: ChatGPTAuth, signal?: AbortSignal) {
    const accountKey = resolveAccountKey(auth)
    if (modelRefresh?.accountKey === accountKey) return modelRefresh.promise
    const requestID = Symbol()

    const promise = fetchModels(auth, signal)
      .then((nextCache) => {
        if (modelRefresh?.requestID === requestID) {
          modelCache = nextCache
          modelFailure = undefined
        }
        return nextCache
      })
      .catch((error: Error) => {
        if (modelRefresh?.requestID === requestID && !isAbortError(error)) {
          modelFailure = {
            accountKey,
            authKey: auth.access,
            retryAtMs: currentTime() + MODEL_RETRY_DELAY_MS,
            status: resolveAccountFailureStatus(error),
          }
        }
        throw error
      })

    modelRefresh = { accountKey, promise, requestID }
    void promise.then(
      () => {
        if (modelRefresh?.requestID === requestID) modelRefresh = undefined
      },
      () => {
        if (modelRefresh?.requestID === requestID) modelRefresh = undefined
      },
    )
    return promise
  }

  function readModelState(auth: ChatGPTAuth) {
    const accountKey = resolveAccountKey(auth)
    const now = currentTime()
    const currentCache = modelCache?.accountKey === accountKey ? modelCache : undefined
    const cacheFresh =
      currentCache !== undefined && now - currentCache.fetchedAtMs < MODEL_CACHE_TTL_MS
    const activeFailure =
      modelFailure &&
      modelFailure.accountKey === accountKey &&
      modelFailure.authKey === auth.access &&
      modelFailure.retryAtMs > now
        ? modelFailure
        : undefined

    return {
      accountKey,
      currentCache,
      cacheFresh,
      activeFailure,
    }
  }

  async function resolveModelCatalog(
    signal?: AbortSignal,
  ): Promise<ChatGPTAccountModel[] | undefined> {
    let auth: ChatGPTAuth | undefined
    try {
      auth = await credentials.resolve()
      if (!auth) return undefined
      const currentAuth = await credentials.resolve()
      if (
        !currentAuth ||
        resolveAccountKey(currentAuth) !== resolveAccountKey(auth) ||
        currentAuth.access !== auth.access
      ) {
        return undefined
      }
      auth = currentAuth
    } catch {
      return undefined
    }
    if (isAuthenticationRejected(auth)) return undefined

    const state = readModelState(auth)
    if (state.cacheFresh) return state.currentCache?.models
    if (state.activeFailure) return state.currentCache?.models

    if (state.currentCache) {
      void startModelRefresh(auth).catch(() => undefined)
      return state.currentCache.models
    }

    try {
      return (await startModelRefresh(auth, signal)).models
    } catch {
      return undefined
    }
  }

  async function readModelAvailability(): Promise<ChatGPTModelAvailability> {
    let auth: ChatGPTAuth | undefined
    try {
      auth = await credentials.resolve()
    } catch (error) {
      return {
        status:
          error instanceof Error ? resolveAccountFailureStatus(error) : OPENAI_ACCOUNT_ERROR_STATUS,
      }
    }
    if (!auth) {
      modelCache = undefined
      modelFailure = undefined
      modelRefresh = undefined
      return { status: "not_connected" }
    }
    if (isAuthenticationRejected(auth)) {
      return { status: OPENAI_ACCOUNT_RECONNECT_REQUIRED_STATUS }
    }

    const state = readModelState(auth)

    if (
      !state.cacheFresh &&
      !state.activeFailure &&
      modelRefresh?.accountKey !== state.accountKey
    ) {
      void startModelRefresh(auth).catch(() => undefined)
    }

    if (state.activeFailure?.status === OPENAI_ACCOUNT_RECONNECT_REQUIRED_STATUS) {
      return { status: state.activeFailure.status }
    }
    if (state.currentCache) {
      return {
        status: "ready",
        modelIDs: state.currentCache.modelIDs,
        fetchedAt: new Date(state.currentCache.fetchedAtMs).toISOString(),
        refreshing: modelRefresh?.accountKey === state.accountKey,
      }
    }
    if (state.activeFailure) return { status: state.activeFailure.status }
    return { status: "loading" }
  }

  async function refreshModelAvailability(): Promise<ChatGPTModelAvailability> {
    let auth: ChatGPTAuth | undefined
    try {
      auth = await credentials.resolve()
    } catch (error) {
      return {
        status:
          error instanceof Error ? resolveAccountFailureStatus(error) : OPENAI_ACCOUNT_ERROR_STATUS,
      }
    }
    if (!auth) return { status: "not_connected" }
    if (isAuthenticationRejected(auth)) {
      return { status: OPENAI_ACCOUNT_RECONNECT_REQUIRED_STATUS }
    }

    try {
      const nextCache = await startModelRefresh(auth)
      return {
        status: "ready",
        modelIDs: nextCache.modelIDs,
        fetchedAt: new Date(nextCache.fetchedAtMs).toISOString(),
        refreshing: false,
      }
    } catch (error) {
      return {
        status:
          error instanceof Error ? resolveAccountFailureStatus(error) : OPENAI_ACCOUNT_ERROR_STATUS,
      }
    }
  }

  async function fetchUsage(auth: ChatGPTAuth): Promise<UsageCache> {
    const accountKey = resolveAccountKey(auth)
    const response = await accountRequest(CHATGPT_USAGE_ENDPOINT, {
      headers: accountHeaders(auth),
    })
    if (!response.ok) {
      if (response.status === HTTP_STATUS_UNAUTHORIZED) {
        await markAuthenticationRejected(auth)
      }
      throw new OpenAIAccountRequestError("OpenAI usage request", response.status)
    }

    const parsed = usageResponseSchema.parse(await response.json())
    const fetchedAtMs = currentTime()
    const readyResponse = {
      status: "ready",
      plan: parsed.plan_type ?? null,
      rateLimit: normalizeRateLimit(parsed.rate_limit),
      additionalRateLimits: (parsed.additional_rate_limits ?? []).map((entry) => ({
        name: entry.limit_name ?? null,
        meteredFeature: entry.metered_feature ?? null,
        rateLimit: normalizeRateLimit(entry.rate_limit),
      })),
      credits: parsed.credits
        ? {
            hasCredits: parsed.credits.has_credits,
            unlimited: parsed.credits.unlimited,
            balance: normalizeCreditBalance(parsed.credits.balance),
          }
        : null,
      fetchedAt: new Date(fetchedAtMs).toISOString(),
    } satisfies Extract<ChatGPTUsage, { status: "ready" }>

    return {
      accountKey,
      response: readyResponse,
      fetchedAtMs,
    }
  }

  function startUsageRefresh(auth: ChatGPTAuth) {
    const accountKey = resolveAccountKey(auth)
    if (usageRefresh?.accountKey === accountKey) return usageRefresh.promise
    const requestID = Symbol()
    const promise = fetchUsage(auth)
      .then((nextCache) => {
        if (usageRefresh?.requestID === requestID) {
          usageCache = nextCache
          usageFailure = undefined
        }
        return nextCache.response
      })
      .catch((error: Error) => {
        if (usageRefresh?.requestID === requestID) {
          usageFailure = {
            accountKey,
            authKey: auth.access,
            retryAtMs: currentTime() + USAGE_RETRY_DELAY_MS,
            status: resolveAccountFailureStatus(error),
          }
        }
        throw error
      })
    usageRefresh = { accountKey, promise, requestID }
    void promise.then(
      () => {
        if (usageRefresh?.requestID === requestID) usageRefresh = undefined
      },
      () => {
        if (usageRefresh?.requestID === requestID) usageRefresh = undefined
      },
    )
    return promise
  }

  async function readUsage(forceRefresh = false): Promise<ChatGPTUsage> {
    let auth: ChatGPTAuth | undefined
    try {
      auth = await credentials.resolve()
    } catch (error) {
      return {
        status:
          error instanceof Error ? resolveAccountFailureStatus(error) : OPENAI_ACCOUNT_ERROR_STATUS,
      }
    }
    if (!auth) {
      usageCache = undefined
      usageFailure = undefined
      usageRefresh = undefined
      return { status: "not_connected" }
    }
    if (isAuthenticationRejected(auth)) {
      return { status: OPENAI_ACCOUNT_RECONNECT_REQUIRED_STATUS }
    }

    const accountKey = resolveAccountKey(auth)
    const now = currentTime()
    const currentCache = usageCache?.accountKey === accountKey ? usageCache : undefined
    const cacheFresh = currentCache && now - currentCache.fetchedAtMs < USAGE_CACHE_TTL_MS
    const activeUsageFailure =
      usageFailure &&
      usageFailure.accountKey === accountKey &&
      usageFailure.authKey === auth.access &&
      usageFailure.retryAtMs > now
        ? usageFailure
        : undefined

    if (!forceRefresh && activeUsageFailure?.status === OPENAI_ACCOUNT_RECONNECT_REQUIRED_STATUS) {
      return { status: activeUsageFailure.status }
    }
    if (!forceRefresh && cacheFresh) return currentCache.response
    if (!forceRefresh && activeUsageFailure) return { status: activeUsageFailure.status }

    try {
      return await startUsageRefresh(auth)
    } catch (error) {
      const status =
        error instanceof Error ? resolveAccountFailureStatus(error) : OPENAI_ACCOUNT_ERROR_STATUS
      if (status === OPENAI_ACCOUNT_RECONNECT_REQUIRED_STATUS) return { status }
      return currentCache?.response ?? { status }
    }
  }

  return {
    identity: readIdentity,
    models: ({ refresh }) => (refresh ? refreshModelAvailability() : readModelAvailability()),
    usage: ({ refresh }) => readUsage(refresh),
    image: (request) => images.createImage(request),
    accountModels: resolveModelCatalog,
    credentialSwitched: () => traceOpenAIAuth("credential_switched"),
  }
}
