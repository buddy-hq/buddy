import "./opencode-runtime/env.js"
import { Hono } from "hono"
import { openAPIRouteHandler } from "hono-openapi"
import { cors } from "hono/cors"
import { HTTPException } from "hono/http-exception"
import { logger } from "hono/logger"
import { AgentsMdRoutes } from "./routes"
import { AuthRoutes } from "./routes"
import { BenchRoutes } from "./routes"
import { CompatibilityRoutes } from "./routes"
import { ConfigRoutes } from "./routes"
import { GlobalRoutes } from "./routes"
import { LearnerRoutes } from "./routes"
import { LocalRuntimeRoutes } from "./routes"
import { McpRoutes } from "./routes"
import { ObjectsRoutes } from "./routes"
import { ObsidianRoutes } from "./routes"
import { OpenProjectsRoutes } from "./routes"
import { PermissionRoutes } from "./routes"
import { ProjectRoutes } from "./routes"
import { ProviderRoutes } from "./routes"
import { QuestionRoutes } from "./routes"
import { ReferenceRoutes } from "./routes"
import { SessionRoutes } from "./routes"
import { SkillsRoutes } from "./routes"
import { TeachingRoutes } from "./routes"
import { isJsonContentType, normalizeValidationFailureResponse } from "./http"
import { BUDDY_ENV } from "./storage"

export function describeFatalError(error: unknown): string {
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

async function normalizeHttpException(error: HTTPException) {
  const response = error.getResponse()
  if (isJsonContentType(response.headers.get("content-type"))) {
    return response
  }

  const rawMessage = (await response.clone().text()).trim()
  const message =
    error.status === 400 && rawMessage === "Malformed JSON in request body"
      ? "Invalid JSON body"
      : rawMessage || error.message || response.statusText || "Request failed"

  return Response.json({ error: message }, { status: error.status })
}

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
  return c.json({ error: "Unauthorized" }, 401)
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
api.route("/auth", AuthRoutes)
api.route("/bench", BenchRoutes)
api.route("/mcp", McpRoutes)
api.route("/objects", ObjectsRoutes)
api.route("/obsidian", ObsidianRoutes)
api.route("/config", ConfigRoutes)
api.route("/permission", PermissionRoutes)
api.route("/session", SessionRoutes)
api.route("/skills", SkillsRoutes)

app.use(logger())
app.use(cors({ origin: "*" }))
app.use("*", async (c, next) => {
  await next()
  c.res = await normalizeValidationFailureResponse(c.res)
})
app.onError(async (error) => {
  if (error instanceof HTTPException) {
    return normalizeHttpException(error)
  }

  console.error("Unhandled Buddy route error", describeFatalError(error))
  return Response.json({ error: "Internal server error" }, { status: 500 })
})
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
