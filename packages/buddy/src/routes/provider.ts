import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import { Schema } from "effect"
import z from "zod"
import { Provider as OpenCodeProvider } from "@buddy/opencode-adapter/provider"
import { ProviderAuth as OpenCodeProviderAuth } from "@buddy/opencode-adapter/provider-auth"
import { toOpenApiSchema } from "../http/effect-schema"
import { routeErrors, directoryQuerySchema, ProviderIDParamSchema } from "../http"
import { proxyToOpenCode } from "../http"

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
      proxyToOpenCode(c, {
        targetPath: "/provider",
        directoryMode: "bootstrap",
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
    async (c) => {
      return proxyToOpenCode(c, {
        targetPath: "/provider/auth",
        directoryMode: "bootstrap",
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
    async (c) => {
      return proxyToOpenCode(c, {
        targetPath: `/provider/${encodeURIComponent(c.req.valid("param").providerID)}/oauth/authorize`,
        directoryMode: "bootstrap",
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
        directoryMode: "bootstrap",
      })
    },
  )
