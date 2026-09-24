export type NoteMessageTarget = {
  directory: string
  sessionID: string
  messageID: string
}

export type NoteMessageNavigationResult = "handled" | "pending" | "missing" | "unowned"
export type NoteMessageNavigationHandler = (
  target: NoteMessageTarget,
) => NoteMessageNavigationResult | Promise<NoteMessageNavigationResult>

const PENDING_NAVIGATION_TIMEOUT_MS = 15_000

const handlers = new Set<NoteMessageNavigationHandler>()
let pending: { target: NoteMessageTarget; expiresAt: number } | undefined
let offering: Promise<void> | undefined
let offerAgain = false

function sameTarget(left: NoteMessageTarget | undefined, right: NoteMessageTarget): boolean {
  return (
    left?.directory === right.directory &&
    left.sessionID === right.sessionID &&
    left.messageID === right.messageID
  )
}

async function offerTarget(handler: NoteMessageNavigationHandler, target: NoteMessageTarget) {
  try {
    const result = await handler(target)
    if (pending && sameTarget(pending.target, target)) {
      if (result === "handled" || result === "missing") pending = undefined
      else if (result === "pending") pending.expiresAt = Date.now() + PENDING_NAVIGATION_TIMEOUT_MS
    }
    return result
  } catch {
    return "unowned" as const
  }
}

async function offerPendingTargetOnce(): Promise<void> {
  if (pending && Date.now() > pending.expiresAt) pending = undefined
  const target = pending?.target
  if (!target) return
  for (const handler of [...handlers].toReversed()) {
    const result = await offerTarget(handler, target)
    if (result !== "unowned") return
  }
}

function offerPendingTarget(): Promise<void> {
  if (offering) {
    offerAgain = true
    return offering
  }
  offering = (async () => {
    do {
      offerAgain = false
      await offerPendingTargetOnce()
    } while (offerAgain)
  })().finally(() => {
    offering = undefined
  })
  return offering
}

/** Register a mounted transcript that can reveal a message from a note. */
export function registerNoteMessageNavigationHandler(
  handler: NoteMessageNavigationHandler,
): () => void {
  handlers.add(handler)
  if (pending) void offerPendingTarget()
  return () => handlers.delete(handler)
}

/** Keep the request pending while navigation mounts the destination transcript. */
export async function requestNoteMessageNavigation(target: NoteMessageTarget): Promise<void> {
  pending = { target, expiresAt: Date.now() + PENDING_NAVIGATION_TIMEOUT_MS }
  await offerPendingTarget()
}

/** Retry after transcript rows or pagination state changes without re-registering the handler. */
export async function retryPendingNoteMessageNavigation(): Promise<void> {
  await offerPendingTarget()
}
