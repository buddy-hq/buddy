import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { Auth as OpenCodeAuth } from "@buddy/opencode-adapter/auth"
import { toOpenApiSchema } from "../http/effect-schema"
import { routeErrors, ProviderIDParamSchema, respondWithSdkResult, runSdkRoute } from "../http"
import { getOpenCodeClient } from "../opencode-runtime/client"

const credentialSetResponseSchema = resolver(z.boolean())

export const AuthRoutes = new Hono()
  .put(
    "/:providerID",
    describeRoute({
      operationId: "auth.set",
      summary: "Set provider credentials",
      responses: {
        200: {
          description: "Credentials stored",
          content: {
            "application/json": { schema: credentialSetResponseSchema },
          },
        },
        ...routeErrors(400, 403),
      },
    }),
    validator("param", ProviderIDParamSchema),
    validator("json", toOpenApiSchema(OpenCodeAuth.Info)),
    async (c) =>
      runSdkRoute(c, async () => {
        const providerID = c.req.valid("param").providerID
        const client = await getOpenCodeClient()
        const result = await client.auth.set({
          providerID,
          auth: c.req.valid("json"),
        })
        return respondWithSdkResult(c, result)
      }),
  )
  .delete(
    "/:providerID",
    describeRoute({
      operationId: "auth.remove",
      summary: "Remove provider credentials",
      responses: {
        200: {
          description: "Credentials removed",
          content: {
            "application/json": { schema: credentialSetResponseSchema },
          },
        },
        ...routeErrors(400, 403),
      },
    }),
    validator("param", ProviderIDParamSchema),
    async (c) =>
      runSdkRoute(c, async () => {
        const providerID = c.req.valid("param").providerID
        const client = await getOpenCodeClient()
        const result = await client.auth.remove({
          providerID,
        })
        return respondWithSdkResult(c, result)
      }),
  )
