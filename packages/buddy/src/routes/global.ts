import { Hono } from "hono"
import { configErrorMessage, isConfigValidationError } from "../config/compatibility.js"
import { Config } from "../config/config.js"
import { AnyObjectSchema, ErrorSchema } from "../openapi/compatibility-schemas.js"
import { compatibilityRoute } from "../openapi/compatibility-route.js"
import { configRouteValidationResponse } from "./handlers/config.js"
import { withJsonBody } from "./shared/route-helpers.js"
import { proxyToOpenCode } from "./support/proxy.js"

export const GlobalRoutes = (): Hono =>
  new Hono()
    .get(
      "/config",
      compatibilityRoute({
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
      }),
      async (c) => {
        try {
          const config = await Config.getGlobal()
          return c.json(config)
        } catch (error) {
          if (isConfigValidationError(error)) {
            return c.json({ error: configErrorMessage(error) }, 400)
          }
          throw error
        }
      },
    )
    .patch(
      "/config",
      compatibilityRoute({
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
      }),
      async (c) => {
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
      },
    )
    .post(
      "/dispose",
      compatibilityRoute({
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
      }),
      async (c) => {
        return proxyToOpenCode(c, {
          targetPath: "/global/dispose",
        })
      },
    )
