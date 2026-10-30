import type { Context } from "hono"
import { RuntimeError, runtimeErrorStatus } from "@buddy/agent-runtime/errors"
import z from "zod"
import { routeErrorBody } from "../../http/route-errors"
import { withConfigSync } from "../../http/route-helpers"
import {
  draftSessionSmartNote,
  SmartNoteDraftEmpty,
  SmartNoteDraftUnavailable,
  type TSmartNoteDraftError,
  type TSmartNoteGenerate,
} from "../../notes/smart-note"
import { SMART_NOTE_FOCUS_CHARACTERS } from "../../notes/smart-note-prompt"
import { getAgentRuntime } from "../../runtime/agent-runtime"
import { loadRuntimeSessionInDirectory, runtimeSessionLookupErrorResponse } from "./lookup"

export const sessionSmartNoteBodySchema = z.object({
  focus: z.string().trim().max(SMART_NOTE_FOCUS_CHARACTERS).optional(),
})

export const sessionSmartNoteResponseSchema = z.object({
  text: z.string().min(1),
})

export const sessionSmartNoteBodyOpenApiSchema = {
  type: "object" as const,
  additionalProperties: false,
  properties: {
    focus: {
      type: "string" as const,
      maxLength: SMART_NOTE_FOCUS_CHARACTERS,
    },
  },
}

function smartNoteErrorResponse(error: TSmartNoteDraftError) {
  if (error instanceof SmartNoteDraftEmpty) {
    return Response.json(routeErrorBody(400, error.message, "smart_note.empty"), { status: 400 })
  }
  if (error.cause instanceof RuntimeError) {
    const status = runtimeErrorStatus(error.cause)
    const message = error.cause.kind === "not_found" ? "Session not found" : error.message
    return Response.json(routeErrorBody(status, message, "smart_note.unavailable"), { status })
  }
  return Response.json(routeErrorBody(503, error.message, "smart_note.unavailable"), {
    status: 503,
  })
}

export async function postSessionSmartNote(
  c: Context,
  focus: string | undefined,
): Promise<Response> {
  const syncResult = await withConfigSync(c, { operation: "smart-note" })
  if (!syncResult.ok) return syncResult.response

  const sessionID = c.req.param("sessionID")
  const directory = syncResult.value.directory
  try {
    const session = await loadRuntimeSessionInDirectory(directory, sessionID)
    if (!session) {
      return Response.json(routeErrorBody(404, "Session not found"), { status: 404 })
    }
  } catch (error) {
    return runtimeSessionLookupErrorResponse(error)
  }

  let runtime: Awaited<ReturnType<typeof getAgentRuntime>>
  try {
    runtime = await getAgentRuntime()
  } catch (cause) {
    return smartNoteErrorResponse(new SmartNoteDraftUnavailable(cause))
  }

  const trimmedFocus = focus?.trim()
  const generate: TSmartNoteGenerate = (generation) =>
    generation.signal
      ? runtime.execution.generate({
          sessionID: generation.sessionID,
          prompt: generation.prompt,
          signal: generation.signal,
        })
      : runtime.execution.generate({
          sessionID: generation.sessionID,
          prompt: generation.prompt,
        })
  const result = trimmedFocus
    ? await draftSessionSmartNote({
        directory,
        sessionID,
        focus: trimmedFocus,
        signal: c.req.raw.signal,
        generate,
      })
    : await draftSessionSmartNote({
        directory,
        sessionID,
        signal: c.req.raw.signal,
        generate,
      })
  if (result._tag === "err") return smartNoteErrorResponse(result.error)
  return c.json({ text: result.text })
}
