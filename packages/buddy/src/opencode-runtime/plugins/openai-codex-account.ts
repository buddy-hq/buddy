import z from "zod"
import { Auth } from "@buddy/opencode-adapter/auth"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { OpenCodeVersion } from "@buddy/opencode-adapter/installation"
import packageJson from "../../../package.json"
import {
  OpenAICodexTokenRefreshError,
  isOpenAICodexStoredAuth,
  OPENAI_CODEX_AUTH_ISSUER,
  OPENAI_PROVIDER_ID,
  resolveOpenAICodexAuth,
  type OpenAICodexStoredAuth,
} from "./openai-codex-credentials"

const CHATGPT_CODEX_MODELS_ENDPOINT = "https://chatgpt.com/backend-api/codex/models"
const CHATGPT_USAGE_ENDPOINT = "https://chatgpt.com/backend-api/wham/usage"
const MODEL_CACHE_TTL_MS = 24 * 60 * 60 * 1_000
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
    visibility: z.string(),
    context_window: z.number().int().positive().nullish(),
    max_context_window: z.number().int().positive().nullish(),
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

const usageWindowResponseSchema = z.object({
  usedPercent: z.number(),
  resetsAt: z.string(),
  windowSeconds: z.number(),
})

const usageRateLimitResponseSchema = z.object({
  primary: usageWindowResponseSchema.nullable(),
  secondary: usageWindowResponseSchema.nullable(),
})

const usageAdditionalRateLimitResponseSchema = z.object({
  name: z.string().nullable(),
  meteredFeature: z.string().nullable(),
  rateLimit: usageRateLimitResponseSchema,
})

const usageCreditsResponseSchema = z.object({
  hasCredits: z.boolean(),
  unlimited: z.boolean(),
  balance: z.number().nullable(),
})

export const openAIModelAvailabilityResponseSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("not_connected"),
  }),
  z.object({
    status: z.literal("loading"),
  }),
  z.object({
    status: z.literal("ready"),
    modelIDs: z.array(z.string()),
    fetchedAt: z.string(),
    refreshing: z.boolean(),
  }),
  z.object({
    status: z.literal("error"),
  }),
  z.object({
    status: z.literal("reconnect_required"),
  }),
])

export const openAIUsageResponseSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("not_connected"),
  }),
  z.object({
    status: z.literal("ready"),
    plan: z.string().nullable(),
    rateLimit: usageRateLimitResponseSchema,
    additionalRateLimits: z.array(usageAdditionalRateLimitResponseSchema),
    credits: usageCreditsResponseSchema.nullable(),
    fetchedAt: z.string(),
  }),
  z.object({
    status: z.literal("error"),
  }),
  z.object({
    status: z.literal("reconnect_required"),
  }),
])

export type OpenAIModelAvailabilityResponse = z.infer<typeof openAIModelAvailabilityResponseSchema>
export type OpenAIUsageResponse = z.infer<typeof openAIUsageResponseSchema>
export type OpenAICodexAccountModel = z.infer<typeof codexModelSchema>

type FetchInput = Parameters<typeof fetch>[0]
type FetchInit = Parameters<typeof fetch>[1]

type AccountServiceDependencies = {
  fetch: (input: FetchInput, init?: FetchInit) => Promise<Response>
  now: () => number
  getAuth: (directory: string) => Promise<Auth.Info | undefined>
  setAuth: (directory: string, auth: OpenAICodexStoredAuth) => Promise<void>
}

type ModelCache = {
  accountKey: string
  models: OpenAICodexAccountModel[]
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
  response: Extract<OpenAIUsageResponse, { status: "ready" }>
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
  if (error instanceof OpenAICodexTokenRefreshError && error.reconnectRequired) {
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

function accountHeaders(auth: OpenAICodexStoredAuth) {
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

function resolveAccountKey(auth: OpenAICodexStoredAuth) {
  return auth.accountId ?? auth.refresh
}

export function createOpenAICodexAccountService(dependencies: AccountServiceDependencies) {
  let modelCache: ModelCache | undefined
  let modelFailure: FailureCache | undefined
  let modelRefresh: AccountRefresh<ModelCache> | undefined
  let usageCache: UsageCache | undefined
  let usageFailure: FailureCache | undefined
  let usageRefresh: AccountRefresh<OpenAIUsageResponse> | undefined
  const rejectedAccessTokens = new Set<string>()

  function markAuthenticationRejected(auth: OpenAICodexStoredAuth) {
    rejectedAccessTokens.add(auth.access)
  }

  function isAuthenticationRejected(auth: OpenAICodexStoredAuth) {
    return rejectedAccessTokens.has(auth.access)
  }

  async function resolveAuth(directory: string) {
    return resolveOpenAICodexAuth({
      getAuth: () => dependencies.getAuth(directory),
      setAuth: (auth) => dependencies.setAuth(directory, auth),
      issuer: OPENAI_CODEX_AUTH_ISSUER,
    })
  }

  async function fetchModels(auth: OpenAICodexStoredAuth, signal?: AbortSignal) {
    const accountKey = resolveAccountKey(auth)
    const currentCache = modelCache?.accountKey === accountKey ? modelCache : undefined
    const url = new URL(CHATGPT_CODEX_MODELS_ENDPOINT)
    url.searchParams.set("client_version", OpenCodeVersion)
    const headers = new Headers(accountHeaders(auth))
    if (currentCache?.etag) {
      headers.set("if-none-match", currentCache.etag)
    }

    const response = await dependencies.fetch(url, { headers, signal })
    const fetchedAtMs = dependencies.now()
    if (response.status === 304 && currentCache) {
      return {
        ...currentCache,
        fetchedAtMs,
      }
    }
    if (!response.ok) {
      if (response.status === HTTP_STATUS_UNAUTHORIZED) {
        markAuthenticationRejected(auth)
      }
      throw new OpenAIAccountRequestError("OpenAI model availability request", response.status)
    }

    const parsed = codexModelsResponseSchema.parse(await response.json())
    const models = parsed.models.filter((model) => model.visibility === LISTED_MODEL_VISIBILITY)
    const modelIDs = models.map((model) => model.slug)
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

  function startModelRefresh(auth: OpenAICodexStoredAuth, signal?: AbortSignal) {
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
            retryAtMs: dependencies.now() + MODEL_RETRY_DELAY_MS,
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

  function readModelState(auth: OpenAICodexStoredAuth) {
    const accountKey = resolveAccountKey(auth)
    const now = dependencies.now()
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
    directory: string,
    signal?: AbortSignal,
  ): Promise<OpenAICodexAccountModel[] | undefined> {
    let auth: OpenAICodexStoredAuth | undefined
    try {
      auth = await resolveAuth(directory)
      if (!auth) return undefined
      const currentAuth = await dependencies.getAuth(directory)
      if (!isOpenAICodexStoredAuth(currentAuth) || currentAuth.refresh !== auth.refresh) {
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

    try {
      return (await startModelRefresh(auth, signal)).models
    } catch {
      return state.currentCache?.models
    }
  }

  async function readModelAvailability(
    directory: string,
  ): Promise<OpenAIModelAvailabilityResponse> {
    let auth: OpenAICodexStoredAuth | undefined
    try {
      auth = await resolveAuth(directory)
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

  async function refreshModelAvailability(
    directory: string,
  ): Promise<OpenAIModelAvailabilityResponse> {
    let auth: OpenAICodexStoredAuth | undefined
    try {
      auth = await resolveAuth(directory)
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

  async function fetchUsage(auth: OpenAICodexStoredAuth): Promise<UsageCache> {
    const accountKey = resolveAccountKey(auth)
    const response = await dependencies.fetch(CHATGPT_USAGE_ENDPOINT, {
      headers: accountHeaders(auth),
    })
    if (!response.ok) {
      if (response.status === HTTP_STATUS_UNAUTHORIZED) {
        markAuthenticationRejected(auth)
      }
      throw new OpenAIAccountRequestError("OpenAI usage request", response.status)
    }

    const parsed = usageResponseSchema.parse(await response.json())
    const fetchedAtMs = dependencies.now()
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
    } satisfies Extract<OpenAIUsageResponse, { status: "ready" }>

    return {
      accountKey,
      response: readyResponse,
      fetchedAtMs,
    }
  }

  function startUsageRefresh(auth: OpenAICodexStoredAuth) {
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
            retryAtMs: dependencies.now() + USAGE_RETRY_DELAY_MS,
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

  async function readUsage(directory: string, forceRefresh = false): Promise<OpenAIUsageResponse> {
    let auth: OpenAICodexStoredAuth | undefined
    try {
      auth = await resolveAuth(directory)
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
    const now = dependencies.now()
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
    markAuthenticationRejected,
    resolveModelCatalog,
    readModelAvailability,
    refreshModelAvailability,
    readUsage,
  }
}

export const openAICodexAccountService = createOpenAICodexAccountService({
  fetch: (input, init) => fetch(input, init),
  now: () => Date.now(),
  getAuth: async (directory) =>
    await OpenCodeInstance.provide({
      directory,
      fn: () => Auth.get(OPENAI_PROVIDER_ID),
    }),
  setAuth: async (directory, auth) =>
    await OpenCodeInstance.provide({
      directory,
      fn: () => Auth.set(OPENAI_PROVIDER_ID, auth),
    }),
})
