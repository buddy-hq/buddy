import { AnyObjectSchema, ErrorSchema } from "../../openapi/compatibility-schemas.js"
import { compatibilityRoute } from "../../openapi/compatibility-route.js"

const getGlobalConfigRoute = compatibilityRoute({
  operationId: "global.config.get",
  summary: "Get global config",
  responses: {
    200: {
      description: "Global configuration payload",
      content: {
        "application/json": { schema: AnyObjectSchema },
      },
    },
    400: {
      description: "Invalid config",
      content: {
        "application/json": { schema: ErrorSchema },
      },
    },
  },
})

const patchGlobalConfigRoute = compatibilityRoute({
  operationId: "global.config.patch",
  summary: "Patch global config",
  requestBody: {
    required: true,
    content: {
      "application/json": { schema: AnyObjectSchema },
    },
  },
  responses: {
    200: {
      description: "Updated global configuration",
      content: {
        "application/json": { schema: AnyObjectSchema },
      },
    },
    400: {
      description: "Invalid config",
      content: {
        "application/json": { schema: ErrorSchema },
      },
    },
  },
})

const disposeGlobalRoute = compatibilityRoute({
  operationId: "global.dispose",
  summary: "Dispose all global runtime instances",
  responses: {
    200: {
      description: "Disposal response",
      content: {
        "application/json": { schema: AnyObjectSchema },
      },
    },
  },
})

export {
  disposeGlobalRoute,
  getGlobalConfigRoute,
  patchGlobalConfigRoute,
}
