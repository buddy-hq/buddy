import { Hono } from "hono"
import type { OpenCodeHost } from "@buddy/opencode-adapter/host"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { listProviderCatalog, providerListSchema } from "@buddy/opencode-adapter/gateway/provider"
import { listProviderAuth, startProviderOAuth, completeProviderOAuth, cancelProviderOAuth, providerAuthSchema, providerAuthorizationSchema, providerOAuthStartSchema, providerOAuthAttemptSchema, providerErrorResponse } from "@buddy/opencode-adapter/gateway/integration"
import {
  routeErrors,
  directoryQuerySchema,
  ProviderIDParamSchema,
  resolveOptionalDirectoryRequestContext,
  runRouteTask,
} from "../http"
import { syncNotebookRuntimeConfig } from "../config/runtime/opencode-sync"
import { mapConfigRouteError } from "../config/orchestration/route-errors"
import { getOpenCodeClient } from "../opencode-runtime/client"
import {
  createOpenAICodexAccountClient,
  openAIAccountIdentityResponseSchema,
  openAIModelAvailabilityResponseSchema,
  openAIUsageResponseSchema,
} from "../opencode-runtime/plugins/openai-codex-account"
import { ensureGlobalBootstrapWorkspaceDirectory } from "../project/directory"

function resolveBootstrapDirectory(
  c: Parameters<typeof resolveOptionalDirectoryRequestContext>[0],
) {
  const directoryResult = resolveOptionalDirectoryRequestContext(c)
  if (!directoryResult.ok) return directoryResult

  return {
    ok: true as const,
    directory: directoryResult.context.directory ?? ensureGlobalBootstrapWorkspaceDirectory(),
  }
}

function runProviderRoute(task: () => Promise<Response>) {
  return runRouteTask({ task, mapError: (error) => mapConfigRouteError(error) ?? providerErrorResponse(error) })
}

export function createProviderRoutes(input: { getClient: () => Promise<OpenCodeHost> } = { getClient: getOpenCodeClient }) {
  async function getSyncedClient(directory: string) {
    const client = await input.getClient()
    await syncNotebookRuntimeConfig(client, directory)
    return client
  }
  return new Hono()
    .get(
      "/",
      describeRoute({
        operationId: "provider.list",
        summary: "List providers",
        responses: {
          200: {
            description: "OpenCode provider list payload",
            content: {
              "application/json": { schema: resolver(providerListSchema) },
            },
          },
          ...routeErrors(400, 403),
        },
      }),
      validator("query", directoryQuerySchema),
      async (c) =>
        runProviderRoute(async () => {
          const directoryResult = resolveBootstrapDirectory(c)
          if (!directoryResult.ok) return directoryResult.response

          const client = await getSyncedClient(directoryResult.directory)
          return c.json(await listProviderCatalog(client, directoryResult.directory))
        }),
    )
    .get(
      "/auth",
      describeRoute({
        operationId: "provider.auth",
        summary: "List provider auth methods",
        responses: {
          200: {
            description: "OpenCode provider auth method payload",
            content: {
              "application/json": { schema: resolver(providerAuthSchema) },
            },
          },
          ...routeErrors(400, 403),
        },
      }),
      validator("query", directoryQuerySchema),
      async (c) =>
        runProviderRoute(async () => {
          const directoryResult = resolveBootstrapDirectory(c)
          if (!directoryResult.ok) return directoryResult.response

          const client = await getSyncedClient(directoryResult.directory)
          return c.json(await listProviderAuth(client, directoryResult.directory))
        }),
    )
    .get(
      "/openai/account",
      describeRoute({
        operationId: "provider.openai.account.get",
        summary: "Read the signed-in ChatGPT account email",
        responses: {
          200: {
            description: "Current ChatGPT account identity",
            content: {
              "application/json": { schema: resolver(openAIAccountIdentityResponseSchema) },
            },
          },
          ...routeErrors(400, 403),
        },
      }),
      validator("query", directoryQuerySchema),
      async (c) =>
        runProviderRoute(async () => {
          const directoryResult = resolveBootstrapDirectory(c)
          if (!directoryResult.ok) return directoryResult.response

          const client = await getSyncedClient(directoryResult.directory)
          const openAICodexAccountService = createOpenAICodexAccountClient(async () => client)
          return c.json(await openAICodexAccountService.readIdentity(directoryResult.directory))
        }),
    )
    .get(
      "/openai/models",
      describeRoute({
        operationId: "provider.openai.modelAvailability.get",
        summary: "Read ChatGPT OAuth model availability",
        responses: {
          200: {
            description: "Current account-scoped ChatGPT model availability",
            content: {
              "application/json": { schema: resolver(openAIModelAvailabilityResponseSchema) },
            },
          },
          ...routeErrors(400, 403),
        },
      }),
      validator("query", directoryQuerySchema),
      async (c) =>
        runProviderRoute(async () => {
          const directoryResult = resolveBootstrapDirectory(c)
          if (!directoryResult.ok) return directoryResult.response

          const client = await getSyncedClient(directoryResult.directory)
          const openAICodexAccountService = createOpenAICodexAccountClient(async () => client)
          return c.json(
            await openAICodexAccountService.readModelAvailability(directoryResult.directory),
          )
        }),
    )
    .post(
      "/openai/models/refresh",
      describeRoute({
        operationId: "provider.openai.modelAvailability.refresh",
        summary: "Refresh ChatGPT OAuth model availability",
        responses: {
          200: {
            description: "Refreshed account-scoped ChatGPT model availability",
            content: {
              "application/json": { schema: resolver(openAIModelAvailabilityResponseSchema) },
            },
          },
          ...routeErrors(400, 403),
        },
      }),
      validator("query", directoryQuerySchema),
      async (c) =>
        runProviderRoute(async () => {
          const directoryResult = resolveBootstrapDirectory(c)
          if (!directoryResult.ok) return directoryResult.response

          const client = await getSyncedClient(directoryResult.directory)
          const openAICodexAccountService = createOpenAICodexAccountClient(async () => client)
          return c.json(
            await openAICodexAccountService.refreshModelAvailability(directoryResult.directory),
          )
        }),
    )
    .get(
      "/openai/usage",
      describeRoute({
        operationId: "provider.openai.usage.get",
        summary: "Read ChatGPT OAuth usage limits",
        responses: {
          200: {
            description: "Current ChatGPT plan and usage limits",
            content: {
              "application/json": { schema: resolver(openAIUsageResponseSchema) },
            },
          },
          ...routeErrors(400, 403),
        },
      }),
      validator("query", directoryQuerySchema),
      async (c) =>
        runProviderRoute(async () => {
          const directoryResult = resolveBootstrapDirectory(c)
          if (!directoryResult.ok) return directoryResult.response

          const client = await getSyncedClient(directoryResult.directory)
          const openAICodexAccountService = createOpenAICodexAccountClient(async () => client)
          return c.json(await openAICodexAccountService.readUsage(directoryResult.directory))
        }),
    )
    .post(
      "/openai/usage/refresh",
      describeRoute({
        operationId: "provider.openai.usage.refresh",
        summary: "Refresh ChatGPT OAuth usage limits",
        responses: {
          200: {
            description: "Refreshed ChatGPT plan and usage limits",
            content: {
              "application/json": { schema: resolver(openAIUsageResponseSchema) },
            },
          },
          ...routeErrors(400, 403),
        },
      }),
      validator("query", directoryQuerySchema),
      async (c) =>
        runProviderRoute(async () => {
          const directoryResult = resolveBootstrapDirectory(c)
          if (!directoryResult.ok) return directoryResult.response

          const client = await getSyncedClient(directoryResult.directory)
          const openAICodexAccountService = createOpenAICodexAccountClient(async () => client)
          return c.json(await openAICodexAccountService.readUsage(directoryResult.directory, true))
        }),
    )
    .post(
      "/:providerID/oauth/authorize",
      describeRoute({
        operationId: "provider.oauth.authorize",
        summary: "Start provider OAuth",
        responses: {
          200: {
            description: "Provider auth initiation payload",
            content: {
              "application/json": {
                schema: resolver(
                  providerAuthorizationSchema,
                ),
              },
            },
          },
          ...routeErrors(400, 403, 404),
        },
      }),
      validator("query", directoryQuerySchema),
      validator("param", ProviderIDParamSchema),
      validator("json", providerOAuthStartSchema),
      async (c) =>
        runProviderRoute(async () => {
          const directoryResult = resolveBootstrapDirectory(c)
          if (!directoryResult.ok) return directoryResult.response

          const providerID = c.req.valid("param").providerID
          const body = c.req.valid("json")
          const client = await getSyncedClient(directoryResult.directory)
          return c.json(await startProviderOAuth(client, directoryResult.directory, providerID, body))
        }),
    )
    .post(
      "/:providerID/oauth/callback",
      describeRoute({
        operationId: "provider.oauth.callback",
        summary: "Complete provider OAuth callback",
        responses: {
          200: {
            description: "Provider auth callback payload",
            content: {
              "application/json": { schema: resolver(z.boolean()) },
            },
          },
          ...routeErrors(400, 403, 404),
        },
      }),
      validator("query", directoryQuerySchema),
      validator("param", ProviderIDParamSchema),
      validator("json", providerOAuthAttemptSchema),
      async (c) =>
        runProviderRoute(async () => {
          const directoryResult = resolveBootstrapDirectory(c)
          if (!directoryResult.ok) return directoryResult.response

          const providerID = c.req.valid("param").providerID
          const body = c.req.valid("json")
          const client = await getSyncedClient(directoryResult.directory)
          return c.json(await completeProviderOAuth(client, directoryResult.directory, providerID, body, c.req.raw.signal))
        }),
    )
    .post(
      "/:providerID/oauth/cancel",
      describeRoute({
        operationId: "provider.oauth.cancel",
        summary: "Cancel provider OAuth",
        responses: {
          200: {
            description: "Provider auth cancellation payload",
            content: {
              "application/json": { schema: resolver(z.boolean()) },
            },
          },
          ...routeErrors(400, 403),
        },
      }),
      validator("query", directoryQuerySchema),
      validator("param", ProviderIDParamSchema),
      validator("json", providerOAuthAttemptSchema),
      async (c) =>
        runProviderRoute(async () => {
          const directoryResult = resolveBootstrapDirectory(c)
          if (!directoryResult.ok) return directoryResult.response

          const providerID = c.req.valid("param").providerID
          const client = await getSyncedClient(directoryResult.directory)
          return c.json(await cancelProviderOAuth(client, directoryResult.directory, providerID, c.req.valid("json").attemptID))
        }),
    )

}

export const ProviderRoutes = createProviderRoutes()
