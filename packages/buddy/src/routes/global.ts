import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import { configRouteValidationResponse } from "@buddy/backend/config/orchestration"
import { configErrorMessage, isConfigValidationError } from "@buddy/backend/config/runtime"
import { Config } from "@buddy/backend/config"
import { booleanJsonResponse, routeErrors } from "../http"
import { proxyToOpenCode } from "../http"

export const GlobalRoutes = (): Hono =>
  new Hono()
    .get(
      "/config",
      describeRoute({
        operationId: "global.config.get",
        summary: "Get global config",
        responses: {
          200: {
            description: "Global configuration payload",
            content: {
              "application/json": { schema: resolver(Config.Info) },
            },
          },
          ...routeErrors(400),
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
      describeRoute({
        operationId: "global.config.patch",
        summary: "Update global config",
        responses: {
          200: {
            description: "Updated global configuration",
            content: {
              "application/json": { schema: resolver(Config.Info) },
            },
          },
          ...routeErrors(400),
        },
      }),
      validator("json", Config.Info),
      async (c) => {
        try {
          const config = await Config.updateGlobal(c.req.valid("json"))
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
      describeRoute({
        operationId: "global.dispose",
        summary: "Dispose all global runtime instances",
        responses: {
          200: {
            description: "Disposal response",
            content: {
              "application/json": booleanJsonResponse,
            },
          },
        },
      }),
      async (c) =>
        proxyToOpenCode(c, {
          targetPath: "/global/dispose",
        }),
    )
