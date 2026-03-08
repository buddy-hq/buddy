import {
  AnyObjectSchema,
  ErrorSchema,
  ProviderIDPath,
} from "../../openapi/compatibility-schemas.js"
import type { ProxyEndpointSpec } from "../../http/proxy-routes.js"
import { directoryForbiddenResponse, directoryParameters } from "../../http/openapi.js"

const providerProxySpecs: ProxyEndpointSpec[] = [
  {
    method: "get",
    path: "/",
    route: {
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
          ...directoryForbiddenResponse,
        },
      },
    },
    targetPath: "/provider",
  },
  {
    method: "get",
    path: "/auth",
    route: {
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
          ...directoryForbiddenResponse,
        },
      },
    },
    targetPath: "/provider/auth",
  },
  {
    method: "post",
    path: "/:providerID/oauth/authorize",
    route: {
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
          ...directoryForbiddenResponse,
        },
      },
    },
    targetPath: (c) => `/provider/${encodeURIComponent(c.req.param("providerID"))}/oauth/authorize`,
  },
  {
    method: "post",
    path: "/:providerID/oauth/callback",
    route: {
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
          ...directoryForbiddenResponse,
        },
      },
    },
    targetPath: (c) => `/provider/${encodeURIComponent(c.req.param("providerID"))}/oauth/callback`,
  },
]

export { providerProxySpecs }
