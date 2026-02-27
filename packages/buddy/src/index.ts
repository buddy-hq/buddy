import "./opencode/env.js"
import { Hono, type Context } from "hono"
import { openAPIRouteHandler } from "hono-openapi"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { setConfigOverlay } from "@buddy/opencode-adapter/config"
import { Config, InvalidError, JsonError } from "./config/config.js"
import { Agent as BuddyAgent } from "./agent/agent.js"
import { CurriculumService } from "./curriculum/curriculum-service.js"
import { COMPATIBILITY_OPENAPI_PATHS } from "./openapi/compatibility-doc.js"
import { ensureCurriculumToolsRegistered } from "./opencode/curriculum-tools.js"
import { assertOpenCodeRuntime, loadOpenCodeApp } from "./opencode/runtime.js"
import { allowedDirectoryRoots, isAllowedDirectory, resolveDirectory } from "./project/directory.js"
import { Instance as BuddyInstance } from "./project/instance.js"
import { Provider } from "./provider/provider.js"
import { CurriculumRoutes } from "./routes/curriculum.js"
import { TeachingRoutes } from "./routes/teaching.js"
import { condenseCurriculum, loadBehavior } from "./session/system-prompt.js"
import CODE_TEACHER_PROMPT from "./session/prompts/code-teacher.txt"
import { TeachingService } from "./teaching/teaching-service.js"
import { ensureTeachingToolsRegistered } from "./teaching/teaching-tools.js"
import { TeachingPromptContextSchema, type TeachingPromptContext } from "./teaching/types.js"

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
  registerCurriculumTools?: boolean
  registerTeachingTools?: boolean
}) {
  const registrations: Promise<void>[] = []

  if (input.registerCurriculumTools === true) {
    registrations.push(
      ensureCurriculumToolsRegistered(input.directory).catch((error) => {
        console.warn("Failed to register Buddy curriculum tools into OpenCode runtime:", error)
      }),
    )
  }

  if (input.registerTeachingTools === true) {
    registrations.push(
      ensureTeachingToolsRegistered(input.directory).catch((error) => {
        console.warn("Failed to register Buddy teaching tools into OpenCode runtime:", error)
      }),
    )
  }

  if (registrations.length > 0) {
    await Promise.all(registrations)
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
    registerCurriculumTools?: boolean | ((body: Record<string, unknown>) => boolean)
    registerTeachingTools?: boolean | ((body: Record<string, unknown>) => boolean)
  },
) {
  const directoryResult = ensureAllowedDirectory(c.req.raw)
  if (!directoryResult.ok) return directoryResult.response

  const method = c.req.method.toUpperCase()
  const sourceURL = new URL(c.req.url)
  const headers = new Headers(c.req.raw.headers)
  let body: BodyInit | undefined
  let registerCurriculumTools = typeof input.registerCurriculumTools === "boolean" ? input.registerCurriculumTools : false
  let registerTeachingTools = typeof input.registerTeachingTools === "boolean" ? input.registerTeachingTools : false

  if (method !== "GET" && method !== "HEAD") {
    if (input.transformJsonBody) {
      const contentType = headers.get("content-type")
      if (isJsonContentType(contentType)) {
        const raw = await c.req.raw.text()
        const parsed = raw.trim().length > 0 ? (JSON.parse(raw) as Record<string, unknown>) : {}
        if (typeof input.registerCurriculumTools === "function") {
          registerCurriculumTools = input.registerCurriculumTools(parsed)
        }
        if (typeof input.registerTeachingTools === "function") {
          registerTeachingTools = input.registerTeachingTools(parsed)
        }
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
    registerCurriculumTools,
    registerTeachingTools,
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

function buildOpenCodeConfigOverlay() {
  return {
    permission: {
      teaching_start_lesson: "deny" as const,
      teaching_checkpoint: "deny" as const,
      teaching_add_file: "deny" as const,
      teaching_set_lesson: "deny" as const,
      teaching_restore_checkpoint: "deny" as const,
    },
    agent: {
      "code-teacher": {
        description: "Interactive code teaching agent for the in-app lesson editor.",
        mode: "primary" as const,
        prompt: CODE_TEACHER_PROMPT.trim(),
        steps: 8,
        permission: {
          question: "allow" as const,
          plan_enter: "allow" as const,
          teaching_start_lesson: "allow" as const,
          teaching_checkpoint: "allow" as const,
          teaching_add_file: "allow" as const,
          teaching_set_lesson: "allow" as const,
          teaching_restore_checkpoint: "allow" as const,
          task: "deny" as const,
          todoread: "deny" as const,
          todowrite: "deny" as const,
        },
      },
    },
  }
}

function isCompletionClaim(value: string) {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return false
  return /^(done|finished|complete|completed|ready|next|go ahead|go on|move on|continue)\b/.test(normalized)
}

function formatSessionMode(input: {
  mode: "chat" | "interactive"
  teachingToolsAvailable: boolean
}) {
  const { mode, teachingToolsAvailable } = input
  return [
    "<session_mode>",
    `Mode: ${mode}`,
    mode === "interactive"
      ? teachingToolsAvailable
        ? "An interactive workspace is active for this session. Teaching workspace tools are now available: teaching_start_lesson, teaching_add_file, teaching_checkpoint, teaching_set_lesson, teaching_restore_checkpoint."
        : "An interactive workspace is active for this session. The editor context is available, but teaching workspace mutation tools are reserved for the code-teacher agent."
      : teachingToolsAvailable
        ? "No interactive workspace is active. Teach through normal chat unless the learner explicitly wants a hands-on editor lesson. If they do, use teaching_start_lesson to create the workspace first, then switch into editor-based teaching."
        : "No interactive workspace is active. Teach through normal chat. If the learner wants a hands-on editor lesson, ask them to switch to the code-teacher agent or start it from the Editor tab.",
    "</session_mode>",
  ].join("\n")
}

function formatTeachingPromptContext(input: TeachingPromptContext & {
  changedSinceCheckpoint?: boolean
  trackedFiles?: string[]
}) {
  const parts = [
    "<teaching_workspace>",
    `Session: ${input.sessionID}`,
    `Lesson file: ${input.lessonFilePath}`,
    `Checkpoint file: ${input.checkpointFilePath}`,
    `Language: ${input.language}`,
    `Revision: ${input.revision}`,
  ]

  if (typeof input.changedSinceCheckpoint === "boolean") {
    parts.push(`Checkpoint status: ${input.changedSinceCheckpoint ? "pending acceptance" : "accepted"}`)
  }

  if (input.trackedFiles && input.trackedFiles.length > 0) {
    parts.push("Tracked files:")
    for (const file of input.trackedFiles) {
      parts.push(`- ${file}`)
    }
  }

  if (
    input.selectionStartLine &&
    input.selectionStartColumn &&
    input.selectionEndLine &&
    input.selectionEndColumn
  ) {
    parts.push(
      `Selection: L${input.selectionStartLine}:C${input.selectionStartColumn}-L${input.selectionEndLine}:C${input.selectionEndColumn}`,
    )
  }

  parts.push(
    "The lesson file is the in-app editor surface. Prefer reading and editing that file directly when guiding the learner.",
  )
  parts.push("</teaching_workspace>")
  return parts.join("\n")
}

function formatTeachingPolicy(input: { completionClaim: boolean; changedSinceCheckpoint?: boolean }) {
  const parts = [
    "<teaching_policy>",
    "The learner must stay on the current exercise until their work has been verified and accepted.",
    "Do not treat a short status message such as 'done' or 'ready' as proof that the exercise is correct.",
    "Before advancing, read the lesson file and verify it satisfies the current exercise requirements.",
    "If a deterministic checker exists for the exercise, use it as the source of truth. Otherwise verify conservatively from the lesson file and do not advance when uncertain.",
    "If the work is incomplete or incorrect, keep the learner on the same lesson, explain the exact gap, and ask for one concrete fix.",
    "Only after the current exercise is verified should you accept it and move forward.",
    "If the lesson needs an additional source file, create it with teaching_add_file before editing it.",
    "When you need to replace the whole lesson scaffold or move to a new exercise, use the teaching_set_lesson tool so the editor file and checkpoint stay synchronized.",
    "Do not replace the entire lesson file with a raw write when teaching_set_lesson is the appropriate tool.",
    "Answer conceptual questions in chat when possible. Do not rewrite the teaching workspace or curriculum unless the learner explicitly wants a new hands-on exercise in the editor.",
    "If the learner asks to switch topics or languages mid-exercise, confirm the switch instead of silently replacing the current exercise.",
  ]

  if (input.changedSinceCheckpoint === true) {
    parts.push("There are unaccepted changes since the last teaching checkpoint. The current exercise has not been accepted yet.")
  }

  if (input.completionClaim) {
    parts.push("The learner's latest message is only a completion claim. It is a request to verify the current exercise, not permission to advance automatically.")
  }

  parts.push("</teaching_policy>")
  return parts.join("\n")
}

async function buildBuddySystemPrompt(input: {
  directory: string
  agentName?: string
  teachingContext?: TeachingPromptContext
  userContent?: string
}) {
  const parts: string[] = []
  const includeBehavior = input.agentName !== "code-teacher"
  const behavior = includeBehavior ? loadBehavior().trim() : ""
  if (behavior) {
    parts.push(behavior)
  }

  const curriculum = await CurriculumService.peek(input.directory).catch(() => undefined)
  if (curriculum?.markdown) {
    const condensed = condenseCurriculum(curriculum.markdown).trim()
    if (condensed) {
      parts.push(["<curriculum>", `Path: ${curriculum.path}`, condensed, "</curriculum>"].join("\n"))
    }
  }

  parts.push(
    formatSessionMode({
      mode: input.teachingContext?.active ? "interactive" : "chat",
      teachingToolsAvailable: input.agentName === "code-teacher",
    }),
  )

  if (input.teachingContext?.active) {
    const checkpointStatus = await TeachingService.status(input.directory, input.teachingContext.sessionID).catch(() => undefined)

    parts.push(
      formatTeachingPromptContext({
        ...input.teachingContext,
        changedSinceCheckpoint: checkpointStatus?.changedSinceLastCheckpoint,
        trackedFiles: checkpointStatus?.trackedFiles,
      }),
    )

    if (input.agentName === "code-teacher") {
      const completionClaim = isCompletionClaim(input.userContent ?? "")
      parts.push(
        formatTeachingPolicy({
          completionClaim,
          changedSinceCheckpoint: checkpointStatus?.changedSinceLastCheckpoint,
        }),
      )
    }
  }

  return parts.join("\n\n").trim()
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
  return `{${entries.map(([key, nested]) => `${JSON.stringify(key)}:${stableSerialize(nested)}`).join(",")}}`
}

const openCodeConfigFingerprint = new Map<string, string>()
const openCodeConfigSyncInFlight = new Map<string, Promise<void>>()

async function readProjectConfig(directory: string) {
  return BuddyInstance.provide({
    directory,
    fn: () => Config.get(),
  })
}

async function syncOpenCodeProjectConfig(directory: string, force = false) {
  const existing = openCodeConfigSyncInFlight.get(directory)
  if (existing) return existing

  const task = (async () => {
    const config = await readProjectConfig(directory)
    const overlay = buildOpenCodeConfigOverlay()
    setConfigOverlay(directory, overlay)
    const nextFingerprint = stableSerialize({
      config,
      overlay,
    })
    const previousFingerprint = openCodeConfigFingerprint.get(directory)
    if (!force && previousFingerprint === nextFingerprint) {
      return
    }

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

    openCodeConfigFingerprint.set(directory, nextFingerprint)
  })().finally(() => {
    openCodeConfigSyncInFlight.delete(directory)
  })

  openCodeConfigSyncInFlight.set(directory, task)
  return task
}

async function resolveOpenCodeProjectID(directory: string) {
  const { Instance: OpenCodeInstance } = await import("@buddy/opencode-adapter/instance")
  return OpenCodeInstance.provide({
    directory,
    fn: () => OpenCodeInstance.project.id,
  })
}

async function isSessionInRequestedProject(directory: string, session: unknown) {
  if (!session || typeof session !== "object") return true
  const payload = session as {
    projectID?: unknown
    directory?: unknown
  }

  const requestedProjectID = await resolveOpenCodeProjectID(directory)

  const sessionProjectID =
    typeof payload.projectID === "string"
      ? payload.projectID
      : typeof payload.directory === "string"
        ? await resolveOpenCodeProjectID(payload.directory)
        : undefined

  if (!sessionProjectID) return true
  return sessionProjectID === requestedProjectID
}

api.route("/curriculum", CurriculumRoutes())
api.route("/teaching", TeachingRoutes({ ensureAllowedDirectory }))

api.get("/health", async (c) => {
  return proxyToOpenCode(c, {
    targetPath: "/global/health",
  })
})

api.get("/event", async (c) => {
  return proxyToOpenCode(c, {
    targetPath: "/global/event",
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
  })
})

api.get("/config/agents", async (c) => {
  const directoryResult = ensureAllowedDirectory(c.req.raw)
  if (!directoryResult.ok) return directoryResult.response

  const agents = await BuddyInstance.provide({
    directory: directoryResult.directory,
    fn: () => BuddyAgent.list(),
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
      const teachingContext = TeachingPromptContextSchema.safeParse(body.teaching).success
        ? TeachingPromptContextSchema.parse(body.teaching)
        : undefined
      const agentName = typeof body.agent === "string" ? body.agent : undefined
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
      const buddySystem = await buildBuddySystemPrompt({
        directory: directoryResult.directory,
        agentName,
        teachingContext,
        userContent: content,
      })
      const mergedSystem = [existingSystem, buddySystem].filter(Boolean).join("\n\n").trim()
      if (mergedSystem) {
        transformed.system = mergedSystem
      }
      if (agentName) {
        transformed.agent = agentName
      }
      delete (transformed as { content?: string }).content
      delete (transformed as { teaching?: unknown }).teaching
      return transformed
    },
    forceBusyAs409: true,
    registerCurriculumTools: true,
    registerTeachingTools(body) {
      return typeof body.agent === "string" && body.agent === "code-teacher"
    },
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

const generatedOpenApiHandler = openAPIRouteHandler(app, {
  documentation: {
    info: {
      title: "Buddy API",
      version: "1.0.0",
      description: "Buddy compatibility API over vendored OpenCode core.",
    },
    openapi: "3.1.1",
  },
})

app.get(
  "/doc",
  async (c, next) => {
    const response = await generatedOpenApiHandler(c, next)
    if (!(response instanceof Response)) return response
    if (!isJsonContentType(response.headers.get("content-type"))) return response

    const generatedDoc = (await response
      .clone()
      .json()
      .catch(() => undefined)) as
      | {
          paths?: Record<string, unknown>
          [key: string]: unknown
        }
      | undefined

    if (!generatedDoc) return response

    return c.json({
      ...generatedDoc,
      paths: {
        ...(generatedDoc.paths ?? {}),
        ...COMPATIBILITY_OPENAPI_PATHS,
      },
    })
  },
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
