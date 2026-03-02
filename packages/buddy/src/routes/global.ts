import { Hono } from "hono"
import { configErrorMessage, isConfigValidationError } from "../config/compatibility.js"
import { Config } from "../config/config.js"
import { AnyObjectSchema, ErrorSchema } from "../openapi/compatibility-schemas.js"
import { compatibilityRoute } from "../openapi/compatibility-route.js"
import { proxyToOpenCode } from "./support.js"

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
        let body: unknown
        try {
          body = await c.req.json()
        } catch {
          return c.json({ error: "Invalid JSON body" }, 400)
        }

        try {
          const parsed = Config.Info.parse(body)
          const config = await Config.updateGlobal(parsed)
          return c.json(config)
        } catch (error) {
          if (isConfigValidationError(error)) {
            return c.json({ error: configErrorMessage(error) }, 400)
          }
          if (error instanceof Error && error.name === "ZodError") {
            return c.json({ error: error.message }, 400)
          }
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
