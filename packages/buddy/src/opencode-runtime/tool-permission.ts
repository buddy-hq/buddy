import type { OpenCodeHost, OpenCodeEvent } from "@buddy/opencode-adapter/host"
import { Permission, ToolError } from "@buddy/opencode-adapter/plugin"
import type { BuddyToolPermissionRequest } from "../learning/runtime/create-buddy-tool"
import type { TJsonObject } from "../learning/prompt/utils"

type PendingAsk = { sessionID: string; feedback?: string }
const pendingByClient = new WeakMap<OpenCodeHost, Map<string, PendingAsk>>()

export function withBuddyToolPermissionReplies(client: OpenCodeHost): OpenCodeHost {
  const pending = new Map<string, PendingAsk>()
  const wrapped: OpenCodeHost = {
    ...client,
    permission: {
      ...client.permission,
      async reply(input, options) {
        if (input.decision === "reject") {
          for (const ask of pending.values()) {
            if (ask.sessionID === input.sessionID) ask.feedback = input.message
          }
        }
        return client.permission.reply(input, options)
      },
    },
  }
  pendingByClient.set(wrapped, pending)
  return wrapped
}

type BuddyToolPermissionInput = {
  sessionID: string
  agent: string
  messageID: string
  callID: string
  request: BuddyToolPermissionRequest
  signal: AbortSignal
}

function omitUndefinedMetadata(
  metadata: BuddyToolPermissionRequest["metadata"],
): TJsonObject {
  const result: TJsonObject = {}
  for (const [key, value] of Object.entries(metadata)) {
    if (value !== undefined) result[key] = value
  }
  return result
}

async function waitForEvent(
  iterator: AsyncIterator<OpenCodeEvent>,
  matches: (event: OpenCodeEvent) => boolean,
  signal: AbortSignal,
) {
  while (true) {
    signal.throwIfAborted()
    const next = await iterator.next()
    signal.throwIfAborted()
    if (next.done) throw new ToolError({ message: "Permission event stream closed before a reply" })
    if (matches(next.value)) return next.value
  }
}

export async function askBuddyToolPermission(
  client: OpenCodeHost,
  input: BuddyToolPermissionInput,
): Promise<void> {
  input.signal.throwIfAborted()
  const id = Permission.ID.create()
  const controller = new AbortController()
  const signal = AbortSignal.any([input.signal, controller.signal])
  const events = client.event.subscribe({ signal })[Symbol.asyncIterator]()
  const pending = pendingByClient.get(client)
  const ask: PendingAsk = { sessionID: input.sessionID }
  pending?.set(id, ask)
  let requested = false
  let settled = false
  try {
    await waitForEvent(events, (event) => event.type === "server.connected", signal)
    requested = true
    const result = await client.permission.create({
      id,
      sessionID: input.sessionID,
      action: input.request.permission,
      resources: input.request.patterns,
      save: input.request.always,
      metadata: omitUndefinedMetadata(input.request.metadata),
      source: { type: "tool", messageID: input.messageID, id: input.callID },
      agent: input.agent,
    })
    settled = result.effect !== "ask"
    signal.throwIfAborted()
    if (result.effect === "allow") return
    if (result.effect === "deny") {
      throw new ToolError({ message: `Permission denied: ${input.request.permission}` })
    }
    const event = await waitForEvent(
      events,
      (event) => event.type === "permission.replied" &&
        event.data.sessionID === input.sessionID && event.data.requestID === id,
      signal,
    )
    settled = true
    if (event.type !== "permission.replied" || event.data.reply !== "reject") return
    if (ask.feedback) throw new ToolError({ message: ask.feedback })
    await client.session.interrupt({ sessionID: input.sessionID })
    throw new ToolError({ message: "The user declined this tool call" })
  } finally {
    pending?.delete(id)
    controller.abort()
    await events.return?.()
    if (requested && !settled) {
      await client.permission.reply({
        sessionID: input.sessionID, requestID: id, decision: "reject",
      }).catch(() => undefined)
    }
  }
}
