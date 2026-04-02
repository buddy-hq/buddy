import "./opencode-runtime/env.js"
import path from "node:path"
import { Hono } from "hono"
import { openAPIRouteHandler } from "hono-openapi"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { AgentsMdRoutes } from "./routes"
import { AuthRoutes } from "./routes"
import { CompatibilityRoutes } from "./routes"
import { ConfigRoutes } from "./routes"
import { E2ERoutes } from "./routes"
import { FigureRoutes } from "./routes"
import { FreeformFigureRoutes } from "./routes"
import { LearnerRoutes } from "./routes"
import { MermaidArtifactRoutes } from "./routes"
import { runSafetySweep } from "./learning/learner-model"
import { GlobalRoutes } from "./routes"
import { McpRoutes } from "./routes"
import { LocalRuntimeRoutes } from "./routes"
import { OpenProjectsRoutes } from "./routes"
import { PermissionRoutes } from "./routes"
import { ProjectRoutes } from "./routes"
import { ProviderRoutes } from "./routes"
import { ResourceRoutes } from "./routes"
import { SessionRoutes } from "./routes"
import { SkillsRoutes } from "./routes"
import { TeachingRoutes } from "./routes"

const OPTION_PRINT_LOGS = "--print-logs"
const OPTION_LOG_LEVEL = "--log-level"
const OPTION_PORT = "--port"
const OPTION_HOSTNAME = "--hostname"
const COMMAND_SERVE = "serve"
const DEFAULT_SERVER_PORT = 3000
const DEFAULT_SERVER_HOSTNAME = "127.0.0.1"
const PERIODIC_SAFETY_SWEEP_INTERVAL_MS = 5 * 60 * 1000
const SERVER_PORT_ENV = "PORT"
const SIDECAR_EXECUTABLE_NAMES = new Set(["buddy-backend", "buddy-backend.exe"])

type ServerBootstrapConfig = {
  hostname: string
  port: number
}

let activeServer: ReturnType<typeof Bun.serve> | undefined

function describeFatalError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? `${error.name}: ${error.message}`
  }

  return String(error)
}

process.on("unhandledRejection", (error) => {
  console.error("Unhandled sidecar rejection", describeFatalError(error))
})

process.on("uncaughtException", (error) => {
  console.error("Uncaught sidecar exception", describeFatalError(error))
})

function matchesBasicAuth(value: string | undefined, username: string, password: string): boolean {
  if (!value?.startsWith("Basic ")) return false

  const encoded = value.slice("Basic ".length).trim()
  let decoded = ""

  try {
    decoded = Buffer.from(encoded, "base64").toString("utf8")
  } catch {
    return false
  }

  return decoded === `${username}:${password}`
}

const app = new Hono()
const api = new Hono()

api.use("*", async (c, next) => {
  const username = process.env.BUDDY_SERVER_USERNAME
  const password = process.env.BUDDY_SERVER_PASSWORD

  if (!username || !password) {
    return next()
  }

  const authorization = c.req.header("authorization")
  if (matchesBasicAuth(authorization, username, password)) {
    return next()
  }

  c.header("www-authenticate", 'Basic realm="Buddy"')
  return c.json({ error: "Unauthorized" }, 401)
})

api.route("/figures", FigureRoutes)
api.route("/freeform-figures", FreeformFigureRoutes)
api.route("/mermaid-artifacts", MermaidArtifactRoutes)
api.route("/learner", LearnerRoutes)
api.route("/teaching", TeachingRoutes)
api.route("/agents-md", AgentsMdRoutes)
api.route("/", CompatibilityRoutes)
api.route("/open-projects", OpenProjectsRoutes)
api.route("/project", ProjectRoutes)
api.route("/resource", ResourceRoutes)
api.route("/global", GlobalRoutes)
api.route("/local-runtimes", LocalRuntimeRoutes)
api.route("/provider", ProviderRoutes)
api.route("/auth", AuthRoutes)
api.route("/mcp", McpRoutes)
api.route("/config", ConfigRoutes)
api.route("/permission", PermissionRoutes)
api.route("/session", SessionRoutes)
api.route("/skills", SkillsRoutes)
if (process.env.BUDDY_E2E_MODE === "1") {
  api.route("/e2e", E2ERoutes)
}

app.use(logger())
app.use(cors({ origin: "*" }))
app.get("/api/healthz", (c) => c.json({ healthy: true }))
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

app.get("/doc", generatedOpenApiHandler)

function readPortFromEnv() {
  const value = process.env[SERVER_PORT_ENV]
  if (!value) return DEFAULT_SERVER_PORT
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return DEFAULT_SERVER_PORT
  return parsed
}

function parseServeCommand(args: string[]): ServerBootstrapConfig {
  let hostname = DEFAULT_SERVER_HOSTNAME
  let port = readPortFromEnv()

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (!arg) continue

    if (arg === OPTION_HOSTNAME) {
      const next = args[index + 1]
      if (!next) continue
      hostname = next
      index += 1
      continue
    }

    if (arg === OPTION_PORT) {
      const next = args[index + 1]
      if (!next) continue
      const parsed = Number.parseInt(next, 10)
      if (Number.isFinite(parsed)) {
        port = parsed
      }
      index += 1
      continue
    }
  }

  return {
    hostname,
    port,
  }
}

function parseServerBootstrapConfig(argv: string[]): ServerBootstrapConfig {
  const args = [...argv]

  while (args.length > 0 && args[0]?.startsWith("-")) {
    const option = args.shift()
    if (!option) break

    if (option === OPTION_PRINT_LOGS) continue
    if (option === OPTION_LOG_LEVEL) {
      args.shift()
      continue
    }

    args.unshift(option)
    break
  }

  if (args[0] === COMMAND_SERVE) {
    return parseServeCommand(args.slice(1))
  }

  return {
    hostname: DEFAULT_SERVER_HOSTNAME,
    port: readPortFromEnv(),
  }
}

function startServer(config: ServerBootstrapConfig) {
  process.env[SERVER_PORT_ENV] = String(config.port)
  console.log(`Server starting on http://${config.hostname}:${config.port}`)
  console.log(`API docs available at http://${config.hostname}:${config.port}/doc`)
  activeServer = Bun.serve({
    hostname: config.hostname,
    port: config.port,
    idleTimeout: 120,
    fetch: app.fetch,
  })
  console.log(`Buddy server listening on http://${activeServer.hostname}:${activeServer.port}`)
}

function isCompiledSidecarProcess() {
  const executableCandidates = [process.execPath, process.argv[0], process.argv[1]]

  for (const candidate of executableCandidates) {
    if (!candidate) continue
    const basename = path.basename(candidate).toLowerCase()
    if (SIDECAR_EXECUTABLE_NAMES.has(basename)) {
      return true
    }
  }

  return false
}

if (import.meta.main || isCompiledSidecarProcess()) {
  const serverConfig = parseServerBootstrapConfig(process.argv.slice(2))
  void runSafetySweep().catch((error) => {
    console.warn("Initial learner safety sweep failed:", error)
  })
  setInterval(() => {
    void runSafetySweep().catch((error) => {
      console.warn("Periodic learner safety sweep failed:", error)
    })
  }, PERIODIC_SAFETY_SWEEP_INTERVAL_MS)
  startServer(serverConfig)
}

export { app }
export { buildOpenCodeConfigOverlay } from "@buddy/backend/config/runtime"
