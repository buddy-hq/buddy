import { Hono } from "hono"
import type { AgentRuntime } from "@buddy/agent-runtime/runtime"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { providerAuthAnswersSchema } from "@buddy/agent-runtime/providers"
import { ensureGlobalBootstrapWorkspaceDirectory } from "../project/directory"
import { routeErrors, ProviderIDParamSchema, runRouteTask, directoryQuerySchema, resolveOptionalDirectoryRequestContext } from "../http"
import { syncOpenCodeProjectConfig } from "../config/runtime/opencode-sync"
import { mapConfigRouteError } from "../config/orchestration/route-errors"
import { getAgentRuntime } from "../runtime/agent-runtime"

const authSchema = z.object({ type: z.literal("api"), key: z.string().trim().min(1), answers: providerAuthAnswersSchema.optional() }).meta({ ref: "Auth" })

const credentialSetResponseSchema = resolver(z.boolean())

function runProviderRoute(task: () => Promise<Response>) {
  return runRouteTask({ task, mapError: mapConfigRouteError })
}

export function createAuthRoutes(input: { getRuntime: () => Promise<Pick<AgentRuntime, "providers">> } = { getRuntime: getAgentRuntime }) {
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
          const runtime = await input.getRuntime()
          await syncOpenCodeProjectConfig(directory)
          const body = c.req.valid("json")
          await runtime.providers.setKey(directory, providerID, body.key, body.answers)
          return c.json(true)
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
          const runtime = await input.getRuntime()
          await syncOpenCodeProjectConfig(directory)
          await runtime.providers.removeCredentials(directory, providerID)
          return c.json(true)
        }),
    )

}

export const AuthRoutes = createAuthRoutes()
