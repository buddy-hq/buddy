import z from "zod"
import { Auth } from "@buddy/opencode-adapter/auth"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { OpenCodeVersion } from "@buddy/opencode-adapter/installation"
import packageJson from "../../../package.json"
import {
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

const codexModelSchema = z
  .object({
    slug: z.string(),
    visibility: z.string(),
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
])

export type OpenAIModelAvailabilityResponse = z.infer<
  typeof openAIModelAvailabilityResponseSchema
>
export type OpenAIUsageResponse = z.infer<typeof openAIUsageResponseSchema>

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
  modelIDs: string[]
  etag: string | undefined
  fetchedAtMs: number
}

type FailureCache = {
  accountKey: string
  retryAtMs: number
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

function accountHeaders(auth: OpenAICodexStoredAuth) {
  return {
    authorization: `Bearer ${auth.access}`,
    accept: "application/json",
    "user-agent": BUDDY_USER_AGENT,
    ...(auth.accountId ? { "ChatGPT-Account-Id": auth.accountId } : {}),
  }
}

function normalizeUsageWindow(
  window: z.infer<typeof usageWindowSchema> | null | undefined,
) {
  if (!window) return null
  return {
    usedPercent: window.used_percent,
    resetsAt: new Date(window.reset_at * 1_000).toISOString(),
    windowSeconds: window.limit_window_seconds,
  }
}

function normalizeRateLimit(
  rateLimit: z.infer<typeof usageRateLimitSchema> | null | undefined,
) {
  return {
    primary: normalizeUsageWindow(rateLimit?.primary_window),
    secondary: normalizeUsageWindow(rateLimit?.secondary_window),
  }
}

function normalizeCreditBalance(value: string | number | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value !== "string") return null
  const parsed = Number(value)
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

  async function resolveAuth(directory: string) {
    return resolveOpenAICodexAuth({
      getAuth: () => dependencies.getAuth(directory),
      setAuth: (auth) => dependencies.setAuth(directory, auth),
      issuer: OPENAI_CODEX_AUTH_ISSUER,
    })
  }

  async function fetchModels(auth: OpenAICodexStoredAuth) {
    const accountKey = resolveAccountKey(auth)
    const currentCache =
      modelCache?.accountKey === accountKey ? modelCache : undefined
    const url = new URL(CHATGPT_CODEX_MODELS_ENDPOINT)
    url.searchParams.set("client_version", OpenCodeVersion)
    const headers = new Headers(accountHeaders(auth))
    if (currentCache?.etag) {
      headers.set("if-none-match", currentCache.etag)
    }

    const response = await dependencies.fetch(url, { headers })
    const fetchedAtMs = dependencies.now()
    if (response.status === 304 && currentCache) {
      return {
        ...currentCache,
        fetchedAtMs,
      }
    }
    if (!response.ok) {
      throw new Error(`OpenAI model availability request failed: ${response.status}`)
    }

    const parsed = codexModelsResponseSchema.parse(await response.json())
    const modelIDs = parsed.models
      .filter((model) => model.visibility === "list")
      .map((model) => model.slug)
    if (modelIDs.length === 0) {
      throw new Error(EMPTY_MODEL_AVAILABILITY_ERROR)
    }

    return {
      accountKey,
      modelIDs,
      etag: response.headers.get("etag") ?? undefined,
      fetchedAtMs,
    } satisfies ModelCache
  }

  function startModelRefresh(auth: OpenAICodexStoredAuth) {
    const accountKey = resolveAccountKey(auth)
    if (modelRefresh?.accountKey === accountKey) return modelRefresh.promise
    const requestID = Symbol()

    const promise = fetchModels(auth)
      .then((nextCache) => {
        if (modelRefresh?.requestID === requestID) {
          modelCache = nextCache
          modelFailure = undefined
        }
        return nextCache
      })
      .catch((error: unknown) => {
        if (modelRefresh?.requestID === requestID) {
          modelFailure = {
            accountKey,
            retryAtMs: dependencies.now() + MODEL_RETRY_DELAY_MS,
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

  async function readModelAvailability(
    directory: string,
  ): Promise<OpenAIModelAvailabilityResponse> {
    const auth = await resolveAuth(directory)
    if (!auth) {
      modelCache = undefined
      modelFailure = undefined
      modelRefresh = undefined
      return { status: "not_connected" }
    }

    const accountKey = resolveAccountKey(auth)
    const now = dependencies.now()
    const currentCache = modelCache?.accountKey === accountKey ? modelCache : undefined
    const cacheFresh =
      currentCache && now - currentCache.fetchedAtMs < MODEL_CACHE_TTL_MS
    const failureActive =
      modelFailure &&
      modelFailure.accountKey === accountKey &&
      modelFailure.retryAtMs > now

    if (
      !cacheFresh &&
      !failureActive &&
      modelRefresh?.accountKey !== accountKey
    ) {
      void startModelRefresh(auth).catch(() => undefined)
    }

    if (currentCache) {
      return {
        status: "ready",
        modelIDs: currentCache.modelIDs,
        fetchedAt: new Date(currentCache.fetchedAtMs).toISOString(),
        refreshing: modelRefresh?.accountKey === accountKey,
      }
    }
    if (failureActive) return { status: "error" }
    return { status: "loading" }
  }

  async function refreshModelAvailability(
    directory: string,
  ): Promise<OpenAIModelAvailabilityResponse> {
    const auth = await resolveAuth(directory)
    if (!auth) return { status: "not_connected" }

    try {
      const nextCache = await startModelRefresh(auth)
      return {
        status: "ready",
        modelIDs: nextCache.modelIDs,
        fetchedAt: new Date(nextCache.fetchedAtMs).toISOString(),
        refreshing: false,
      }
    } catch {
      return { status: "error" }
    }
  }

  async function fetchUsage(auth: OpenAICodexStoredAuth): Promise<UsageCache> {
    const accountKey = resolveAccountKey(auth)
    const response = await dependencies.fetch(CHATGPT_USAGE_ENDPOINT, {
      headers: accountHeaders(auth),
    })
    if (!response.ok) {
      throw new Error(`OpenAI usage request failed: ${response.status}`)
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
      .catch((error: unknown) => {
        if (usageRefresh?.requestID === requestID) {
          usageFailure = {
            accountKey,
            retryAtMs: dependencies.now() + USAGE_RETRY_DELAY_MS,
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

  async function readUsage(
    directory: string,
    forceRefresh = false,
  ): Promise<OpenAIUsageResponse> {
    const auth = await resolveAuth(directory)
    if (!auth) {
      usageCache = undefined
      usageFailure = undefined
      usageRefresh = undefined
      return { status: "not_connected" }
    }

    const accountKey = resolveAccountKey(auth)
    const now = dependencies.now()
    const currentCache = usageCache?.accountKey === accountKey ? usageCache : undefined
    const cacheFresh =
      currentCache && now - currentCache.fetchedAtMs < USAGE_CACHE_TTL_MS
    const failureActive =
      usageFailure &&
      usageFailure.accountKey === accountKey &&
      usageFailure.retryAtMs > now

    if (!forceRefresh && cacheFresh) return currentCache.response
    if (!forceRefresh && failureActive) return { status: "error" }

    try {
      return await startUsageRefresh(auth)
    } catch {
      return currentCache?.response ?? { status: "error" }
    }
  }

  return {
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
