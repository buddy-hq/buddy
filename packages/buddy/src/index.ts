import "./opencode-runtime/env.js"
import { Hono } from "hono"
import { openAPIRouteHandler } from "hono-openapi"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { AgentsMdRoutes } from "./routes"
import { AuthRoutes } from "./routes"
import { CompatibilityRoutes } from "./routes"
import { ConfigRoutes } from "./routes"
import { FigureRoutes } from "./routes"
import { FreeformFigureRoutes } from "./routes"
import { LearnerRoutes } from "./routes"
import { runSafetySweep } from "./learning/learner-model"
import { GlobalRoutes } from "./routes"
import { McpRoutes } from "./routes"
import { LocalRuntimeRoutes } from "./routes"
import { PermissionRoutes } from "./routes"
import { ProjectRoutes } from "./routes"
import { ProviderRoutes } from "./routes"
import { ResourceRoutes } from "./routes"
import { SessionRoutes } from "./routes"
import { SkillsRoutes } from "./routes"
import { TeachingRoutes } from "./routes"

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

api.route("/figures", FigureRoutes())
api.route("/freeform-figures", FreeformFigureRoutes())
api.route("/learner", LearnerRoutes())
api.route("/teaching", TeachingRoutes())
api.route("/agents-md", AgentsMdRoutes())
api.route("/", CompatibilityRoutes())
api.route("/project", ProjectRoutes())
api.route("/resource", ResourceRoutes())
api.route("/global", GlobalRoutes())
api.route("/local-runtimes", LocalRuntimeRoutes())
api.route("/provider", ProviderRoutes())
api.route("/auth", AuthRoutes())
api.route("/mcp", McpRoutes())
api.route("/config", ConfigRoutes())
api.route("/permission", PermissionRoutes())
api.route("/session", SessionRoutes())
api.route("/skills", SkillsRoutes())

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

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000

if (import.meta.main) {
  console.log(`Server starting on http://localhost:${port}`)
  console.log(`API docs available at http://localhost:${port}/doc`)
  void runSafetySweep().catch((error) => {
    console.warn("Initial learner safety sweep failed:", error)
  })
  setInterval(
    () => {
      void runSafetySweep().catch((error) => {
        console.warn("Periodic learner safety sweep failed:", error)
      })
    },
    5 * 60 * 1000,
  )
  Bun.serve({
    port,
    idleTimeout: 120,
    fetch: app.fetch,
  })
}

export { app }
export { buildOpenCodeConfigOverlay } from "@buddy/backend/config/runtime"
