import "./opencode/env.js"
import { Hono, type Context } from "hono"
import { openAPIRouteHandler } from "hono-openapi"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { Config, InvalidError, JsonError } from "./config/config.js"
import { CurriculumService } from "./curriculum/curriculum-service.js"
import { ensureCurriculumToolsRegistered } from "./opencode/curriculum-tools.js"
import { assertOpenCodeRuntime, loadOpenCodeApp } from "./opencode/runtime.js"
import { allowedDirectoryRoots, isAllowedDirectory, resolveDirectory } from "./project/directory.js"
import { Instance as BuddyInstance } from "./project/instance.js"
import { Project } from "./project/project.js"
import { Provider } from "./provider/provider.js"
import { CurriculumRoutes } from "./routes/curriculum.js"
import { condenseCurriculum, loadBehavior } from "./session/system-prompt.js"

const app = new Hono()
const api = new Hono()
const directoryRoots = allowedDirectoryRoots()

function requestDirectory(request: Request) {
  const url = new URL(request.url)
  const rawDirectory =
    url.searchParams.get("directory") ??
    request.headers.get("x-buddy-directory") ??
    request.headers.get("x-opencode-directory") ??
    process.cwd()

  return resolveDirectory(rawDirectory)
}

function ensureAllowedDirectory(request: Request) {
  const directory = requestDirectory(request)
  if (!isAllowedDirectory(directory, directoryRoots)) {
    return {
      ok: false as const,
      response: Response.json({ error: "Directory is outside allowed roots" }, { status: 403 }),
    }
  }

  return {
    ok: true as const,
    directory,
  }
}

function isJsonContentType(value: string | null) {
  if (!value) return false
  return value.toLowerCase().includes("application/json")
}

function extractErrorMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined

  const data = payload as {
    error?: unknown
    message?: unknown
    data?: {
      message?: unknown
      name?: unknown
    }
    name?: unknown
  }

  if (typeof data.error === "string") return data.error
  if (typeof data.message === "string") return data.message
  if (typeof data.data?.message === "string") return data.data.message
  if (typeof data.name === "string" && typeof data.data?.name === "string") return `${data.name}: ${data.data.name}`
  return undefined
}

async function normalizeErrorResponse(response: Response, forceBusyAs409 = false) {
  if (response.status < 400 || !isJsonContentType(response.headers.get("content-type"))) {
    return response
  }

  const payload = (await response
    .clone()
    .json()
    .catch(() => undefined)) as unknown
  const message = extractErrorMessage(payload)
  if (!message) return response

  const busy = /busy/i.test(message)
  if (forceBusyAs409 && busy) {
    return Response.json({ error: "Session is already running" }, { status: 409 })
  }

  return Response.json({ error: message }, { status: response.status })
}

async function fetchOpenCode(input: {
  directory: string
  method: string
  path: string
  query?: string
  headers?: Headers
  body?: BodyInit
  registerTools?: boolean
}) {
  if (input.registerTools === true) {
    await ensureCurriculumToolsRegistered(input.directory).catch((error) => {
      console.warn("Failed to register Buddy curriculum tools into OpenCode runtime:", error)
    })
  }

  const openCodeApp = await loadOpenCodeApp()
  const url = new URL(`http://opencode.local${input.path}`)
  if (input.query) {
    url.search = input.query
  }

  const headers = new Headers(input.headers)
  headers.delete("x-buddy-directory")
  headers.set("x-opencode-directory", input.directory)
  headers.delete("host")
  headers.delete("content-length")

  return openCodeApp.fetch(
    new Request(url.toString(), {
      method: input.method,
      headers,
      body: input.body,
    }),
  )
}

async function proxyToOpenCode(
  c: Context,
  input: {
    targetPath: string
    transformJsonBody?: (body: Record<string, unknown>) => Record<string, unknown> | Promise<Record<string, unknown>>
    forceBusyAs409?: boolean
    registerTools?: boolean
  },
) {
  const directoryResult = ensureAllowedDirectory(c.req.raw)
  if (!directoryResult.ok) return directoryResult.response

  const method = c.req.method.toUpperCase()
  const sourceURL = new URL(c.req.url)
  const headers = new Headers(c.req.raw.headers)
  let body: BodyInit | undefined

  if (method !== "GET" && method !== "HEAD") {
    if (input.transformJsonBody) {
      const contentType = headers.get("content-type")
      if (isJsonContentType(contentType)) {
        const raw = await c.req.raw.text()
        const parsed = raw.trim().length > 0 ? (JSON.parse(raw) as Record<string, unknown>) : {}
        const transformed = await input.transformJsonBody(parsed)
        body = JSON.stringify(transformed)
      } else {
        body = await c.req.raw.arrayBuffer()
      }
    } else {
      const buffer = await c.req.raw.arrayBuffer()
      body = buffer.byteLength > 0 ? buffer : undefined
    }
  }

  const response = await fetchOpenCode({
    directory: directoryResult.directory,
    method,
    path: input.targetPath,
    query: sourceURL.search,
    headers,
    body,
    registerTools: input.registerTools,
  })

  return normalizeErrorResponse(response, input.forceBusyAs409)
}

async function loadSessionStatus(directory: string, request: Request) {
  const response = await fetchOpenCode({
    directory,
    method: "GET",
    path: "/session/status",
    headers: new Headers(request.headers),
  })

  if (!response.ok) return undefined
  return (await response.json().catch(() => undefined)) as
    | Record<
        string,
        {
          type?: "busy" | "idle" | "retry"
        }
      >
    | undefined
}

function isConfigValidationError(error: unknown) {
  return error instanceof JsonError || error instanceof InvalidError
}

function configErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message
  return "Invalid config"
}

async function buildBuddySystemPrompt(directory: string) {
  const parts: string[] = []
  const behavior = loadBehavior().trim()
  if (behavior) {
    parts.push(behavior)
  }

  const curriculum = await CurriculumService.peek(directory).catch(() => undefined)
  if (curriculum?.markdown) {
    const condensed = condenseCurriculum(curriculum.markdown).trim()
    if (condensed) {
      parts.push(["<curriculum>", `Path: ${curriculum.path}`, condensed, "</curriculum>"].join("\n"))
    }
  }

  return parts.join("\n\n").trim()
}

async function syncOpenCodeProjectConfig(directory: string) {
  // Dispose the OpenCode instance so it re-bootstraps fresh on next request.
  // We do NOT call PATCH /config on the vendored OpenCode because that triggers
  // Config.update which writes config.json to the project root (config pollution).
  const { Instance: OpenCodeInstance } = await import("@buddy/opencode-adapter/instance")
  await OpenCodeInstance.provide({
    directory,
    fn: async () => {
      await OpenCodeInstance.dispose()
    },
  })
}

async function isSessionInRequestedProject(directory: string, session: unknown) {
  if (!session || typeof session !== "object") return true
  const payload = session as {
    projectID?: unknown
    directory?: unknown
  }

  const requested = await Project.fromDirectory(directory)
  const requestedProjectID = requested.project.id

  const sessionProjectID =
    typeof payload.projectID === "string"
      ? payload.projectID
      : typeof payload.directory === "string"
        ? (await Project.fromDirectory(payload.directory)).project.id
        : undefined

  if (!sessionProjectID) return true
  return sessionProjectID === requestedProjectID
}

api.route("/curriculum", CurriculumRoutes())

api.get("/health", async (c) => {
  return proxyToOpenCode(c, {
    targetPath: "/global/health",
    registerTools: false,
  })
})

api.get("/event", async (c) => {
  return proxyToOpenCode(c, {
    targetPath: "/global/event",
    registerTools: false,
  })
})

api.get("/global/config", async (c) => {
  try {
    const config = await Config.getGlobal()
    return c.json(config)
  } catch (error) {
    if (isConfigValidationError(error)) {
      return c.json({ error: configErrorMessage(error) }, 400)
    }
    throw error
  }
})

api.patch("/global/config", async (c) => {
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
})

api.post("/global/dispose", async (c) => {
  return proxyToOpenCode(c, {
    targetPath: "/global/dispose",
    registerTools: false,
  })
})

api.get("/config/agents", async (c) => {
  const directoryResult = ensureAllowedDirectory(c.req.raw)
  if (!directoryResult.ok) return directoryResult.response

  const { Agent: OpenCodeAgent } = await import("@buddy/opencode-adapter/agent")
  const { Instance: OpenCodeInstance } = await import("@buddy/opencode-adapter/instance")

  const agents = await OpenCodeInstance.provide({
    directory: directoryResult.directory,
    fn: () => OpenCodeAgent.list(),
  })

  return c.json(
    agents.map((agent: { name: string; description?: string; mode: string; hidden?: boolean }) => ({
      name: agent.name,
      description: agent.description,
      mode: agent.mode,
      hidden: agent.hidden,
    })),
  )
})

api.get("/config", async (c) => {
  const directoryResult = ensureAllowedDirectory(c.req.raw)
  if (!directoryResult.ok) return directoryResult.response

  try {
    const config = await BuddyInstance.provide({
      directory: directoryResult.directory,
      fn: () => Config.get(),
    })
    return c.json(config)
  } catch (error) {
    if (isConfigValidationError(error)) {
      return c.json({ error: configErrorMessage(error) }, 400)
    }
    throw error
  }
})

api.patch("/config", async (c) => {
  const directoryResult = ensureAllowedDirectory(c.req.raw)
  if (!directoryResult.ok) return directoryResult.response

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400)
  }

  try {
    const parsed = Config.Info.parse(body)
    await BuddyInstance.provide({
      directory: directoryResult.directory,
      fn: () => Config.update(parsed),
    })
    await syncOpenCodeProjectConfig(directoryResult.directory)
    const config = await BuddyInstance.provide({
      directory: directoryResult.directory,
      fn: () => Config.get(),
    })
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
})

api.get("/config/providers", async (c) => {
  const directoryResult = ensureAllowedDirectory(c.req.raw)
  if (!directoryResult.ok) return directoryResult.response

  const payload = await BuddyInstance.provide({
    directory: directoryResult.directory,
    fn: async () => {
      const [providers, defaults] = await Promise.all([Provider.list(), Provider.defaults()])
      return {
        providers,
        default: defaults,
      }
    },
  })

  return c.json(payload)
})

api.get("/permission", async (c) => {
  return proxyToOpenCode(c, {
    targetPath: "/permission",
  })
})

api.post("/permission/:requestID/reply", async (c) => {
  const requestID = c.req.param("requestID")
  return proxyToOpenCode(c, {
    targetPath: `/permission/${encodeURIComponent(requestID)}/reply`,
  })
})

api.get("/session", async (c) => {
  return proxyToOpenCode(c, {
    targetPath: "/session",
  })
})

api.post("/session", async (c) => {
  return proxyToOpenCode(c, {
    targetPath: "/session",
  })
})

api.get("/session/:sessionID", async (c) => {
  const directoryResult = ensureAllowedDirectory(c.req.raw)
  if (!directoryResult.ok) return directoryResult.response

  const sessionID = c.req.param("sessionID")
  const response = await fetchOpenCode({
    directory: directoryResult.directory,
    method: "GET",
    path: `/session/${encodeURIComponent(sessionID)}`,
    query: new URL(c.req.url).search,
    headers: new Headers(c.req.raw.headers),
  })

  const normalized = await normalizeErrorResponse(response)
  if (!normalized.ok) return normalized
  if (!isJsonContentType(normalized.headers.get("content-type"))) return normalized

  const session = (await normalized
    .clone()
    .json()
    .catch(() => undefined)) as unknown
  const matchesProject = await isSessionInRequestedProject(directoryResult.directory, session)
  if (!matchesProject) {
    return c.json({ error: "Session not found" }, 404)
  }

  return normalized
})

api.patch("/session/:sessionID", async (c) => {
  const sessionID = c.req.param("sessionID")
  return proxyToOpenCode(c, {
    targetPath: `/session/${encodeURIComponent(sessionID)}`,
  })
})

api.get("/session/:sessionID/message", async (c) => {
  const sessionID = c.req.param("sessionID")
  return proxyToOpenCode(c, {
    targetPath: `/session/${encodeURIComponent(sessionID)}/message`,
  })
})

api.post("/session/:sessionID/message", async (c) => {
  const directoryResult = ensureAllowedDirectory(c.req.raw)
  if (!directoryResult.ok) return directoryResult.response

  const sessionID = c.req.param("sessionID")
  await syncOpenCodeProjectConfig(directoryResult.directory).catch((error) => {
    throw new Error(`Failed to sync config before prompt: ${String(error instanceof Error ? error.message : error)}`)
  })

  return proxyToOpenCode(c, {
    targetPath: `/session/${encodeURIComponent(sessionID)}/message`,
    async transformJsonBody(body) {
      const parts = Array.isArray(body.parts) ? [...body.parts] : []
      const content = typeof body.content === "string" ? body.content : ""
      if (content.trim().length > 0) {
        parts.unshift({
          type: "text",
          text: content,
        })
      }

      if (parts.length === 0) {
        throw new Error("content or parts must be provided")
      }

      const transformed = {
        ...body,
        parts,
      } as Record<string, unknown>
      const existingSystem = typeof body.system === "string" ? body.system.trim() : ""
      const buddySystem = await buildBuddySystemPrompt(directoryResult.directory)
      const mergedSystem = [existingSystem, buddySystem].filter(Boolean).join("\n\n").trim()
      if (mergedSystem) {
        transformed.system = mergedSystem
      }
      delete (transformed as { content?: string }).content
      return transformed
    },
    forceBusyAs409: true,
    registerTools: true,
  }).catch((error) => {
    const message = String(error instanceof Error ? error.message : error)
    if (message.includes("content or parts must be provided")) {
      return c.json({ error: "content or parts must be provided" }, 400)
    }
    throw error
  })
})

api.post("/session/:sessionID/abort", async (c) => {
  const directoryResult = ensureAllowedDirectory(c.req.raw)
  if (!directoryResult.ok) return directoryResult.response

  const sessionID = c.req.param("sessionID")
  const statuses = await loadSessionStatus(directoryResult.directory, c.req.raw)
  const current = statuses?.[sessionID]
  if (!current || current.type === "idle") {
    return c.json(false)
  }

  const response = await proxyToOpenCode(c, {
    targetPath: `/session/${encodeURIComponent(sessionID)}/abort`,
  })

  if (!response.ok) return response
  return c.json(true)
})

app.use(logger())
app.use(cors({ origin: "*" }))
app.route("/api", api)

app.get(
  "/doc",
  openAPIRouteHandler(app, {
    documentation: {
      info: {
        title: "Buddy API",
        version: "1.0.0",
        description: "Buddy compatibility API over vendored OpenCode core.",
      },
      openapi: "3.1.1",
    },
  }),
)

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000

if (import.meta.main) {
  try {
    await assertOpenCodeRuntime(process.cwd())
  } catch (error) {
    console.error("Failed to initialize vendored OpenCode runtime:", error)
    process.exit(1)
  }

  console.log(`Server starting on http://localhost:${port}`)
  console.log(`API docs available at http://localhost:${port}/doc`)
  Bun.serve({
    port,
    idleTimeout: 120,
    fetch: app.fetch,
  })
}

export { app }
