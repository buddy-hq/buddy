import { Hono, type Context } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { execFile } from "node:child_process"
import { setTimeout as delay } from "node:timers/promises"
import type { OpenCodeHost, OpenCodeTypes } from "@buddy/opencode-adapter/host"
import { putProjectMcpConfig } from "../config/orchestration/project-config-service"
import {
  booleanJsonResponse,
  createConfigSyncMiddleware,
  routeErrors,
  directoryQuerySchema,
  McpNameParamSchema,
  ensureAllowedDirectory,
  isJsonContentType,
  parseJsonText,
  runRouteTask,
} from "../http"
import { parseTJsonObject } from "../http/parse"
import { getOpenCodeClient } from "../opencode-runtime/client"

const mcpStatusSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("connected") }),
  z.object({ status: z.literal("pending") }),
  z.object({ status: z.literal("disabled") }),
  z.object({ status: z.literal("failed"), error: z.string() }),
  z.object({ status: z.literal("needs_auth"), error: z.string() }),
  z.object({ status: z.literal("needs_client_registration"), error: z.string() }),
]).meta({ id: "McpStatus" })
const mcpStatusMapSchema = z.record(z.string(), mcpStatusSchema)

const mcpAuthCallbackSchema = z.object({
  code: z.string().optional(),
  attemptID: z.string().optional(),
})

const mcpAuthStartSchema = z.object({
  authorizationUrl: z.string(),
  attemptID: z.string(),
})

const mcpAuthRemovedSchema = z.object({
  success: z.literal(true),
})

const mcpStringRecordSchema = z.record(z.string(), z.string())
const mcpOAuthSchema = z.union([
  z.literal(false),
  z.object({
    clientId: z.string().optional(),
    clientSecret: z.string().optional(),
    scope: z.string().optional(),
    callbackPort: z.number().int().min(1).max(65535).optional(),
    redirectUri: z.string().optional(),
  }),
])
const mcpLocalConfigSchema = z.object({
  type: z.literal("local"),
  command: z.array(z.string()),
  cwd: z.string().optional(),
  environment: mcpStringRecordSchema.optional(),
  enabled: z.boolean().optional(),
  timeout: z.number().int().positive().optional(),
})
const mcpRemoteConfigSchema = z.object({
  type: z.literal("remote"),
  url: z.string(),
  enabled: z.boolean().optional(),
  headers: mcpStringRecordSchema.optional(),
  oauth: mcpOAuthSchema.optional(),
  timeout: z.number().int().positive().optional(),
})
const mcpConfigSchema = z.discriminatedUnion("type", [
  mcpLocalConfigSchema,
  mcpRemoteConfigSchema,
])

const mcpAddPayloadSchema = z.object({
  name: z.string().min(1),
  config: mcpConfigSchema,
})

async function readMcpAddPayload(c: Context) {
  const contentType = c.req.header("content-type")
  if (!isJsonContentType(contentType)) {
    return {}
  }

  const raw = await c.req.raw.text()
  if (raw.trim().length === 0) {
    return {}
  }

  const parsed = parseJsonText(raw)
  const record = parsed.ok ? parseTJsonObject(parsed.value) : undefined
  if (record === undefined) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  return record
}

type McpClient = Pick<OpenCodeHost, "mcp" | "integration" | "credential">
type PendingAttempt = { integrationID: string; attemptID: string; expires: number }

function needsClientRegistration(message: string) {
  return /dynamic client registration|client registration.*not supported|client[_ ]id.*required/iu.test(message)
}

function mcpStatus(status: OpenCodeTypes.McpServer["status"]) {
  if ((status.status === "failed" || status.status === "needs_auth") && needsClientRegistration(status.error)) {
    return { status: "needs_client_registration" as const, error: "This MCP server requires a pre-registered OAuth client ID." }
  }
  return status
}

function mcpError(error: Error) {
  if (needsClientRegistration(error.message)) return Response.json({ error: "This MCP server requires a pre-registered OAuth client ID.", code: "McpClientRegistrationRequired" }, { status: 400 })
  const status = error.name === "McpServerNotFoundError" || error.name === "IntegrationNotFoundError" || error.name === "IntegrationAttemptNotFoundError" ? 404
    : error.name === "InvalidRequestError" ? 400 : 500
  return Response.json({ error: error.message || "MCP request failed" }, { status })
}

async function openMcpBrowser(url: string) {
  const target = new URL(url)
  if (target.protocol !== "https:" && target.protocol !== "http:") throw new Error("Unsupported OAuth URL")
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "powershell.exe" : "xdg-open"
  const args = process.platform === "win32" ? ["-NoProfile", "-NonInteractive", "-Command", "Start-Process $env:BUDDY_MCP_AUTH_URL"] : [url]
  await new Promise<void>((resolve, reject) => {
    execFile(command, args, { env: { ...process.env, BUDDY_MCP_AUTH_URL: url } }, (error) => error ? reject(error) : resolve())
  })
}

function mcpAttemptKey(directory: string, name: string) {
  return JSON.stringify([directory, name])
}

async function findServer(client: McpClient, directory: string, name: string) {
  return (await client.mcp.list({ location: { directory } })).data.find((server) => server.name === name)
}

export function createMcpRoutes(input: {
  getClient: () => Promise<McpClient>
  openBrowser: (url: string) => Promise<void>
  saveConfig: (directory: string, name: string, config: z.infer<typeof mcpConfigSchema>) => Promise<void>
}) {
  const attempts = new Map<string, PendingAttempt>()
  const locks = new Map<string, Promise<unknown>>()

  async function list(client: McpClient, directory: string) {
    const result = await client.mcp.list({ location: { directory } })
    return Object.fromEntries(result.data.map((server) => [server.name, mcpStatus(server.status)]))
  }

  async function start(client: McpClient, directory: string, name: string) {
    const attemptKey = mcpAttemptKey(directory, name)
    const previous = attempts.get(attemptKey)
    if (previous) {
      await client.integration.oauth.cancel({ location: { directory }, integrationID: previous.integrationID, attemptID: previous.attemptID })
      attempts.delete(attemptKey)
    }
    const server = await findServer(client, directory, name)
    if (!server?.integrationID) return undefined
    const result = await client.integration.oauth.connect({ location: { directory }, integrationID: server.integrationID, methodID: server.integrationID })
    const attempt = { integrationID: server.integrationID, attemptID: result.data.attemptID, expires: result.data.time.expires }
    attempts.set(attemptKey, attempt)
    return { info: result.data, attempt }
  }

  async function locked<T>(directory: string, name: string, task: () => Promise<T>) {
    const attemptKey = mcpAttemptKey(directory, name)
    const previous = locks.get(attemptKey) ?? Promise.resolve()
    const current = previous.catch(() => undefined).then(task)
    locks.set(attemptKey, current)
    try { return await current } finally { if (locks.get(attemptKey) === current) locks.delete(attemptKey) }
  }

  async function settle(client: McpClient, directory: string, name: string, attempt: PendingAttempt, signal: AbortSignal) {
    try {
      let reconnecting = false
      while (Date.now() < attempt.expires) {
        signal.throwIfAborted()
        const result = await client.integration.oauth.status({ location: { directory }, integrationID: attempt.integrationID, attemptID: attempt.attemptID })
        if (result.data.status === "failed") return mcpStatus({ status: "failed", error: result.data.message })
        if (result.data.status === "expired") return { status: "failed" as const, error: "MCP authentication expired" }
        if (result.data.status === "complete") {
          if (!reconnecting) {
            await client.mcp.connect({ location: { directory }, server: name })
            reconnecting = true
          }
          const server = await findServer(client, directory, name)
          if (server?.status.status !== "pending") return server ? mcpStatus(server.status) : { status: "failed" as const, error: "MCP server was removed" }
        }
        await delay(250, undefined, { signal })
      }
      return { status: "failed" as const, error: "MCP authentication expired" }
    } finally {
      await client.integration.oauth.cancel({ location: { directory }, integrationID: attempt.integrationID, attemptID: attempt.attemptID })
      if (attempts.get(mcpAttemptKey(directory, name)) === attempt) attempts.delete(mcpAttemptKey(directory, name))
    }
  }

  return new Hono()
    .get(
      "/",
      describeRoute({
        operationId: "mcp.status",
        summary: "List configured MCP servers",
        responses: {
          200: {
            description: "Configured MCP servers",
            content: {
              "application/json": { schema: resolver(mcpStatusMapSchema) },
            },
          },
          ...routeErrors(403),
        },
      }),
      validator("query", directoryQuerySchema),
      async (c) =>
        runRouteTask({ mapError: mcpError, task: async () => {
          const directoryResult = ensureAllowedDirectory(c)
          if (!directoryResult.ok) return directoryResult.response

          const client = await input.getClient()
          return c.json(await list(client, directoryResult.directory))
        }}),
    )
    .post(
      "/",
      describeRoute({
        operationId: "mcp.add",
        summary: "Add or update an MCP server",
        responses: {
          200: {
            description: "Updated MCP status",
            content: {
              "application/json": { schema: resolver(mcpStatusMapSchema) },
            },
          },
          ...routeErrors(400, 403),
        },
      }),
      validator("query", directoryQuerySchema),
      async (c) =>
        runRouteTask({ mapError: mcpError, task: async () => {
          const directoryResult = ensureAllowedDirectory(c)
          if (!directoryResult.ok) return directoryResult.response

          const payload = await readMcpAddPayload(c)
          if (payload instanceof Response) return payload

          const parsedPayload = mcpAddPayloadSchema.safeParse(payload)
          if (!parsedPayload.success) {
            return Response.json({ error: "Invalid MCP payload" }, { status: 400 })
          }

          const client = await input.getClient()
          await input.saveConfig(directoryResult.directory, parsedPayload.data.name, parsedPayload.data.config)
          return c.json(await list(client, directoryResult.directory))
        }}),
    )
    .post(
      "/:name/auth",
      describeRoute({
        operationId: "mcp.auth.start",
        summary: "Start MCP auth",
        responses: {
          200: {
            description: "MCP auth initiation payload",
            content: {
              "application/json": { schema: resolver(mcpAuthStartSchema) },
            },
          },
          ...routeErrors(400, 403, 404),
        },
      }),
      validator("query", directoryQuerySchema),
      validator("param", McpNameParamSchema),
      async (c) =>
        runRouteTask({ mapError: mcpError, task: async () => {
          const directoryResult = ensureAllowedDirectory(c)
          if (!directoryResult.ok) return directoryResult.response

          const name = c.req.valid("param").name
          const client = await input.getClient()
          const result = await locked(directoryResult.directory, name, () => start(client, directoryResult.directory, name))
          if (!result) return c.json({ error: "MCP server has no OAuth integration" }, 404)
          return c.json({ authorizationUrl: result.info.url, attemptID: result.info.attemptID })
        }}),
    )
    .post(
      "/:name/auth/callback",
      describeRoute({
        operationId: "mcp.auth.callback",
        summary: "Wait for MCP browser authentication",
        responses: {
          200: {
            description: "MCP auth callback payload",
            content: {
              "application/json": { schema: resolver(mcpStatusSchema) },
            },
          },
          ...routeErrors(400, 403, 404),
        },
      }),
      validator("query", directoryQuerySchema),
      validator("param", McpNameParamSchema),
      validator("json", mcpAuthCallbackSchema),
      async (c) =>
        runRouteTask({ mapError: mcpError, task: async () => {
          const directoryResult = ensureAllowedDirectory(c)
          if (!directoryResult.ok) return directoryResult.response

          const name = c.req.valid("param").name
          const client = await input.getClient()
          const payload = c.req.valid("json")
          if (payload.code !== undefined) return c.json({ error: "MCP authentication completes in the browser callback; pasted codes are not supported", code: "McpPastedCodeUnsupported" }, 400)
          const attempt = attempts.get(mcpAttemptKey(directoryResult.directory, name))
          if (!attempt || (payload.attemptID !== undefined && payload.attemptID !== attempt.attemptID)) return c.json({ error: "MCP authentication attempt not found" }, 404)
          return c.json(await settle(client, directoryResult.directory, name, attempt, c.req.raw.signal))
        }}),
    )
    .post(
      "/:name/auth/authenticate",
      describeRoute({
        operationId: "mcp.auth.authenticate",
        summary: "Complete MCP auth authentication",
        responses: {
          200: {
            description: "MCP auth authentication payload",
            content: {
              "application/json": { schema: resolver(mcpStatusSchema) },
            },
          },
          ...routeErrors(400, 403, 404),
        },
      }),
      validator("query", directoryQuerySchema),
      validator("param", McpNameParamSchema),
      async (c) =>
        runRouteTask({ mapError: mcpError, task: async () => {
          const directoryResult = ensureAllowedDirectory(c)
          if (!directoryResult.ok) return directoryResult.response

          const name = c.req.valid("param").name
          const client = await input.getClient()
          const result = await locked(directoryResult.directory, name, () => start(client, directoryResult.directory, name))
          if (!result) return c.json({ error: "MCP server has no OAuth integration" }, 404)
          try {
            await input.openBrowser(result.info.url)
          } catch (error) {
            await client.integration.oauth.cancel({ location: { directory: directoryResult.directory }, integrationID: result.attempt.integrationID, attemptID: result.attempt.attemptID })
            if (attempts.get(mcpAttemptKey(directoryResult.directory, name)) === result.attempt) attempts.delete(mcpAttemptKey(directoryResult.directory, name))
            throw error
          }
          return c.json(await settle(client, directoryResult.directory, name, result.attempt, c.req.raw.signal))
        }}),
    )
    .delete(
      "/:name/auth",
      describeRoute({
        operationId: "mcp.auth.remove",
        summary: "Remove MCP auth configuration",
        responses: {
          200: {
            description: "MCP auth removed",
            content: {
              "application/json": { schema: resolver(mcpAuthRemovedSchema) },
            },
          },
          ...routeErrors(400, 403, 404),
        },
      }),
      validator("query", directoryQuerySchema),
      validator("param", McpNameParamSchema),
      async (c) =>
        runRouteTask({ mapError: mcpError, task: async () => {
          const directoryResult = ensureAllowedDirectory(c)
          if (!directoryResult.ok) return directoryResult.response

          const name = c.req.valid("param").name
          const client = await input.getClient()
          return locked(directoryResult.directory, name, async () => {
            const attempt = attempts.get(mcpAttemptKey(directoryResult.directory, name))
            if (attempt) {
              await client.integration.oauth.cancel({ location: { directory: directoryResult.directory }, integrationID: attempt.integrationID, attemptID: attempt.attemptID })
              attempts.delete(mcpAttemptKey(directoryResult.directory, name))
            }
            const server = await findServer(client, directoryResult.directory, name)
            if (!server?.integrationID) return c.json({ error: "MCP server has no OAuth integration" }, 404)
            const integration = await client.integration.get({ location: { directory: directoryResult.directory }, integrationID: server.integrationID })
            for (const connection of integration.data.connections) {
              if (connection.type === "credential") await client.credential.remove({ credentialID: connection.id })
            }
            return c.json({ success: true })
          })
        }}),
    )
    .post(
      "/:name/connect",
      describeRoute({
        operationId: "mcp.connect",
        summary: "Connect an MCP server",
        responses: {
          200: {
            description: "MCP connection result",
            content: {
              "application/json": booleanJsonResponse,
            },
          },
          ...routeErrors(400, 403),
        },
      }),
      validator("query", directoryQuerySchema),
      validator("param", McpNameParamSchema),
      async (c) =>
        runRouteTask({ mapError: mcpError, task: async () => {
          const directoryResult = ensureAllowedDirectory(c)
          if (!directoryResult.ok) return directoryResult.response

          const name = c.req.valid("param").name
          const client = await input.getClient()
          await client.mcp.connect({ server: name, location: { directory: directoryResult.directory } })
          return c.json(true)
        }}),
    )
    .post(
      "/:name/disconnect",
      describeRoute({
        operationId: "mcp.disconnect",
        summary: "Disconnect an MCP server",
        responses: {
          200: {
            description: "MCP disconnection result",
            content: {
              "application/json": booleanJsonResponse,
            },
          },
          ...routeErrors(400, 403),
        },
      }),
      validator("query", directoryQuerySchema),
      validator("param", McpNameParamSchema),
      async (c) =>
        runRouteTask({ mapError: mcpError, task: async () => {
          const directoryResult = ensureAllowedDirectory(c)
          if (!directoryResult.ok) return directoryResult.response

          const name = c.req.valid("param").name
          const client = await input.getClient()
          await client.mcp.disconnect({ server: name, location: { directory: directoryResult.directory } })
          return c.json(true)
        }}),
    )
}

export const McpRoutes = new Hono().use("*", createConfigSyncMiddleware("MCP request")).route("/", createMcpRoutes({
  getClient: getOpenCodeClient,
  openBrowser: openMcpBrowser,
  saveConfig: async (directory, name, config) => { await putProjectMcpConfig({ directory, name, payload: config }) },
}))
