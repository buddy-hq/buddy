import "./runtime/runtime-paths.js"
import { Hono } from "hono"
import { openAPIRouteHandler } from "hono-openapi"
import { cors } from "hono/cors"
import { HTTPException } from "hono/http-exception"
import { logger } from "hono/logger"
import { AgentsMdRoutes } from "./routes"
import { AuthRoutes } from "./routes"
import { BenchRoutes } from "./routes"
import { ChemistryRoutes } from "./routes"
import { CompatibilityRoutes } from "./routes"
import { ConfigRoutes } from "./routes"
import { GlobalRoutes } from "./routes"
import { LearnerRoutes } from "./routes"
import { LocalRuntimeRoutes } from "./routes"
import { McpRoutes } from "./routes"
import { NotebookUploadRoutes } from "./routes"
import { NotesRoutes } from "./routes"
import { ObjectsRoutes } from "./routes"
import { ObsidianRoutes } from "./routes"
import { OpenProjectsRoutes } from "./routes"
import { PermissionRoutes } from "./routes"
import { ProjectRoutes } from "./routes"
import { ProviderRoutes } from "./routes"
import { QuestionRoutes } from "./routes"
import { ReferenceRoutes } from "./routes"
import { RuntimeRoutes } from "./routes"
import { SessionRoutes } from "./routes"
import { SkillsRoutes } from "./routes"
import { SvgRenderingRoutes } from "./routes"
import { TeachingRoutes } from "./routes"
import { normalizeErrorResponse } from "./http/error-normalization"
import { routeErrorBody, routeErrorResponse } from "./http/route-errors"
import { BUDDY_ENV } from "./storage"
import { WidgetFrameRoutes } from "./routes/object-html-widget"

export function describeFatalError<TError>(error: TError): string {
  if (error instanceof Error) {
    return error.stack ?? `${error.name}: ${error.message}`
  }

  return String(error)
}

process.on("unhandledRejection", (error) => {
  console.error("Unhandled backend rejection", describeFatalError(error))
})

process.on("uncaughtException", (error) => {
  console.error("Uncaught backend exception", describeFatalError(error))
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

export const app = new Hono()
const api = new Hono()

api.use("*", async (c, next) => {
  if (c.req.path.startsWith("/api/frame/widget/")) return next()
  const username = process.env[BUDDY_ENV.SERVER_USERNAME]
  const password = process.env[BUDDY_ENV.SERVER_PASSWORD]

  if (!username || !password) {
    return next()
  }

  const authorization = c.req.header("authorization")
  if (matchesBasicAuth(authorization, username, password)) {
    return next()
  }

  c.header("www-authenticate", 'Basic realm="Buddy"')
  return c.json(routeErrorBody(401, "Unauthorized"), 401)
})

api.route("/learner", LearnerRoutes)
api.route("/teaching", TeachingRoutes)
api.route("/agents-md", AgentsMdRoutes)
api.route("/", CompatibilityRoutes)
api.route("/open-projects", OpenProjectsRoutes)
api.route("/project", ProjectRoutes)
api.route("/global", GlobalRoutes)
api.route("/local-runtimes", LocalRuntimeRoutes)
api.route("/provider", ProviderRoutes)
api.route("/question", QuestionRoutes)
api.route("/reference", ReferenceRoutes)
api.route("/runtime", RuntimeRoutes)
api.route("/auth", AuthRoutes)
api.route("/bench", BenchRoutes)
api.route("/chemistry", ChemistryRoutes)
api.route("/mcp", McpRoutes)
api.route("/notebook/uploads", NotebookUploadRoutes)
api.route("/notes", NotesRoutes)
api.route("/objects", ObjectsRoutes)
api.route("/frame", WidgetFrameRoutes)
api.route("/obsidian", ObsidianRoutes)
api.route("/config", ConfigRoutes)
api.route("/permission", PermissionRoutes)
api.route("/session", SessionRoutes)
api.route("/skills", SkillsRoutes)
api.route("/svg-rendering", SvgRenderingRoutes)

app.use(
  logger((line) => {
    console.log(line.replace(/\/+api\/+frame\/+widget\/+[^/?#\s]+/gu, "/api/frame/widget/[pass]"))
  }),
)
app.use(cors({ origin: "*" }))
app.use("*", async (c, next) => {
  await next()
  if (c.req.path.startsWith("/api/frame/widget/") && c.res.status === 404 && c.res.body === null) {
    return
  }
  c.res = await normalizeErrorResponse(c.res)
})
app.onError(async (error) => {
  if (error instanceof HTTPException) {
    if (error.status === 500) return routeErrorResponse(error)
    return normalizeErrorResponse(error.getResponse())
  }

  return routeErrorResponse(error)
})
app.notFound(() => Response.json(routeErrorBody(404, "404 Not Found"), { status: 404 }))
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
