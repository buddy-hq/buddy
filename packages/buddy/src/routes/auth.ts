import { Hono } from "hono"
import type { OpenCodeHost } from "@buddy/opencode-adapter/host"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { setProviderKey, removeProviderCredentials, providerAuthAnswersSchema, providerErrorResponse } from "@buddy/opencode-adapter/gateway/integration"
import { ensureGlobalBootstrapWorkspaceDirectory } from "../project/directory"
import { routeErrors, ProviderIDParamSchema, runRouteTask, directoryQuerySchema, resolveOptionalDirectoryRequestContext } from "../http"
import { syncNotebookRuntimeConfig } from "../config/runtime/opencode-sync"
import { mapConfigRouteError } from "../config/orchestration/route-errors"
import { getOpenCodeClient } from "../opencode-runtime/client"

const authSchema = z.object({ type: z.literal("api"), key: z.string().trim().min(1), answers: providerAuthAnswersSchema.optional() }).meta({ ref: "Auth" })

const credentialSetResponseSchema = resolver(z.boolean())

function runProviderRoute(task: () => Promise<Response>) {
  return runRouteTask({ task, mapError: (error) => mapConfigRouteError(error) ?? providerErrorResponse(error) })
}

export function createAuthRoutes(input: { getClient: () => Promise<OpenCodeHost> } = { getClient: getOpenCodeClient }) {
  return new Hono()
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
          ...routeErrors(400, 403, 404),
        },
      }),
      validator("query", directoryQuerySchema),
      validator("param", ProviderIDParamSchema),
      validator("json", authSchema),
      async (c) =>
        runProviderRoute(async () => {
          const directoryResult = resolveOptionalDirectoryRequestContext(c)
          if (!directoryResult.ok) return directoryResult.response
          const directory = directoryResult.context.directory ?? ensureGlobalBootstrapWorkspaceDirectory()
          const providerID = c.req.valid("param").providerID
          const client = await input.getClient()
          await syncNotebookRuntimeConfig(client, directory)
          const body = c.req.valid("json")
          return c.json(await setProviderKey(client, directory, providerID, body.key, body.answers))
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
          ...routeErrors(400, 403, 404),
        },
      }),
      validator("query", directoryQuerySchema),
      validator("param", ProviderIDParamSchema),
      async (c) =>
        runProviderRoute(async () => {
          const directoryResult = resolveOptionalDirectoryRequestContext(c)
          if (!directoryResult.ok) return directoryResult.response
          const directory = directoryResult.context.directory ?? ensureGlobalBootstrapWorkspaceDirectory()
          const providerID = c.req.valid("param").providerID
          const client = await input.getClient()
          await syncNotebookRuntimeConfig(client, directory)
          return c.json(await removeProviderCredentials(client, directory, providerID))
        }),
    )

}

export const AuthRoutes = createAuthRoutes()
