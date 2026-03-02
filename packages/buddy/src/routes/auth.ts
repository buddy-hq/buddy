import { Hono } from "hono"
import {
  AnyObjectSchema,
  BooleanSchema,
  DirectoryHeader,
  DirectoryQuery,
  ErrorSchema,
  ProviderIDPath,
} from "../openapi/compatibility-doc.js"
import { compatibilityRoute } from "../openapi/route-doc.js"
import { proxyToOpenCode } from "./support.js"

const directoryParameters = [DirectoryHeader, DirectoryQuery]

export const AuthRoutes = (): Hono =>
  new Hono()
    .put(
      "/:providerID",
      compatibilityRoute({
        operationId: "auth.set",
        summary: "Set provider credentials",
        parameters: [ProviderIDPath, ...directoryParameters],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: AnyObjectSchema },
          },
        },
        responses: {
          200: {
            description: "Credentials stored",
            content: {
              "application/json": { schema: BooleanSchema },
            },
          },
          400: {
            description: "Invalid provider credentials",
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
          targetPath: `/auth/${encodeURIComponent(providerID)}`,
        })
      },
    )
    .delete(
      "/:providerID",
      compatibilityRoute({
        operationId: "auth.remove",
        summary: "Remove provider credentials",
        parameters: [ProviderIDPath, ...directoryParameters],
        responses: {
          200: {
            description: "Credentials removed",
            content: {
              "application/json": { schema: BooleanSchema },
            },
          },
          400: {
            description: "Invalid provider identifier",
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
          targetPath: `/auth/${encodeURIComponent(providerID)}`,
        })
      },
    )
