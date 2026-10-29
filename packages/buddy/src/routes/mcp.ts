import { routeErrorBody } from "../http/route-errors"
import { Hono, type Context } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { execFile } from "node:child_process"
import { setTimeout as delay } from "node:timers/promises"
import type { McpAuthAttempt, McpStatus } from "@buddy/agent-runtime/mcp"
import type { AgentRuntime } from "@buddy/agent-runtime/runtime"
import { mapRouteError } from "../http/route-errors"
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
import { getAgentRuntime } from "../runtime/agent-runtime"

const mcpStatusSchema = z
  .discriminatedUnion("status", [
    z.object({ status: z.literal("connected") }),
    z.object({ status: z.literal("pending") }),
    z.object({ status: z.literal("disabled") }),
    z.object({ status: z.literal("failed"), error: z.string() }),
    z.object({ status: z.literal("needs_auth"), error: z.string() }),
    z.object({ status: z.literal("needs_client_registration"), error: z.string() }),
  ])
  .meta({ id: "McpStatus" })
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
const mcpConfigSchema = z.discriminatedUnion("type", [mcpLocalConfigSchema, mcpRemoteConfigSchema])

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
    return Response.json(routeErrorBody(400, "Invalid JSON body"), { status: 400 })
  }

  return record
}

type McpRuntime = Pick<AgentRuntime, "mcp">

function needsClientRegistration(message: string) {
  return /dynamic client registration|client registration.*not supported|client[_ ]id.*required/iu.test(
    message,
  )
}

function mcpStatus(status: McpStatus) {
  if (
    (status.status === "failed" || status.status === "needs_auth") &&
    needsClientRegistration(status.error)
  ) {
    return {
      status: "needs_client_registration" as const,
      error: "This MCP server requires a pre-registered OAuth client ID.",
    }
  }
  return status
}

function mcpError(error: Error) {
  return mapRouteError(error, { scope: "mcp" })
}

async function openMcpBrowser(url: string) {
  const target = new URL(url)
  if (target.protocol !== "https:" && target.protocol !== "http:")
    throw new Error("Unsupported OAuth URL")
  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "powershell.exe"
        : "xdg-open"
  const args =
    process.platform === "win32"
      ? ["-NoProfile", "-NonInteractive", "-Command", "Start-Process $env:BUDDY_MCP_AUTH_URL"]
      : [url]
  await new Promise<void>((resolve, reject) => {
    execFile(command, args, { env: { ...process.env, BUDDY_MCP_AUTH_URL: url } }, (error) =>
      error ? reject(error) : resolve(),
    )
  })
}

function mcpAttemptKey(directory: string, name: string) {
  return JSON.stringify([directory, name])
}

async function findServer(runtime: McpRuntime, directory: string, name: string) {
  return (await runtime.mcp.servers(directory)).find((server) => server.name === name)
}

export function createMcpRoutes(input: {
  getRuntime: () => Promise<McpRuntime>
  openBrowser: (url: string) => Promise<void>
  saveConfig: (
    directory: string,
    name: string,
    config: z.infer<typeof mcpConfigSchema>,
  ) => Promise<void>
}) {
  const attempts = new Map<string, McpAuthAttempt>()
  const locks = new Map<string, Promise<unknown>>()

  async function list(runtime: McpRuntime, directory: string) {
    const servers = await runtime.mcp.servers(directory)
    return Object.fromEntries(servers.map((server) => [server.name, mcpStatus(server.status)]))
  }

  async function start(runtime: McpRuntime, directory: string, name: string) {
    const attemptKey = mcpAttemptKey(directory, name)
    const previous = attempts.get(attemptKey)
    if (previous) {
      await runtime.mcp.cancelAuth(directory, previous)
      attempts.delete(attemptKey)
    }
    const attempt = await runtime.mcp.startAuth(directory, name)
    attempts.set(attemptKey, attempt)
    return attempt
  }

  async function locked<T>(directory: string, name: string, task: () => Promise<T>) {
    const attemptKey = mcpAttemptKey(directory, name)
    const previous = locks.get(attemptKey) ?? Promise.resolve()
    const current = previous.catch(() => undefined).then(task)
    locks.set(attemptKey, current)
    try {
      return await current
    } finally {
      if (locks.get(attemptKey) === current) locks.delete(attemptKey)
    }
  }

  async function settle(
    runtime: McpRuntime,
    directory: string,
    name: string,
    attempt: McpAuthAttempt,
    signal: AbortSignal,
  ) {
    try {
      let reconnecting = false
      while (Date.now() < attempt.expires) {
        signal.throwIfAborted()
        const progress = await runtime.mcp.authProgress(directory, attempt)
        if (progress.state === "failed")
          return mcpStatus({ status: "failed", error: progress.message })
        if (progress.state === "expired")
          return { status: "failed" as const, error: "MCP authentication expired" }
        if (progress.state === "complete") {
          if (!reconnecting) {
            await runtime.mcp.connect(directory, name)
            reconnecting = true
          }
          const server = await findServer(runtime, directory, name)
          if (server?.status.status !== "pending")
            return server
              ? mcpStatus(server.status)
              : { status: "failed" as const, error: "MCP server was removed" }
        }
        await delay(250, undefined, { signal })
      }
      return { status: "failed" as const, error: "MCP authentication expired" }
    } finally {
      await runtime.mcp.cancelAuth(directory, attempt)
      if (attempts.get(mcpAttemptKey(directory, name)) === attempt)
        attempts.delete(mcpAttemptKey(directory, name))
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
        runRouteTask({
          mapError: mcpError,
          task: async () => {
            const directoryResult = ensureAllowedDirectory(c)
            if (!directoryResult.ok) return directoryResult.response

            const runtime = await input.getRuntime()
            return c.json(await list(runtime, directoryResult.directory))
          },
        }),
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
        runRouteTask({
          mapError: mcpError,
          task: async () => {
            const directoryResult = ensureAllowedDirectory(c)
            if (!directoryResult.ok) return directoryResult.response

            const payload = await readMcpAddPayload(c)
            if (payload instanceof Response) return payload

            const parsedPayload = mcpAddPayloadSchema.safeParse(payload)
            if (!parsedPayload.success) {
              return Response.json(routeErrorBody(400, "Invalid MCP payload"), { status: 400 })
            }

            const runtime = await input.getRuntime()
            await input.saveConfig(
              directoryResult.directory,
              parsedPayload.data.name,
              parsedPayload.data.config,
            )
            return c.json(await list(runtime, directoryResult.directory))
          },
        }),
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
        runRouteTask({
          mapError: mcpError,
          task: async () => {
            const directoryResult = ensureAllowedDirectory(c)
            if (!directoryResult.ok) return directoryResult.response

            const name = c.req.valid("param").name
            const runtime = await input.getRuntime()
            const result = await locked(directoryResult.directory, name, () =>
              start(runtime, directoryResult.directory, name),
            )
            return c.json({ authorizationUrl: result.url, attemptID: result.attemptID })
          },
        }),
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
        runRouteTask({
          mapError: mcpError,
          task: async () => {
            const directoryResult = ensureAllowedDirectory(c)
            if (!directoryResult.ok) return directoryResult.response

            const name = c.req.valid("param").name
            const runtime = await input.getRuntime()
            const payload = c.req.valid("json")
            if (payload.code !== undefined)
              return c.json(
                routeErrorBody(
                  400,
                  "MCP authentication completes in the browser callback; pasted codes are not supported",
                  "McpPastedCodeUnsupported",
                ),
                400,
              )
            const attempt = attempts.get(mcpAttemptKey(directoryResult.directory, name))
            if (
              !attempt ||
              (payload.attemptID !== undefined && payload.attemptID !== attempt.attemptID)
            )
              return c.json(routeErrorBody(404, "MCP authentication attempt not found"), 404)
            return c.json(
              await settle(runtime, directoryResult.directory, name, attempt, c.req.raw.signal),
            )
          },
        }),
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
        runRouteTask({
          mapError: mcpError,
          task: async () => {
            const directoryResult = ensureAllowedDirectory(c)
            if (!directoryResult.ok) return directoryResult.response

            const name = c.req.valid("param").name
            const runtime = await input.getRuntime()
            const result = await locked(directoryResult.directory, name, () =>
              start(runtime, directoryResult.directory, name),
            )
            try {
              await input.openBrowser(result.url)
            } catch (error) {
              await runtime.mcp.cancelAuth(directoryResult.directory, result)
              if (attempts.get(mcpAttemptKey(directoryResult.directory, name)) === result)
                attempts.delete(mcpAttemptKey(directoryResult.directory, name))
              throw error
            }
            return c.json(
              await settle(runtime, directoryResult.directory, name, result, c.req.raw.signal),
            )
          },
        }),
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
        runRouteTask({
          mapError: mcpError,
          task: async () => {
            const directoryResult = ensureAllowedDirectory(c)
            if (!directoryResult.ok) return directoryResult.response

            const name = c.req.valid("param").name
            const runtime = await input.getRuntime()
            return locked(directoryResult.directory, name, async () => {
              const attempt = attempts.get(mcpAttemptKey(directoryResult.directory, name))
              if (attempt) {
                await runtime.mcp.cancelAuth(directoryResult.directory, attempt)
                attempts.delete(mcpAttemptKey(directoryResult.directory, name))
              }
              await runtime.mcp.removeCredentials(directoryResult.directory, name)
              return c.json({ success: true })
            })
          },
        }),
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
        runRouteTask({
          mapError: mcpError,
          task: async () => {
            const directoryResult = ensureAllowedDirectory(c)
            if (!directoryResult.ok) return directoryResult.response

            const name = c.req.valid("param").name
            const runtime = await input.getRuntime()
            await runtime.mcp.connect(directoryResult.directory, name)
            return c.json(true)
          },
        }),
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
        runRouteTask({
          mapError: mcpError,
          task: async () => {
            const directoryResult = ensureAllowedDirectory(c)
            if (!directoryResult.ok) return directoryResult.response

            const name = c.req.valid("param").name
            const runtime = await input.getRuntime()
            await runtime.mcp.disconnect(directoryResult.directory, name)
            return c.json(true)
          },
        }),
    )
}

export const McpRoutes = new Hono().use("*", createConfigSyncMiddleware("MCP request")).route(
  "/",
  createMcpRoutes({
    getRuntime: getAgentRuntime,
    openBrowser: openMcpBrowser,
    saveConfig: async (directory, name, config) => {
      await putProjectMcpConfig({ directory, name, payload: config })
    },
  }),
)
