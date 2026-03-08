import "./opencode-runtime/env.js"
import { Hono } from "hono"
import { openAPIRouteHandler } from "hono-openapi"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { AuthRoutes } from "./routes/auth.js"
import { CompatibilityRoutes } from "./routes/compatibility.js"
import { ConfigRoutes } from "./routes/config.js"
import { FigureRoutes } from "./routes/figures.js"
import { FreeformFigureRoutes } from "./routes/freeform-figures.js"
import { GoalsRoutes } from "./routes/goals.js"
import { LearnerRoutes } from "./routes/learner.js"
import { LearnerService } from "./learning/learner/service.js"
import { GlobalRoutes } from "./routes/global.js"
import { McpRoutes } from "./routes/mcp.js"
import { PermissionRoutes } from "./routes/permission.js"
import { ProjectRoutes } from "./routes/project.js"
import { ProviderRoutes } from "./routes/provider.js"
import { SessionRoutes } from "./routes/session.js"
import { SkillsRoutes } from "./routes/skills.js"
import { TeachingRoutes } from "./routes/teaching.js"
import { ensureAllowedDirectory } from "./routes/support/directory.js"

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

api.route("/figures", FigureRoutes({ ensureAllowedDirectory }))
api.route("/freeform-figures", FreeformFigureRoutes({ ensureAllowedDirectory }))
api.route("/goals", GoalsRoutes())
api.route("/learner", LearnerRoutes())
api.route("/teaching", TeachingRoutes())
api.route("/", CompatibilityRoutes())
api.route("/project", ProjectRoutes())
api.route("/global", GlobalRoutes())
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
  void LearnerService.runSafetySweep().catch((error) => {
    console.warn("Initial learner safety sweep failed:", error)
  })
  setInterval(() => {
    void LearnerService.runSafetySweep().catch((error) => {
      console.warn("Periodic learner safety sweep failed:", error)
    })
  }, 5 * 60 * 1000)
  Bun.serve({
    port,
    idleTimeout: 120,
    fetch: app.fetch,
  })
}

export { app }
export { buildOpenCodeConfigOverlay } from "./config/compatibility.js"
