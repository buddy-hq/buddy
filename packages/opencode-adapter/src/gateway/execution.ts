import type { OpenCodeEvent, SessionStructuredError } from "@opencode/client"
import type { EventClient } from "./client"

export type ExecutionOutcome =
  | { readonly type: "succeeded"; readonly messageID?: string }
  | { readonly type: "failed"; readonly messageID?: string; readonly error: SessionStructuredError }
  | { readonly type: "interrupted"; readonly messageID?: string; readonly reason: string }

export class SessionExecutionWaitError extends Error {
  readonly _tag = "SessionExecutionWaitError"
  constructor(readonly sessionID: string, readonly reason: "aborted" | "disconnected" | "cancelled", readonly cause?: unknown) {
    super(`Session execution wait ${reason}`)
  }
}

export type ExecutionResult =
  | { readonly ok: true; readonly value: ExecutionOutcome }
  | { readonly ok: false; readonly error: SessionExecutionWaitError }

export function observeSessionExecution(client: Pick<EventClient, "event">, input: {
  readonly sessionID: string
  readonly promptID?: string
  readonly signal?: AbortSignal
  readonly operation?: "compaction"
  readonly acceptsPrompt?: (event: Extract<OpenCodeEvent, { type: "session.inbox.enqueued" }>) => boolean
}) {
  const controller = new AbortController()
  const connected = Promise.withResolvers<ExecutionResult | undefined>()
  const completed = Promise.withResolvers<ExecutionResult>()
  const accepted = Promise.withResolvers<string | undefined>()
  let promptID = input.promptID
  let delivered = false
  let replaced = false
  let messageID: string | undefined
  let settled = false
  let ready = false
  let compacting = false
  const controls = new Set<string>()

  function finish(result: ExecutionResult) {
    if (settled) return
    settled = true
    connected.resolve(result)
    completed.resolve(result)
    accepted.resolve(promptID)
    input.signal?.removeEventListener("abort", onAbort)
    controller.abort()
  }

  function fail(reason: SessionExecutionWaitError["reason"], cause?: unknown) {
    finish({ ok: false, error: new SessionExecutionWaitError(input.sessionID, reason, cause) })
  }

  function onAbort() { fail("aborted") }
  input.signal?.addEventListener("abort", onAbort, { once: true })
  if (input.signal?.aborted) onAbort()

  const listening = (async () => {
    try {
      if (settled) return
      for await (const event of client.event.subscribe({ signal: controller.signal })) {
        if (settled) return
        if (event.type === "server.connected") {
          if (ready) { fail("disconnected"); return }
          ready = true
          connected.resolve(undefined)
          continue
        }
        if (!("sessionID" in event.data) || event.data.sessionID !== input.sessionID) continue
        if (event.type === "session.inbox.enqueued") {
          if (event.data.item.type === "compaction" || event.data.item.type === "move") controls.add(event.data.inboxID)
          if (promptID === undefined && input.acceptsPrompt?.(event)) {
            promptID = event.data.inboxID
            accepted.resolve(promptID)
          }
        }
        if (event.type === "session.inbox.cancelled" && event.data.inboxID === promptID) {
          fail("cancelled")
          return
        }
        if (event.type === "session.deleted") { fail("cancelled"); return }
        if (event.type === "session.inbox.delivered") {
          if (event.data.inboxID === promptID) delivered = true
          else if (delivered && messageID !== undefined && !controls.has(event.data.inboxID)) replaced = true
          controls.delete(event.data.inboxID)
        }
        if (input.operation === "compaction") {
          if (event.type === "session.compaction.started") compacting = event.data.inputID === promptID
          if (event.type === "session.compaction.ended" && compacting) {
            finish({ ok: true, value: { type: "succeeded" } })
            return
          }
          if (event.type === "session.compaction.failed" && event.data.inputID === promptID) {
            finish({ ok: true, value: { type: "failed", error: event.data.error } })
            return
          }
        }
        if (!delivered) continue
        if (event.type === "session.step.started" && !replaced) messageID = event.data.assistantMessageID
        if (event.type === "session.execution.succeeded") {
          finish({ ok: true, value: { type: "succeeded", messageID } })
          return
        }
        if (event.type === "session.execution.failed") {
          finish({ ok: true, value: { type: "failed", messageID, error: event.data.error } })
          return
        }
        if (event.type === "session.execution.interrupted") {
          finish({ ok: true, value: { type: "interrupted", messageID, reason: event.data.reason } })
          return
        }
      }
      if (!settled) fail("disconnected")
    } catch (cause) {
      if (!settled) fail("disconnected", cause)
    }
  })()

  return {
    ready: connected.promise,
    result: completed.promise,
    accepted: accepted.promise,
    get promptID() { return promptID },
    async close() {
      if (!settled) fail("aborted")
      await listening
    },
  }
}
