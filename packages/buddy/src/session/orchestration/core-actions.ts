import type { Context } from "hono"
import { withConfigSync, withDirectoryContext } from "../../http"
import { runLearnerMemoryStartupPipeline } from "../../learning/features/memory"
import { clearDynamicLearningToolsForEndedSession } from "../../learning/runtime/dynamic-tool-grants"
import {
  piGetSessionById,
  piGetSessionStatus,
  piListSessionMessages,
  piPatchSessionById,
  piSessionCollection,
  piSummarizeSessionById,
} from "../../pi-backend/actions"
import { piRuntime } from "../../pi-backend/runtime"

type SessionPatchBody = {
  time?: {
    archived?: unknown
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function validatedJsonBody(c: Context): unknown {
  const request: unknown = c.req
  if (!request || typeof request !== "object" || !("valid" in request)) return undefined
  const valid = request.valid
  if (typeof valid !== "function") return undefined
  return Reflect.apply(valid, request, ["json"])
}

function parseSessionPatchBody(value: unknown): SessionPatchBody | undefined {
  return isRecord(value) ? value : undefined
}

export function proxySessionCollection(c: Context): Promise<Response> {
  return piSessionCollection(c).then((response) => {
    if (c.req.method !== "POST" || !response.ok) {
      return response
    }

    response
      .clone()
      .json()
      .then((body: unknown) => {
        if (!isRecord(body) || typeof body.id !== "string") return
        const directoryContext = withDirectoryContext(c)
        if (!directoryContext.ok) return
        runLearnerMemoryStartupPipeline({
          directory: directoryContext.value.directory,
          currentSessionID: body.id,
        }).catch((error) => {
          console.warn("Learner memory startup pipeline failed:", error)
        })
      })
      .catch(() => undefined)

    return response
  })
}

export function getSessionStatus(c: Context): Promise<Response> {
  return piGetSessionStatus(c)
}

export function getSessionById(c: Context): Promise<Response> {
  return piGetSessionById(c)
}

export function patchSessionById(c: Context): Promise<Response> {
  const body = parseSessionPatchBody(validatedJsonBody(c))
  return piPatchSessionById(c).then(async (response) => {
    const archived =
      body?.time && isRecord(body.time) && typeof body.time.archived === "number"
        ? body.time.archived
        : undefined

    if (!response.ok || archived === undefined) {
      return response
    }

    const syncResult = await withConfigSync(c, {
      operation: "session archive",
    })
    if (!syncResult.ok) {
      return response
    }

    await clearDynamicLearningToolsForEndedSession({
      directory: syncResult.value.directory,
      sessionID: c.req.param("sessionID"),
    }).catch((error) => {
      console.warn("Failed to clear dynamic learning tools after archiving session", error)
    })

    return response
  })
}

export function summarizeSessionById(c: Context): Promise<Response> {
  return piSummarizeSessionById(c)
}

export async function revertSessionById(c: Context): Promise<Response> {
  const syncResult = await withConfigSync(c, {
    operation: "session revert",
  })
  if (!syncResult.ok) return syncResult.response

  const body = validatedJsonBody(c)
  if (!isRecord(body) || typeof body.messageID !== "string") {
    return Response.json({ error: "messageID is required." }, { status: 400 })
  }

  try {
    return c.json(
      await piRuntime.revertSession(syncResult.value.directory, c.req.param("sessionID"), {
        messageID: body.messageID,
        ...(typeof body.partID === "string" ? { partID: body.partID } : {}),
      }),
    )
  } catch (error) {
    const response = piRuntime.mapRouteError(error)
    if (response) return response
    throw error
  }
}

export async function unrevertSessionById(c: Context): Promise<Response> {
  const syncResult = await withConfigSync(c, {
    operation: "session unrevert",
  })
  if (!syncResult.ok) return syncResult.response

  try {
    return c.json(
      await piRuntime.unrevertSession(syncResult.value.directory, c.req.param("sessionID")),
    )
  } catch (error) {
    const response = piRuntime.mapRouteError(error)
    if (response) return response
    throw error
  }
}

export function listSessionMessages(c: Context): Promise<Response> {
  return piListSessionMessages(c)
}
