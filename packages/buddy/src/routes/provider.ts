import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import { Schema } from "effect"
import z from "zod"
import { Provider as OpenCodeProvider } from "@buddy/opencode-adapter/provider"
import { ProviderAuth as OpenCodeProviderAuth } from "@buddy/opencode-adapter/provider-auth"
import { toOpenApiSchema } from "../http/effect-schema"
import {
  routeErrors,
  directoryQuerySchema,
  ProviderIDParamSchema,
  resolveOptionalDirectoryRequestContext,
  respondWithSdkResult,
  runSdkRoute,
  openCodeDirectoryParams,
} from "../http"
import { getOpenCodeClient } from "../opencode-runtime/client"
import {
  cancelOpenAICodexAuthorization,
  OPENAI_PROVIDER_ID,
} from "../opencode-runtime/plugins/openai-codex-auth"
import { ensureGlobalBootstrapWorkspaceDirectory } from "../project"

const oauthMethodRequestSchema = z.object({
  method: z.number().int(),
})

const oauthCallbackRequestSchema = z.object({
  method: z.number().int(),
  code: z.string().optional(),
})

const providerListResponseSchema = toOpenApiSchema(
  Schema.Struct({
    all: Schema.Array(OpenCodeProvider.Info),
    default: Schema.Record(Schema.String, Schema.String),
    connected: Schema.Array(Schema.String),
  }),
)

const providerAuthResponseSchema = toOpenApiSchema(
  Schema.Record(Schema.String, Schema.Array(OpenCodeProviderAuth.Method)),
)

function resolveBootstrapDirectory(
  c: Parameters<typeof resolveOptionalDirectoryRequestContext>[0],
) {
  const directoryResult = resolveOptionalDirectoryRequestContext(c)
  if (!directoryResult.ok) return directoryResult

  return {
    ok: true as const,
    directory: directoryResult.context.directory ?? ensureGlobalBootstrapWorkspaceDirectory(),
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
    async (c) =>
      runSdkRoute(c, async () => {
        const directoryResult = resolveBootstrapDirectory(c)
        if (!directoryResult.ok) return directoryResult.response

        const client = await getOpenCodeClient(directoryResult.directory)
        const result = await client.provider.list(
          openCodeDirectoryParams(directoryResult.directory),
        )
        return respondWithSdkResult(c, result)
      }),
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
    async (c) =>
      runSdkRoute(c, async () => {
        const directoryResult = resolveBootstrapDirectory(c)
        if (!directoryResult.ok) return directoryResult.response

        const client = await getOpenCodeClient(directoryResult.directory)
        const result = await client.provider.auth(
          openCodeDirectoryParams(directoryResult.directory),
        )
        return respondWithSdkResult(c, result)
      }),
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
            "application/json": {
              schema: resolver(
                toOpenApiSchema(Schema.optional(OpenCodeProviderAuth.Authorization)),
              ),
            },
          },
        },
        ...routeErrors(400, 403),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", ProviderIDParamSchema),
    validator("json", oauthMethodRequestSchema),
    async (c) =>
      runSdkRoute(c, async () => {
        const directoryResult = resolveBootstrapDirectory(c)
        if (!directoryResult.ok) return directoryResult.response

        const providerID = c.req.valid("param").providerID
        const body = c.req.valid("json")
        const client = await getOpenCodeClient(directoryResult.directory)
        const result = await client.provider.oauth.authorize({
          providerID,
          method: body.method,
          ...openCodeDirectoryParams(directoryResult.directory),
        })
        return respondWithSdkResult(c, result)
      }),
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
    async (c) =>
      runSdkRoute(c, async () => {
        const directoryResult = resolveBootstrapDirectory(c)
        if (!directoryResult.ok) return directoryResult.response

        const providerID = c.req.valid("param").providerID
        const body = c.req.valid("json")
        const client = await getOpenCodeClient(directoryResult.directory)
        const result = await client.provider.oauth.callback({
          providerID,
          method: body.method,
          code: body.code,
          ...openCodeDirectoryParams(directoryResult.directory),
        })
        return respondWithSdkResult(c, result)
      }),
  )
  .post(
    "/:providerID/oauth/cancel",
    describeRoute({
      operationId: "provider.oauth.cancel",
      summary: "Cancel provider OAuth",
      responses: {
        200: {
          description: "Provider auth cancellation payload",
          content: {
            "application/json": { schema: resolver(z.boolean()) },
          },
        },
        ...routeErrors(403),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", ProviderIDParamSchema),
    async (c) =>
      runSdkRoute(c, async () => {
        const directoryResult = resolveBootstrapDirectory(c)
        if (!directoryResult.ok) return directoryResult.response

        const providerID = c.req.valid("param").providerID
        return c.json(providerID === OPENAI_PROVIDER_ID ? cancelOpenAICodexAuthorization() : false)
      }),
  )
