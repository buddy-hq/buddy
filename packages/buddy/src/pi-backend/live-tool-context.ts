import crypto from "node:crypto"
import type { ExtensionContext } from "@earendil-works/pi-coding-agent"
import type { PiAgentMessage } from "./types"

type PiToolContext = ExtensionContext

function createAbortError() {
  return new DOMException("Aborted", "AbortError")
}

export function livePiSessionID(context: PiToolContext | undefined) {
  return context
    ? context.sessionManager.getSessionId()
    : `ses_${crypto.randomUUID().replaceAll("-", "")}`
}

export function livePiMessageID(context: PiToolContext | undefined) {
  return context?.sessionManager.getLeafId()
    ? `msg_${context.sessionManager.getLeafId()}`
    : `msg_${crypto.randomUUID().replaceAll("-", "")}`
}

function hasBuildSessionContext(
  value: PiToolContext["sessionManager"],
): value is PiToolContext["sessionManager"] & {
  buildSessionContext(): {
    messages: readonly PiAgentMessage[]
  }
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "buildSessionContext" in value &&
    typeof value.buildSessionContext === "function"
  )
}

export function livePiSessionMessages(
  context: PiToolContext | undefined,
): readonly PiAgentMessage[] {
  if (!context || !hasBuildSessionContext(context.sessionManager)) {
    return []
  }

  return context.sessionManager.buildSessionContext().messages
}

export async function executeUntilAbort<T>(abort: AbortSignal, execute: () => Promise<T>) {
  abort.throwIfAborted()

  let onAbort: (() => void) | undefined
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(createAbortError())
    abort.addEventListener("abort", onAbort, { once: true })
  })

  try {
    const result = await Promise.race([execute(), aborted])
    abort.throwIfAborted()
    return result
  } finally {
    if (onAbort) {
      abort.removeEventListener("abort", onAbort)
    }
  }
}
