import { Hono } from "hono"
import {
  AnyObjectSchema,
  BooleanSchema,
  ErrorSchema,
  ProviderIDPath,
} from "../openapi/compatibility-schemas.js"
import type { ProxyEndpointSpec } from "./shared/proxy-routes.js"
import { registerProxyEndpoints } from "./shared/proxy-routes.js"
import { directoryForbiddenResponse, directoryParameters } from "./shared/openapi.js"

const authProxySpecs: ProxyEndpointSpec[] = [
  {
    method: "put",
    path: "/:providerID",
    route: {
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
          ...directoryForbiddenResponse,
        },
      },
    },
    targetPath: (c) => `/auth/${encodeURIComponent(c.req.param("providerID"))}`,
  },
  {
    method: "delete",
    path: "/:providerID",
    route: {
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
          ...directoryForbiddenResponse,
        },
      },
    },
    targetPath: (c) => `/auth/${encodeURIComponent(c.req.param("providerID"))}`,
  },
]

export const AuthRoutes = (): Hono => {
  const app = new Hono()
  return registerProxyEndpoints(app, authProxySpecs)
}
