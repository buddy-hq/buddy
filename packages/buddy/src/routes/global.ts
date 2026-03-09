import type { Context } from "hono"
import { Hono } from "hono"
import { AnyObjectSchema, ErrorSchema } from "../openapi/compatibility-schemas.js"
import { compatibilityRoute } from "../openapi/compatibility-route.js"
import { withJsonBody } from "../http/route-helpers.js"
import { proxyToOpenCode } from "../http/proxy.js"
import { configErrorMessage, isConfigValidationError } from "../config/compatibility.js"
import { Config } from "../config/config.js"
import { configRouteValidationResponse } from "../config/orchestration/config-operations.js"

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

async function getGlobalConfigHandler(c: Context): Promise<Response> {
  try {
    const config = await Config.getGlobal()
    return c.json(config)
  } catch (error) {
    if (isConfigValidationError(error)) {
      return c.json({ error: configErrorMessage(error) }, 400)
    }
    throw error
  }
}

async function patchGlobalConfigHandler(c: Context): Promise<Response> {
  const bodyResult = await withJsonBody(c.req.raw)
  if (!bodyResult.ok) return bodyResult.response

  try {
    const parsed = Config.Info.parse(bodyResult.value)
    const config = await Config.updateGlobal(parsed)
    return c.json(config)
  } catch (error) {
    if (isConfigValidationError(error)) {
      return c.json({ error: configErrorMessage(error) }, 400)
    }
    const validationResponse = configRouteValidationResponse(error)
    if (validationResponse) return validationResponse
    throw error
  }
}

async function disposeGlobalHandler(c: Context): Promise<Response> {
  return proxyToOpenCode(c, {
    targetPath: "/global/dispose",
  })
}

export const GlobalRoutes = (): Hono =>
  new Hono()
    .get("/config", getGlobalConfigRoute, getGlobalConfigHandler)
    .patch("/config", patchGlobalConfigRoute, patchGlobalConfigHandler)
    .post("/dispose", disposeGlobalRoute, disposeGlobalHandler)
