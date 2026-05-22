import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { routeErrors, directoryQuerySchema, ProviderIDParamSchema } from "../http"
import { piListProviders, piProviderAuthMethods } from "../pi-backend/provider-actions"
import { piAuthorizeProviderOAuth, piCompleteProviderOAuth } from "../pi-backend/oauth-actions"

const oauthMethodRequestSchema = z.object({
  method: z.number().int(),
})

const oauthCallbackRequestSchema = z.object({
  method: z.number().int(),
  code: z.string().optional(),
})

const providerListResponseSchema = z.object({
  all: z.array(z.record(z.string(), z.unknown())),
  default: z.record(z.string(), z.string()),
  connected: z.array(z.string()),
})

const providerAuthResponseSchema = z.record(z.string(), z.array(z.record(z.string(), z.unknown())))
const oauthAuthorizationResponseSchema = z
  .object({
    type: z.string().optional(),
    url: z.string().optional(),
    code: z.string().optional(),
  })
  .optional()

export const ProviderRoutes = new Hono()
  .get(
    "/",
    describeRoute({
      operationId: "provider.list",
      summary: "List providers",
      responses: {
        200: {
          description: "Provider list payload",
          content: {
            "application/json": { schema: resolver(providerListResponseSchema) },
          },
        },
        ...routeErrors(403),
      },
    }),
    validator("query", directoryQuerySchema),
    piListProviders,
  )
  .get(
    "/auth",
    describeRoute({
      operationId: "provider.auth",
      summary: "List provider auth methods",
      responses: {
        200: {
          description: "Provider auth method payload",
          content: {
            "application/json": { schema: resolver(providerAuthResponseSchema) },
          },
        },
        ...routeErrors(403),
      },
    }),
    validator("query", directoryQuerySchema),
    piProviderAuthMethods,
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
              schema: resolver(oauthAuthorizationResponseSchema),
            },
          },
        },
        ...routeErrors(400, 403),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", ProviderIDParamSchema),
    validator("json", oauthMethodRequestSchema),
    piAuthorizeProviderOAuth,
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
    piCompleteProviderOAuth,
  )
