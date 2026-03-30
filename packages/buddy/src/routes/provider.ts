import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { Provider as OpenCodeProvider } from "@buddy/opencode-adapter/provider"
import { ProviderAuth as OpenCodeProviderAuth } from "@buddy/opencode-adapter/provider-auth"
import { routeErrors, directoryQuerySchema, ProviderIDParamSchema } from "../http"
import { proxyToOpenCode } from "../http"
import { getE2ERuntimeState, isE2EModeEnabled } from "../e2e/runtime"

const oauthMethodRequestSchema = z.object({
  method: z.number().int(),
})

const oauthCallbackRequestSchema = z.object({
  method: z.number().int(),
  code: z.string().optional(),
})

const providerListResponseSchema = z.object({
  all: OpenCodeProvider.Info.array(),
  default: z.record(z.string(), z.string()),
  connected: z.array(z.string()),
})

const providerAuthResponseSchema = z.record(z.string(), z.array(OpenCodeProviderAuth.Method))

const OPENAI_PROVIDER_ID = "openai"
const OPENAI_E2E_MODEL_ID = "gpt-5-nano"

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function buildE2EOpenAIModel() {
  return {
    id: OPENAI_E2E_MODEL_ID,
    providerID: OPENAI_PROVIDER_ID,
    api: {
      id: OPENAI_E2E_MODEL_ID,
      url: "https://api.openai.com/v1",
      npm: "@ai-sdk/openai",
    },
    name: "GPT-5-nano",
    family: "gpt-nano",
    capabilities: {
      temperature: false,
      reasoning: true,
      attachment: true,
      toolcall: true,
      input: {
        text: true,
        audio: false,
        image: true,
        video: false,
        pdf: false,
      },
      output: {
        text: true,
        audio: false,
        image: false,
        video: false,
        pdf: false,
      },
      interleaved: false,
    },
    cost: {
      input: 0,
      output: 0,
      cache: {
        read: 0,
        write: 0,
      },
    },
    limit: {
      context: 400_000,
      output: 128_000,
    },
    status: "active",
    options: {},
    headers: {},
    release_date: "2025-08-05",
  }
}

function tryOpenAIConnectionOverride(payload: unknown, connected: boolean) {
  if (!payload || typeof payload !== "object") return undefined

  const candidate = payload as {
    all?: unknown
    default?: unknown
    connected?: unknown
  }

  if (!Array.isArray(candidate.all) || !Array.isArray(candidate.connected)) {
    return undefined
  }

  let foundOpenAI = false
  const all = candidate.all
    .map((entry) => {
      if (!entry || typeof entry !== "object") return undefined
      const provider = entry as Record<string, unknown>
      if (provider.id !== OPENAI_PROVIDER_ID) return provider
      foundOpenAI = true
      return {
        ...provider,
        connected,
      }
    })
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))

  if (connected && !foundOpenAI) {
    all.unshift({
      id: OPENAI_PROVIDER_ID,
      name: "OpenAI",
      source: "config",
      env: [],
      options: {},
      models: {
        [OPENAI_E2E_MODEL_ID]: buildE2EOpenAIModel(),
      },
      connected: true,
    })
  }

  const current = candidate.connected.filter(
    (id): id is string => typeof id === "string" && id !== OPENAI_PROVIDER_ID,
  )
  const nextConnected = connected ? [OPENAI_PROVIDER_ID, ...current] : current
  const nextDefault = asRecord(candidate.default)
  const defaultModels = all.find((provider) => provider.id === OPENAI_PROVIDER_ID)?.models as
    | Record<string, unknown>
    | undefined
  const nextDefaultModelID =
    defaultModels && OPENAI_E2E_MODEL_ID in defaultModels ? OPENAI_E2E_MODEL_ID : undefined

  return {
    ...candidate,
    all,
    default:
      connected && nextDefaultModelID
        ? {
            ...(nextDefault ?? {}),
            [OPENAI_PROVIDER_ID]: nextDefaultModelID,
          }
        : candidate.default,
    connected: nextConnected,
  }
}

export const ProviderRoutes = new Hono()
  .get(
    "/",
    describeRoute({
      operationId: "provider.list",
      summary: "List providers",
      responses: {
        200: {
          description: "OpenCode provider list payload",
          content: {
            "application/json": { schema: resolver(providerListResponseSchema) },
          },
        },
        ...routeErrors(403),
      },
    }),
    validator("query", directoryQuerySchema),
    async (c) => {
      const response = await proxyToOpenCode(c, {
        targetPath: "/provider",
      })

      const openAIConnected = getE2ERuntimeState().providers.openAIConnected
      if (!isE2EModeEnabled() || !response.ok) {
        return response
      }

      const payload = await response
        .clone()
        .json()
        .catch(() => undefined)
      const overridden = tryOpenAIConnectionOverride(payload, openAIConnected)
      if (!overridden) {
        return response
      }

      return c.json(overridden, 200)
    },
  )
  .get(
    "/auth",
    describeRoute({
      operationId: "provider.auth",
      summary: "List provider auth methods",
      responses: {
        200: {
          description: "OpenCode provider auth method payload",
          content: {
            "application/json": { schema: resolver(providerAuthResponseSchema) },
          },
        },
        ...routeErrors(403),
      },
    }),
    validator("query", directoryQuerySchema),
    async (c) => {
      return proxyToOpenCode(c, {
        targetPath: "/provider/auth",
      })
    },
  )
  .post(
    "/:providerID/oauth/authorize",
    describeRoute({
      operationId: "provider.oauth.authorize",
      summary: "Start provider OAuth",
      responses: {
        200: {
          description: "Provider auth initiation payload",
          content: {
            "application/json": { schema: resolver(OpenCodeProviderAuth.Authorization.optional()) },
          },
        },
        ...routeErrors(400, 403),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", ProviderIDParamSchema),
    validator("json", oauthMethodRequestSchema),
    async (c) => {
      return proxyToOpenCode(c, {
        targetPath: `/provider/${encodeURIComponent(c.req.valid("param").providerID)}/oauth/authorize`,
      })
    },
  )
  .post(
    "/:providerID/oauth/callback",
    describeRoute({
      operationId: "provider.oauth.callback",
      summary: "Complete provider OAuth callback",
      responses: {
        200: {
          description: "Provider auth callback payload",
          content: {
            "application/json": { schema: resolver(z.boolean()) },
          },
        },
        ...routeErrors(400, 403),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", ProviderIDParamSchema),
    validator("json", oauthCallbackRequestSchema),
    async (c) => {
      return proxyToOpenCode(c, {
        targetPath: `/provider/${encodeURIComponent(c.req.valid("param").providerID)}/oauth/callback`,
      })
    },
  )
