import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { Provider as OpenCodeProvider } from "@buddy/opencode-adapter/provider"
import { ProviderAuth as OpenCodeProviderAuth } from "@buddy/opencode-adapter/provider-auth"
import { routeErrors, directoryQuerySchema, ProviderIDParamSchema } from "../http"
import { proxyToOpenCode } from "../http"

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
        return proxyToOpenCode(c, {
          targetPath: "/provider",
        })
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
