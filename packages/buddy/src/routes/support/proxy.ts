import type { Context } from "hono"
import { ensureActivityToolsRegistered } from "../../learning/activities/tools/register.js"
import { ensureCurriculumToolsRegistered } from "../../learning/curriculum/tools/register.js"
import { ensureFigureToolsRegistered } from "../../learning/figures/tools/register.js"
import { ensureFreeformFigureToolsRegistered } from "../../learning/freeform-figures/tools/register.js"
import { ensureGoalToolsRegistered } from "../../learning/goals/tools/register.js"
import { ensureLearnerToolsRegistered } from "../../learning/learner/tools/register.js"
import { ensureTeachingToolsRegistered } from "../../learning/teaching/tools/register.js"
import { loadOpenCodeApp } from "../../opencode-runtime/runtime.js"
import { isJsonContentType, parseJsonText } from "../shared/http.js"
import { ensureAllowedDirectory } from "./directory.js"
import { normalizeErrorResponse } from "./error-normalization.js"

export type ProxyToOpenCodeInput = {
  targetPath: string
  transformJsonBody?: (
    body: Record<string, unknown>,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>
  forceBusyAs409?: boolean
  registerCurriculumTools?: boolean | ((body: Record<string, unknown>) => boolean)
  registerFigureTools?: boolean | ((body: Record<string, unknown>) => boolean)
  registerFreeformFigureTools?: boolean | ((body: Record<string, unknown>) => boolean)
  registerGoalTools?: boolean | ((body: Record<string, unknown>) => boolean)
  registerLearnerTools?: boolean | ((body: Record<string, unknown>) => boolean)
  registerTeachingTools?: boolean | ((body: Record<string, unknown>) => boolean)
}

type FetchOpenCodeInput = {
  directory: string
  method: string
  path: string
  query?: string
  headers?: Headers
  body?: BodyInit
  registerCurriculumTools?: boolean
  registerFigureTools?: boolean
  registerFreeformFigureTools?: boolean
  registerGoalTools?: boolean
  registerLearnerTools?: boolean
  registerTeachingTools?: boolean
}

async function registerOpenCodeTools(input: {
  directory: string
  registerCurriculumTools?: boolean
  registerFigureTools?: boolean
  registerFreeformFigureTools?: boolean
  registerGoalTools?: boolean
  registerLearnerTools?: boolean
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

  if (input.registerGoalTools === true) {
    registrations.push(
      ensureGoalToolsRegistered(input.directory).catch((error) => {
        console.warn("Failed to register Buddy goal tools into OpenCode runtime:", error)
      }),
    )
  }

  if (input.registerLearnerTools === true) {
    registrations.push(
      ensureLearnerToolsRegistered(input.directory).catch((error) => {
        console.warn("Failed to register Buddy learner tools into OpenCode runtime:", error)
      }),
      ensureActivityToolsRegistered(input.directory).catch((error) => {
        console.warn("Failed to register Buddy activity tools into OpenCode runtime:", error)
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

  if (input.registerFigureTools === true) {
    registrations.push(
      ensureFigureToolsRegistered(input.directory).catch((error) => {
        console.warn("Failed to register Buddy figure tools into OpenCode runtime:", error)
      }),
    )
  }

  if (input.registerFreeformFigureTools === true) {
    registrations.push(
      ensureFreeformFigureToolsRegistered(input.directory).catch((error) => {
        console.warn("Failed to register Buddy freeform figure tools into OpenCode runtime:", error)
      }),
    )
  }

  if (registrations.length > 0) {
    await Promise.all(registrations)
  }
}

export async function fetchOpenCode(input: FetchOpenCodeInput): Promise<Response> {
  await registerOpenCodeTools(input)

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

function resolveRegistration(input: {
  body: Record<string, unknown>
  value: boolean | ((body: Record<string, unknown>) => boolean) | undefined
}): boolean {
  if (typeof input.value === "boolean") return input.value
  if (typeof input.value === "function") return input.value(input.body)
  return false
}

function resolveInitialRegistrationFlags(input: ProxyToOpenCodeInput) {
  return {
    registerCurriculumTools: typeof input.registerCurriculumTools === "boolean" ? input.registerCurriculumTools : false,
    registerFigureTools: typeof input.registerFigureTools === "boolean" ? input.registerFigureTools : false,
    registerFreeformFigureTools:
      typeof input.registerFreeformFigureTools === "boolean" ? input.registerFreeformFigureTools : false,
    registerGoalTools: typeof input.registerGoalTools === "boolean" ? input.registerGoalTools : false,
    registerLearnerTools: typeof input.registerLearnerTools === "boolean" ? input.registerLearnerTools : false,
    registerTeachingTools: typeof input.registerTeachingTools === "boolean" ? input.registerTeachingTools : false,
  }
}

export async function proxyToOpenCode(c: Context, input: ProxyToOpenCodeInput): Promise<Response> {
  const directoryResult = ensureAllowedDirectory(c.req.raw)
  if (!directoryResult.ok) return directoryResult.response

  const method = c.req.method.toUpperCase()
  const sourceURL = new URL(c.req.url)
  const headers = new Headers(c.req.raw.headers)
  let body: BodyInit | undefined
  let {
    registerCurriculumTools,
    registerFigureTools,
    registerFreeformFigureTools,
    registerGoalTools,
    registerLearnerTools,
    registerTeachingTools,
  } = resolveInitialRegistrationFlags(input)

  if (method !== "GET" && method !== "HEAD") {
    if (input.transformJsonBody) {
      const contentType = headers.get("content-type")
      if (isJsonContentType(contentType)) {
        const raw = await c.req.raw.text()
        const parsedResult = raw.trim().length > 0 ? parseJsonText(raw) : { ok: true as const, value: {} as unknown }
        if (!parsedResult.ok || !parsedResult.value || typeof parsedResult.value !== "object" || Array.isArray(parsedResult.value)) {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 })
        }
        const parsed = parsedResult.value as Record<string, unknown>
        const transformed = await input.transformJsonBody(parsed)
        registerCurriculumTools = resolveRegistration({ body: transformed, value: input.registerCurriculumTools })
        registerFigureTools = resolveRegistration({ body: transformed, value: input.registerFigureTools })
        registerFreeformFigureTools = resolveRegistration({ body: transformed, value: input.registerFreeformFigureTools })
        registerGoalTools = resolveRegistration({ body: transformed, value: input.registerGoalTools })
        registerLearnerTools = resolveRegistration({ body: transformed, value: input.registerLearnerTools })
        registerTeachingTools = resolveRegistration({ body: transformed, value: input.registerTeachingTools })
        body = JSON.stringify(transformed)
      } else {
        body = await c.req.raw.arrayBuffer()
      }
    } else {
      const buffer = await c.req.raw.arrayBuffer()
      body = buffer.byteLength > 0 ? buffer : undefined
    }
  }

  const proxyParams = new URLSearchParams(sourceURL.searchParams)
  if (proxyParams.has("directory")) {
    proxyParams.set("directory", directoryResult.directory)
  }
  const proxyQuery = proxyParams.toString()

  const response = await fetchOpenCode({
    directory: directoryResult.directory,
    method,
    path: input.targetPath,
    query: proxyQuery ? `?${proxyQuery}` : "",
    headers,
    body,
    registerCurriculumTools,
    registerFigureTools,
    registerFreeformFigureTools,
    registerGoalTools,
    registerLearnerTools,
    registerTeachingTools,
  })

  return normalizeErrorResponse(response, input.forceBusyAs409)
}
