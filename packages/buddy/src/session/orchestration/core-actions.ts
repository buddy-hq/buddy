import type { Context } from "hono"
import { Schema } from "effect"
import { SessionCreate } from "@buddy/transcript-contract/session"
import { isNotFound, runtimeErrorStatus } from "@buddy/agent-runtime/errors"
import { ensureAllowedDirectory } from "../../http/directory"
import { isSessionInRequestedProject } from "../../http/session"
import { withConfigSync } from "../../http/route-helpers"
import { getAgentRuntime } from "../../runtime/agent-runtime"
import { ensureBuddyToolPresentationCatalog } from "../../runtime/buddy-tool-presentation-catalog"
import { loadRuntimeSessionInDirectory, runtimeSessionLookupErrorResponse } from "./lookup"
import {
  parseTSessionJsonObject,
  parseTSessionJsonValidator,
  parseTSessionNumber,
  parseTSessionString,
  type TSessionJsonObject,
} from "./parse-values"

function readValidatedJsonBody(c: Context): TSessionJsonObject {
  const valid = parseTSessionJsonValidator(c.req.valid.bind(c.req))
  if (!valid) return {}
  try {
    return valid("json")
  } catch {
    return {}
  }
}

async function inSession(
  c: Context,
  task: (directory: string, sessionID: string) => Promise<Response>,
): Promise<Response> {
  const allowed = ensureAllowedDirectory(c)
  if (!allowed.ok) return allowed.response
  const sessionID = c.req.param("sessionID")
  try {
    const session = await loadRuntimeSessionInDirectory(allowed.directory, sessionID)
    if (!session) return c.json({ error: "Session not found" }, 404)
    return await task(allowed.directory, sessionID)
  } catch (error) {
    return runtimeSessionLookupErrorResponse(error)
  }
}

export async function proxySessionCollection(c: Context): Promise<Response> {
  if (c.req.method === "POST") {
    const allowed = ensureAllowedDirectory(c)
    if (!allowed.ok) return allowed.response
    try {
      const input = Schema.decodeUnknownSync(SessionCreate)(readValidatedJsonBody(c))
      const runtime = await getAgentRuntime()
      for (const sessionID of [input.id, input.parentID]) {
        if (sessionID === undefined) continue
        const existing = await runtime.conversations.get(sessionID).catch((cause: unknown) => {
          if (isNotFound(cause, "session")) return undefined
          throw cause
        })
        if (
          existing
            ? !(await isSessionInRequestedProject(allowed.directory, existing))
            : sessionID === input.parentID
        ) {
          return c.json({ error: "Session not found" }, 404)
        }
      }
      const synced = await withConfigSync(c, { operation: "session creation" })
      if (!synced.ok) return synced.response
      const session = await runtime.conversations.create(synced.value.directory, input)
      if (!(await isSessionInRequestedProject(synced.value.directory, session)))
        return c.json({ error: "Session not found" }, 404)
      void import("../../learning/features/memory")
        .then(({ runLearnerMemoryStartupPipeline }) =>
          runLearnerMemoryStartupPipeline({
            directory: synced.value.directory,
            currentSessionID: session.id,
          }),
        )
        .catch((cause: unknown) => console.warn("Learner memory startup pipeline failed:", cause))
      return c.json(session)
    } catch (error) {
      return runtimeSessionLookupErrorResponse(error)
    }
  }
  const allowed = ensureAllowedDirectory(c)
  if (!allowed.ok) return allowed.response
  try {
    const query = new URL(c.req.url).searchParams
    const runtime = await getAgentRuntime()
    const location = await runtime.workspace.location(allowed.directory)
    const owners = new Map<string, Promise<boolean>>()
    return c.json(
      await runtime.conversations.list({
        directory: allowed.directory,
        project: query.has("directory") ? undefined : location.project.id,
        roots: query.get("roots") === "true",
        search: query.get("search") ?? undefined,
        updatedSince: query.has("start") ? Number(query.get("start")) : undefined,
        limit: query.has("limit") ? Number(query.get("limit")) : undefined,
        include: (session) => {
          const owned =
            owners.get(session.directory) ?? isSessionInRequestedProject(allowed.directory, session)
          owners.set(session.directory, owned)
          return owned
        },
      }),
    )
  } catch (error) {
    return runtimeSessionLookupErrorResponse(error)
  }
}

export async function getSessionStatus(c: Context): Promise<Response> {
  const allowed = ensureAllowedDirectory(c)
  if (!allowed.ok) return allowed.response
  try {
    return c.json(await (await getAgentRuntime()).execution.statuses())
  } catch (error) {
    return runtimeSessionLookupErrorResponse(error)
  }
}

export async function getSessionById(c: Context): Promise<Response> {
  return inSession(c, async (directory, sessionID) =>
    c.json(await loadRuntimeSessionInDirectory(directory, sessionID)),
  )
}

async function familySessionIDs(sessionID: string): Promise<string[]> {
  const runtime = await getAgentRuntime()
  const seen = new Set<string>()
  const queue = [sessionID]
  for (const id of queue) {
    if (seen.has(id)) continue
    seen.add(id)
    const family = await runtime.conversations.children(id)
    queue.push(...family.map((child) => child.id))
  }
  return [...seen]
}

export async function deleteSessionById(c: Context): Promise<Response> {
  return inSession(c, async (directory, sessionID) => {
    const family = await familySessionIDs(sessionID)
    await (await getAgentRuntime()).conversations.remove(sessionID)
    try {
      const { clearDynamicLearningToolsForDeletedSessions } =
        await import("../../learning/runtime/dynamic-tool-grants")
      clearDynamicLearningToolsForDeletedSessions({ directory, sessionIDs: family })
    } catch (error) {
      console.warn("Failed to clear dynamic learning tools after deleting session", error)
    }
    return c.json(true)
  })
}

export async function patchSessionById(c: Context): Promise<Response> {
  return inSession(c, async (directory, sessionID) => {
    const body = readValidatedJsonBody(c)
    const archived = parseTSessionNumber(parseTSessionJsonObject(body.time)?.archived)
    const session = await (
      await getAgentRuntime()
    ).conversations.update(sessionID, {
      title: parseTSessionString(body.title),
      time: archived === undefined ? undefined : { archived },
    })
    if (archived !== undefined) {
      try {
        const { clearDynamicLearningToolsForEndedSession } =
          await import("../../learning/runtime/dynamic-tool-grants")
        await clearDynamicLearningToolsForEndedSession({ directory, sessionID })
      } catch (error) {
        console.warn("Failed to clear dynamic learning tools after archiving session", error)
      }
    }
    return c.json(session)
  })
}

export async function summarizeSessionById(c: Context): Promise<Response> {
  const synced = await withConfigSync(c, { operation: "session compaction" })
  if (!synced.ok) return synced.response
  return inSession(c, async (_directory, sessionID) => {
    const body = readValidatedJsonBody(c)
    const providerID = parseTSessionString(body.providerID)
    const modelID = parseTSessionString(body.modelID)
    const result = await (
      await getAgentRuntime()
    ).execution.compact(
      {
        sessionID,
        model: providerID && modelID ? { providerID, modelID } : undefined,
      },
      c.req.raw.signal,
    )
    return result.ok
      ? c.json(result.value)
      : Response.json({ error: result.error.message }, { status: runtimeErrorStatus(result.error) })
  })
}

export async function revertSessionById(c: Context): Promise<Response> {
  const synced = await withConfigSync(c, { operation: "session revert" })
  if (!synced.ok) return synced.response
  return inSession(c, async (_directory, sessionID) => {
    const body = readValidatedJsonBody(c)
    const messageID = parseTSessionString(body.messageID)
    if (!messageID) return c.json({ error: "Message ID is required" }, 400)
    if (body.partID !== undefined)
      return c.json({ error: "Reverting individual parts is unavailable" }, 400)
    return c.json(await (await getAgentRuntime()).conversations.revert(sessionID, messageID))
  })
}

export async function forkSessionById(c: Context): Promise<Response> {
  const synced = await withConfigSync(c, { operation: "session fork" })
  if (!synced.ok) return synced.response
  return inSession(c, async (_directory, sessionID) =>
    c.json(
      await (
        await getAgentRuntime()
      ).conversations.fork(sessionID, {
        beforeMessageID: parseTSessionString(readValidatedJsonBody(c).messageID),
      }),
    ),
  )
}

export async function unrevertSessionById(c: Context): Promise<Response> {
  const synced = await withConfigSync(c, { operation: "session unrevert" })
  if (!synced.ok) return synced.response
  return inSession(c, async (_directory, sessionID) =>
    c.json(await (await getAgentRuntime()).conversations.unrevert(sessionID)),
  )
}

export async function listSessionMessages(c: Context): Promise<Response> {
  return inSession(c, async (directory, sessionID) => {
    await ensureBuddyToolPresentationCatalog(directory)
    const query = new URL(c.req.url).searchParams
    const limit = query.has("limit") ? Number(query.get("limit")) : undefined
    const page = await (
      await getAgentRuntime()
    ).conversations.history(
      { directory, sessionID },
      { limit, before: query.get("before") ?? undefined },
    )
    if (page.cursor) {
      const next = new URL(c.req.url)
      next.searchParams.set("before", page.cursor)
      if (limit !== undefined) next.searchParams.set("limit", String(limit))
      c.header("Access-Control-Expose-Headers", "Link, X-Next-Cursor")
      c.header("Link", `<${next.toString()}>; rel="next"`)
      c.header("X-Next-Cursor", page.cursor)
    }
    return c.json(page.items)
  })
}

export async function getSessionMessageById(c: Context): Promise<Response> {
  return inSession(c, async (directory, sessionID) => {
    await ensureBuddyToolPresentationCatalog(directory)
    const message = await (
      await getAgentRuntime()
    ).conversations.message({ directory, sessionID }, c.req.param("messageID"))
    return message ? c.json(message) : c.json({ error: "Message not found" }, 404)
  })
}

export async function listSessionChildren(c: Context): Promise<Response> {
  return inSession(c, async (_directory, sessionID) =>
    c.json(await (await getAgentRuntime()).conversations.children(sessionID)),
  )
}
