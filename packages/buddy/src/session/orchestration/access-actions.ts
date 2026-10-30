import type { Context } from "hono"
import z from "zod"
import type { AgentRuntime } from "@buddy/agent-runtime/runtime"
import { routeErrorBody } from "../../http/route-errors"
import { ensureAllowedDirectory } from "../../http/directory"
import {
  CHAT_ACCESS_MODES,
  chatAccessMetadataPatch,
  readChatAccessMode,
  type ChatAccessMode,
} from "../../learning/agent-execution/permissions/access-mode"
import { withBuddyTeachingSessionUpdate } from "../../learning/agent-execution/state/teaching-session-metadata"
import { getAgentRuntime } from "../../runtime/agent-runtime"
import { createRuntimeSessionAccess } from "../../runtime/session-access"
import { loadRuntimeSessionInDirectory, runtimeSessionLookupErrorResponse } from "./lookup"

export const sessionAccessSchema = z.object({
  mode: z.enum(CHAT_ACCESS_MODES),
})

const CHILD_CHAT_ACCESS_ERROR = "Child chats follow the root chat's access mode"

async function sessionFamilyIDs(runtime: AgentRuntime, rootID: string): Promise<string[]> {
  const ids = [rootID]
  const seen = new Set([rootID])
  for (const id of ids) {
    const children = await runtime.conversations.children(id)
    for (const child of children) {
      if (seen.has(child.id)) continue
      seen.add(child.id)
      ids.push(child.id)
    }
  }
  return ids
}

async function setChatAccessMode(input: {
  directory: string
  sessionID: string
  mode: ChatAccessMode
}): Promise<"applied" | "child"> {
  const runtime = await getAgentRuntime()
  const session = await runtime.conversations.get(input.sessionID)
  if (session.parentID !== undefined) return "child"
  return withBuddyTeachingSessionUpdate(input.sessionID, async (): Promise<"applied"> => {
    const sessions = createRuntimeSessionAccess(runtime, input.directory)
    await sessions.patchMetadata(input.sessionID, chatAccessMetadataPatch(input.mode))
    if (input.mode !== "full") return "applied"
    const pending = await runtime.approvals.pending({
      sessions: await sessionFamilyIDs(runtime, input.sessionID),
    })
    for (const request of pending) {
      await runtime.approvals.reply({
        sessionID: request.sessionID,
        requestID: request.id,
        reply: "once",
      })
    }
    return "applied"
  })
}

export async function getSessionAccess(c: Context): Promise<Response> {
  const allowed = ensureAllowedDirectory(c)
  if (!allowed.ok) return allowed.response
  const sessionID = c.req.param("sessionID")
  try {
    const session = await loadRuntimeSessionInDirectory(allowed.directory, sessionID)
    if (!session) return c.json(routeErrorBody(404, "Session not found"), 404)
    const runtime = await getAgentRuntime()
    const read = await readChatAccessMode(
      createRuntimeSessionAccess(runtime, allowed.directory),
      sessionID,
    )
    if (read.kind !== "mode") {
      return c.json(
        routeErrorBody(500, "Chat access mode could not be read", "chat_access.unreadable"),
        500,
      )
    }
    return c.json({ mode: read.mode })
  } catch (error) {
    return runtimeSessionLookupErrorResponse(error)
  }
}

export async function setSessionAccess(c: Context, mode: ChatAccessMode): Promise<Response> {
  const allowed = ensureAllowedDirectory(c)
  if (!allowed.ok) return allowed.response
  const sessionID = c.req.param("sessionID")
  try {
    const session = await loadRuntimeSessionInDirectory(allowed.directory, sessionID)
    if (!session) return c.json(routeErrorBody(404, "Session not found"), 404)
    const result = await setChatAccessMode({
      directory: allowed.directory,
      sessionID,
      mode,
    })
    if (result === "child") return c.json(routeErrorBody(400, CHILD_CHAT_ACCESS_ERROR), 400)
    return c.json({ mode })
  } catch (error) {
    return runtimeSessionLookupErrorResponse(error)
  }
}
