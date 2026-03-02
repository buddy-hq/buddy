import type { Context } from "hono"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ensureCurriculumToolsRegistered } from "../opencode/curriculum-tools.js"
import { loadOpenCodeApp } from "../opencode/runtime.js"
import { allowedDirectoryRoots, isAllowedDirectory, resolveDirectory } from "../project/directory.js"
import { ensureTeachingToolsRegistered } from "../teaching/teaching-tools.js"

export type AllowedDirectoryResult =
  | {
      ok: true
      directory: string
    }
  | {
      ok: false
      response: Response
    }

export type EnsureAllowedDirectory = (request: Request) => AllowedDirectoryResult

export type ProxyToOpenCodeInput = {
  targetPath: string
  transformJsonBody?: (
    body: Record<string, unknown>,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>
  forceBusyAs409?: boolean
  registerCurriculumTools?: boolean | ((body: Record<string, unknown>) => boolean)
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
  registerTeachingTools?: boolean
}

const directoryRoots = allowedDirectoryRoots()

function requestDirectory(request: Request): string {
  const url = new URL(request.url)
  const rawDirectory =
    url.searchParams.get("directory") ??
    request.headers.get("x-buddy-directory") ??
    request.headers.get("x-opencode-directory") ??
    process.cwd()

  return resolveDirectory(rawDirectory)
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

async function resolveOpenCodeProjectID(directory: string): Promise<string> {
  return OpenCodeInstance.provide({
    directory,
    fn: () => OpenCodeInstance.project.id,
  })
}

export const ensureAllowedDirectory: EnsureAllowedDirectory = (request) => {
  const directory = requestDirectory(request)
  if (!isAllowedDirectory(directory, directoryRoots)) {
    return {
      ok: false,
      response: Response.json({ error: "Directory is outside allowed roots" }, { status: 403 }),
    }
  }

  return {
    ok: true,
    directory,
  }
}

export function isJsonContentType(value: string | null | undefined): boolean {
  if (!value) return false
  return value.toLowerCase().includes("application/json")
}

export async function normalizeErrorResponse(
  response: Response,
  forceBusyAs409 = false,
): Promise<Response> {
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

export async function fetchOpenCode(input: FetchOpenCodeInput): Promise<Response> {
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

export async function proxyToOpenCode(c: Context, input: ProxyToOpenCodeInput): Promise<Response> {
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
        const transformed = await input.transformJsonBody(parsed)
        if (typeof input.registerCurriculumTools === "function") {
          registerCurriculumTools = input.registerCurriculumTools(transformed)
        }
        if (typeof input.registerTeachingTools === "function") {
          registerTeachingTools = input.registerTeachingTools(transformed)
        }
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

export async function loadSessionStatus(
  directory: string,
  request: Request,
): Promise<
  | Record<
      string,
      {
        type?: "busy" | "idle" | "retry"
      }
    >
  | undefined
> {
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

export async function isSessionInRequestedProject(directory: string, session: unknown): Promise<boolean> {
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
