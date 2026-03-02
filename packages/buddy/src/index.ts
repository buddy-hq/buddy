import "./opencode/env.js"
import { Hono } from "hono"
import { openAPIRouteHandler } from "hono-openapi"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { assertOpenCodeRuntime } from "./opencode/runtime.js"
import { AuthRoutes } from "./routes/auth.js"
import { CompatibilityRoutes } from "./routes/compatibility.js"
import { ConfigRoutes } from "./routes/config.js"
import { CurriculumRoutes } from "./routes/curriculum.js"
import { GlobalRoutes } from "./routes/global.js"
import { McpRoutes } from "./routes/mcp.js"
import { PermissionRoutes } from "./routes/permission.js"
import { ProjectRoutes } from "./routes/project.js"
import { ProviderRoutes } from "./routes/provider.js"
import { SessionRoutes } from "./routes/session.js"
import { ensureAllowedDirectory } from "./routes/support.js"
import { TeachingRoutes } from "./routes/teaching.js"

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

api.route("/curriculum", CurriculumRoutes())
api.route("/teaching", TeachingRoutes({ ensureAllowedDirectory }))
api.route("/", CompatibilityRoutes())
api.route("/project", ProjectRoutes())
api.route("/global", GlobalRoutes())
api.route("/provider", ProviderRoutes())
api.route("/auth", AuthRoutes())
api.route("/mcp", McpRoutes())
api.route("/config", ConfigRoutes())
api.route("/permission", PermissionRoutes())
api.route("/session", SessionRoutes())

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

app.get("/doc", generatedOpenApiHandler)

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
export { buildOpenCodeConfigOverlay } from "./config/compatibility.js"
