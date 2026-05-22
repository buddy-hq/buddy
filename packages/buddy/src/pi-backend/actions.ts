import type { Context } from "hono"
import { withDirectoryContext } from "../http"
import { piRuntime, readPiCommandPromptRequest, readPiPromptRequest } from "./runtime"

const BAD_REQUEST_STATUS = 400
const NOT_IMPLEMENTED_STATUS = 501
const NO_CONTENT_STATUS = 204
const INVALID_JSON_BODY_ERROR = "Invalid JSON body"
const MISSING_CONTENT_ERROR = "content is required"
const UNSUPPORTED_PI_OPERATION_ERROR =
  "This session operation is not implemented for the PI runtime yet."

type SessionPatchBody = {
  title?: string
  time?: {
    archived?: number
  }
}

function validatedJsonBody(c: Context): unknown {
  const request: unknown = c.req
  if (!request || typeof request !== "object" || !("valid" in request)) return undefined
  const valid = request.valid
  if (typeof valid !== "function") return undefined
  return Reflect.apply(valid, request, ["json"])
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function readSessionPatchBody(value: unknown): SessionPatchBody {
  if (!isRecord(value)) return {}
  const time = isRecord(value.time) ? value.time : undefined
  return {
    ...(typeof value.title === "string" ? { title: value.title } : {}),
    ...(typeof time?.archived === "number"
      ? {
          time: {
            archived: time.archived,
          },
        }
      : {}),
  }
}

function mapPiRouteError(error: unknown) {
  return piRuntime.mapRouteError(error)
}

async function runPiRoute(task: () => Promise<Response>) {
  try {
    return await task()
  } catch (error) {
    const response = mapPiRouteError(error)
    if (response) return response
    throw error
  }
}

export async function piSessionCollection(c: Context): Promise<Response> {
  const context = withDirectoryContext(c)
  if (!context.ok) return context.response

  if (c.req.method === "POST") {
    return runPiRoute(async () => c.json(await piRuntime.createSession(context.value.directory)))
  }

  return runPiRoute(async () => c.json(await piRuntime.listSessions(context.value.directory)))
}

export async function piGetSessionStatus(c: Context): Promise<Response> {
  const context = withDirectoryContext(c)
  if (!context.ok) return context.response

  return c.json(piRuntime.getStatus(context.value.directory))
}

export async function piGetSessionById(c: Context): Promise<Response> {
  const context = withDirectoryContext(c)
  if (!context.ok) return context.response

  return runPiRoute(async () =>
    c.json(await piRuntime.getSessionInfo(context.value.directory, c.req.param("sessionID"))),
  )
}

export async function piPatchSessionById(c: Context): Promise<Response> {
  const context = withDirectoryContext(c)
  if (!context.ok) return context.response

  const body = readSessionPatchBody(validatedJsonBody(c))
  return runPiRoute(async () =>
    c.json(await piRuntime.patchSession(context.value.directory, c.req.param("sessionID"), body)),
  )
}

export async function piListSessionMessages(c: Context): Promise<Response> {
  const context = withDirectoryContext(c)
  if (!context.ok) return context.response

  return runPiRoute(async () =>
    c.json(
      await piRuntime.listTranscriptMessages(context.value.directory, c.req.param("sessionID")),
    ),
  )
}

export async function piPostSessionPrompt(c: Context): Promise<Response> {
  const context = withDirectoryContext(c)
  if (!context.ok) return context.response

  const request = readPiPromptRequest(validatedJsonBody(c))
  if (!request) {
    return c.json({ error: MISSING_CONTENT_ERROR }, BAD_REQUEST_STATUS)
  }

  return runPiRoute(async () => {
    return piPromptResponse(c, context.value.directory, c.req.param("sessionID"), request)
  })
}

export async function piPromptResponse(
  c: Context,
  directory: string,
  sessionID: string,
  request: NonNullable<ReturnType<typeof readPiPromptRequest>>,
): Promise<Response> {
  const message = await piRuntime.prompt(directory, sessionID, request)
  if (!message) return c.json({ error: INVALID_JSON_BODY_ERROR }, BAD_REQUEST_STATUS)
  return c.json(message)
}

export async function piPostSessionPromptAsync(c: Context): Promise<Response> {
  const context = withDirectoryContext(c)
  if (!context.ok) return context.response

  const request = readPiPromptRequest(validatedJsonBody(c))
  if (!request) {
    return c.json({ error: MISSING_CONTENT_ERROR }, BAD_REQUEST_STATUS)
  }

  return runPiRoute(async () => {
    return piPromptAsyncResponse(context.value.directory, c.req.param("sessionID"), request)
  })
}

export async function piPromptAsyncResponse(
  directory: string,
  sessionID: string,
  request: NonNullable<ReturnType<typeof readPiPromptRequest>>,
): Promise<Response> {
  await piRuntime.promptAsync(directory, sessionID, request)
  return new Response(null, { status: NO_CONTENT_STATUS })
}

export async function piPostSessionCommand(c: Context): Promise<Response> {
  const context = withDirectoryContext(c)
  if (!context.ok) return context.response

  const request = readPiCommandPromptRequest(validatedJsonBody(c))
  if (!request) {
    return c.json({ error: INVALID_JSON_BODY_ERROR }, BAD_REQUEST_STATUS)
  }

  return runPiRoute(async () => {
    return piPromptResponse(c, context.value.directory, c.req.param("sessionID"), request)
  })
}

export async function piSummarizeSessionById(c: Context): Promise<Response> {
  const context = withDirectoryContext(c)
  if (!context.ok) return context.response

  return runPiRoute(async () =>
    c.json(await piRuntime.compact(context.value.directory, c.req.param("sessionID"))),
  )
}

export async function piAbortSessionRun(c: Context): Promise<Response> {
  const context = withDirectoryContext(c)
  if (!context.ok) return context.response

  return c.json(piRuntime.abort(context.value.directory, c.req.param("sessionID")))
}

export function piUnsupportedSessionOperation() {
  return Response.json(
    { error: UNSUPPORTED_PI_OPERATION_ERROR },
    { status: NOT_IMPLEMENTED_STATUS },
  )
}
