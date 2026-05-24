import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { Auth as OpenCodeAuth } from "@buddy/opencode-adapter/auth"
import { toOpenApiSchema } from "../http/effect-schema"
import {
  routeErrors,
  directoryQuerySchema,
  ProviderIDParamSchema,
  resolveOptionalDirectoryRequestContext,
  respondWithSdkResult,
  runSdkRoute,
  openCodeDirectoryParams,
} from "../http"
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
    validator("query", directoryQuerySchema),
    validator("param", ProviderIDParamSchema),
    validator("json", toOpenApiSchema(OpenCodeAuth.Info)),
    async (c) =>
      runSdkRoute(c, async () => {
        const directoryResult = resolveOptionalDirectoryRequestContext(c)
        if (!directoryResult.ok) return directoryResult.response

        const providerID = c.req.valid("param").providerID
        const client = await getOpenCodeClient(directoryResult.context.directory)
        const result = await client.auth.set({
          providerID,
          auth: c.req.valid("json"),
          ...openCodeDirectoryParams(directoryResult.context.directory),
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
    validator("query", directoryQuerySchema),
    validator("param", ProviderIDParamSchema),
    async (c) =>
      runSdkRoute(c, async () => {
        const directoryResult = resolveOptionalDirectoryRequestContext(c)
        if (!directoryResult.ok) return directoryResult.response

        const providerID = c.req.valid("param").providerID
        const client = await getOpenCodeClient(directoryResult.context.directory)
        const result = await client.auth.remove({
          providerID,
          ...openCodeDirectoryParams(directoryResult.context.directory),
        })
        return respondWithSdkResult(c, result)
      }),
  )
