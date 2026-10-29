import type { Conversations } from "@buddy/agent-runtime/conversations"
import type { Events } from "@buddy/agent-runtime/events"
import type { Execution } from "@buddy/agent-runtime/execution"
import type { Context } from "hono"
import z from "zod"
import { ensureAllowedDirectory } from "../../http/directory"
import { getAgentRuntime } from "../../runtime/agent-runtime"
import { ensureRuntimeSessionExists, runtimeSessionLookupErrorResponse } from "./lookup"

const cancelledCompletionPart = z.object({
  type: z.literal("notice"),
  sessionID: z.string(),
  completion: z.object({ childSessionID: z.string(), outcome: z.literal("cancelled") }),
})
const realUserInput = z.object({
  sessionID: z.string(),
  role: z.literal("user"),
  time: z.object({ created: z.number() }),
})

export async function interruptAndSettle(
  execution: Pick<Execution, "interrupt" | "wait">,
  sessionID: string,
  timeoutMs = 10_000,
): Promise<boolean> {
  const interrupted = await execution.interrupt(sessionID)
  if (!interrupted) return interrupted

  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      execution.wait(sessionID).catch(() => undefined),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
  return interrupted
}

export async function stopSessionFamily(
  runtime: {
    readonly conversations: Pick<Conversations, "children" | "get">
    readonly events: Pick<Events, "stream">
    readonly execution: Pick<Execution, "interrupt" | "wait" | "statuses">
  },
  sessionID: string,
  timeoutMs = 10_000,
): Promise<boolean> {
  const startedAt = Date.now()
  const parents = new Map<string, string>()
  const cancelledCompletions = new Map<string, string>()
  let pending: Set<string> | undefined
  const controller = new AbortController()
  const parent = await runtime.conversations.get(sessionID)
  const ready = Promise.withResolvers<void>()
  const notices = Promise.withResolvers<void>()
  let userAdmitted = false
  const observing = (async () => {
    for await (const event of runtime.events.stream({
      directory: parent.directory,
      signal: controller.signal,
    })) {
      ready.resolve()
      if (event.payload.type === "message.updated") {
        const message = realUserInput.safeParse(event.payload.properties.info)
        if (
          message.success &&
          message.data.sessionID === sessionID &&
          message.data.time.created >= startedAt
        )
          userAdmitted = true
      }
      if (event.payload.type === "message.part.updated") {
        const part = cancelledCompletionPart.safeParse(event.payload.properties.part)
        if (!part.success) continue
        cancelledCompletions.set(part.data.completion.childSessionID, part.data.sessionID)
        if (pending && parents.get(part.data.completion.childSessionID) === part.data.sessionID) {
          pending.delete(part.data.completion.childSessionID)
          if (pending.size === 0) notices.resolve()
        }
      }
    }
  })()
    .catch((cause: unknown) => {
      console.error("Buddy Stop completion subscription failed", { sessionID, cause })
    })
    .finally(() => {
      ready.resolve()
      notices.resolve()
    })
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await ready.promise
    const seen = new Set<string>()
    const queue = [sessionID]
    for (const id of queue) {
      if (seen.has(id)) continue
      seen.add(id)
      const children = await runtime.conversations.children(id)
      for (const child of children) parents.set(child.id, id)
      queue.push(...children.map((child) => child.id))
    }

    const statuses = await runtime.execution.statuses()
    const running = [...seen]
      .slice(1)
      .toReversed()
      .filter((id) => statuses[id] !== undefined)
    pending = new Set(running.filter((id) => cancelledCompletions.get(id) !== parents.get(id)))
    if (pending.size === 0) notices.resolve()
    const results = await Promise.all(
      running.map((id) => interruptAndSettle(runtime.execution, id, timeoutMs)),
    )
    let interrupted = results.some(Boolean)
    interrupted = (await interruptAndSettle(runtime.execution, sessionID, timeoutMs)) || interrupted
    await Promise.race([
      notices.promise,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, 2_000)
      }),
    ])
    const currentStatuses = await runtime.execution.statuses()
    if (!userAdmitted && currentStatuses[sessionID] !== undefined) {
      interrupted =
        (await interruptAndSettle(runtime.execution, sessionID, timeoutMs)) || interrupted
    }
    return interrupted
  } finally {
    clearTimeout(timer)
    controller.abort()
    await observing
  }
}

export async function abortSessionRun(c: Context): Promise<Response> {
  const allowed = ensureAllowedDirectory(c)
  if (!allowed.ok) return allowed.response
  const sessionID = c.req.param("sessionID")
  const missing = await ensureRuntimeSessionExists(allowed.directory, sessionID)
  if (missing) return missing
  try {
    return c.json(await stopSessionFamily(await getAgentRuntime(), sessionID))
  } catch (error) {
    return runtimeSessionLookupErrorResponse(error)
  }
}

export async function backgroundSessionRun(c: Context): Promise<Response> {
  const allowed = ensureAllowedDirectory(c)
  if (!allowed.ok) return allowed.response
  const sessionID = c.req.param("sessionID")
  const missing = await ensureRuntimeSessionExists(allowed.directory, sessionID)
  if (missing) return missing
  try {
    await (await getAgentRuntime()).execution.background(sessionID)
    return c.body(null, 204)
  } catch (error) {
    return runtimeSessionLookupErrorResponse(error)
  }
}
