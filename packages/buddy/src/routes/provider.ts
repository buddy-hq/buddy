import { Hono } from "hono"
import {
  AnyObjectSchema,
  DirectoryHeader,
  DirectoryQuery,
  ErrorSchema,
  ProviderIDPath,
} from "../openapi/compatibility-doc.js"
import { compatibilityRoute } from "../openapi/route-doc.js"
import { proxyToOpenCode } from "./support.js"

const directoryParameters = [DirectoryHeader, DirectoryQuery]

export const ProviderRoutes = (): Hono =>
  new Hono()
    .get(
      "/",
      compatibilityRoute({
        operationId: "provider.list",
        summary: "List providers",
        parameters: directoryParameters,
        responses: {
          200: {
            description: "OpenCode provider list payload",
            content: {
              "application/json": { schema: AnyObjectSchema },
            },
          },
          403: {
            description: "Directory is outside allowed roots",
            content: {
              "application/json": { schema: ErrorSchema },
            },
          },
        },
      }),
      async (c) => {
        return proxyToOpenCode(c, {
          targetPath: "/provider",
        })
      },
    )
    .get(
      "/auth",
      compatibilityRoute({
        operationId: "provider.auth",
        summary: "List provider auth methods",
        parameters: directoryParameters,
        responses: {
          200: {
            description: "OpenCode provider auth method payload",
            content: {
              "application/json": { schema: AnyObjectSchema },
            },
          },
          403: {
            description: "Directory is outside allowed roots",
            content: {
              "application/json": { schema: ErrorSchema },
            },
          },
        },
      }),
      async (c) => {
        return proxyToOpenCode(c, {
          targetPath: "/provider/auth",
        })
      },
    )
    .post(
      "/:providerID/oauth/authorize",
      compatibilityRoute({
        operationId: "provider.oauth.authorize",
        summary: "Start provider OAuth",
        parameters: [ProviderIDPath, ...directoryParameters],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: AnyObjectSchema },
          },
        },
        responses: {
          200: {
            description: "Provider auth initiation payload",
            content: {
              "application/json": { schema: AnyObjectSchema },
            },
          },
          400: {
            description: "Invalid provider auth request",
            content: {
              "application/json": { schema: ErrorSchema },
            },
          },
          403: {
            description: "Directory is outside allowed roots",
            content: {
              "application/json": { schema: ErrorSchema },
            },
          },
        },
      }),
      async (c) => {
        const providerID = c.req.param("providerID")
        return proxyToOpenCode(c, {
          targetPath: `/provider/${encodeURIComponent(providerID)}/oauth/authorize`,
        })
      },
    )
    .post(
      "/:providerID/oauth/callback",
      compatibilityRoute({
        operationId: "provider.oauth.callback",
        summary: "Complete provider OAuth callback",
        parameters: [ProviderIDPath, ...directoryParameters],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: AnyObjectSchema },
          },
        },
        responses: {
          200: {
            description: "Provider auth callback payload",
            content: {
              "application/json": { schema: AnyObjectSchema },
            },
          },
          400: {
            description: "Invalid provider auth callback",
            content: {
              "application/json": { schema: ErrorSchema },
            },
          },
          403: {
            description: "Directory is outside allowed roots",
            content: {
              "application/json": { schema: ErrorSchema },
            },
          },
        },
      }),
      async (c) => {
        const providerID = c.req.param("providerID")
        return proxyToOpenCode(c, {
          targetPath: `/provider/${encodeURIComponent(providerID)}/oauth/callback`,
        })
      },
    )
