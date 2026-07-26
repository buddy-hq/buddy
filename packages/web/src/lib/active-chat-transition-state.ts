export type ActiveChatTransitionID = number

const ACTIVE_CHAT_LAYOUT_READY_TIMEOUT_MS = 2_500

type ActiveChatLayoutWaiter = {
  transitionID: ActiveChatTransitionID
  timeout: ReturnType<typeof setTimeout>
  resolve: () => void
}

let activeTransitionID: ActiveChatTransitionID = 0
let layoutMotionSuppressed = false
let paintReadyTransitionID: ActiveChatTransitionID | undefined
let layoutReadyRequiredTransitionID: ActiveChatTransitionID | undefined
let layoutReadyTransitionID: ActiveChatTransitionID | undefined
let releaseTimeout: ReturnType<typeof setTimeout> | undefined
const layoutMotionListeners = new Set<() => void>()
const layoutReadyWaiters = new Set<ActiveChatLayoutWaiter>()

function resolveLayoutReadyWaiters(transitionID?: ActiveChatTransitionID): void {
  for (const waiter of layoutReadyWaiters) {
    if (transitionID !== undefined && waiter.transitionID !== transitionID) continue
    layoutReadyWaiters.delete(waiter)
    clearTimeout(waiter.timeout)
    waiter.resolve()
  }
}

function clearReleaseTimeout(): void {
  if (releaseTimeout === undefined) return
  clearTimeout(releaseTimeout)
  releaseTimeout = undefined
}

function setLayoutMotionSuppressed(suppressed: boolean): void {
  if (layoutMotionSuppressed === suppressed) return
  layoutMotionSuppressed = suppressed
  for (const listener of layoutMotionListeners) {
    listener()
  }
}

export function beginActiveChatTransition(): ActiveChatTransitionID {
  activeTransitionID += 1
  clearReleaseTimeout()
  resolveLayoutReadyWaiters()
  paintReadyTransitionID = undefined
  layoutReadyRequiredTransitionID = undefined
  layoutReadyTransitionID = undefined
  setLayoutMotionSuppressed(true)
  return activeTransitionID
}

export function isActiveChatTransition(transitionID: ActiveChatTransitionID): boolean {
  return transitionID === activeTransitionID
}

export function readActiveChatLayoutMotionSuppressed(): boolean {
  return layoutMotionSuppressed
}

export function subscribeActiveChatLayoutMotion(listener: () => void): () => void {
  layoutMotionListeners.add(listener)
  return () => {
    layoutMotionListeners.delete(listener)
  }
}

export function readActiveChatTransitionID(): ActiveChatTransitionID {
  return activeTransitionID
}

function releaseActiveChatLayoutMotion(transitionID: ActiveChatTransitionID): void {
  if (!isActiveChatTransition(transitionID)) return
  clearReleaseTimeout()
  resolveLayoutReadyWaiters(transitionID)
  paintReadyTransitionID = undefined
  layoutReadyRequiredTransitionID = undefined
  layoutReadyTransitionID = undefined
  setLayoutMotionSuppressed(false)
}

function releaseActiveChatLayoutMotionIfReady(transitionID: ActiveChatTransitionID): void {
  if (!isActiveChatTransition(transitionID)) return
  if (paintReadyTransitionID !== transitionID) return
  if (
    layoutReadyRequiredTransitionID === transitionID &&
    layoutReadyTransitionID !== transitionID
  ) {
    return
  }
  releaseActiveChatLayoutMotion(transitionID)
}

/**
 * A destination transcript registers during its first layout effect. This keeps the transition
 * curtain up while its virtual rows measure at the destination workspace width without changing
 * the transcript's mount, cache, or autoscroll lifecycle.
 */
export function registerActiveChatDestinationLayout(transitionID: ActiveChatTransitionID): boolean {
  if (!layoutMotionSuppressed || !isActiveChatTransition(transitionID)) return false
  layoutReadyRequiredTransitionID = transitionID
  return true
}

export function markActiveChatDestinationLayoutReady(transitionID: ActiveChatTransitionID): void {
  if (layoutReadyRequiredTransitionID !== transitionID) return
  if (!isActiveChatTransition(transitionID)) return
  layoutReadyTransitionID = transitionID
  resolveLayoutReadyWaiters(transitionID)
  releaseActiveChatLayoutMotionIfReady(transitionID)
}

/**
 * A native view transition uses this promise as its async update boundary. Chromium keeps the
 * outgoing pixels on screen while the destination transcript mounts, parses visible Markdown,
 * and settles its virtual row geometry.
 */
export async function waitForActiveChatDestinationLayout(
  transitionID: ActiveChatTransitionID,
): Promise<void> {
  // React commits the keyed destination transcript after the store/navigation mutation. Give its
  // layout effect one task to register before deciding that this transition has no transcript.
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })

  if (!isActiveChatTransition(transitionID)) return
  if (layoutReadyTransitionID === transitionID) return
  if (layoutReadyRequiredTransitionID !== transitionID) return

  await new Promise<void>((resolve) => {
    const waiter: ActiveChatLayoutWaiter = {
      transitionID,
      timeout: setTimeout(() => {
        layoutReadyWaiters.delete(waiter)
        resolve()
      }, ACTIVE_CHAT_LAYOUT_READY_TIMEOUT_MS),
      resolve,
    }
    layoutReadyWaiters.add(waiter)
  })
}

export function releaseActiveChatLayoutMotionAfterPaint(
  transitionID: ActiveChatTransitionID,
): void {
  if (typeof globalThis.requestAnimationFrame !== "function") {
    releaseActiveChatLayoutMotion(transitionID)
    return
  }

  globalThis.requestAnimationFrame(() => {
    globalThis.requestAnimationFrame(() => {
      if (!isActiveChatTransition(transitionID)) return
      paintReadyTransitionID = transitionID
      if (layoutReadyRequiredTransitionID === transitionID) {
        clearReleaseTimeout()
        releaseTimeout = setTimeout(() => {
          releaseTimeout = undefined
          releaseActiveChatLayoutMotion(transitionID)
        }, ACTIVE_CHAT_LAYOUT_READY_TIMEOUT_MS)
      }
      releaseActiveChatLayoutMotionIfReady(transitionID)
    })
  })
}

export function resetActiveChatTransitionStateForTests(): void {
  clearReleaseTimeout()
  resolveLayoutReadyWaiters()
  activeTransitionID = 0
  paintReadyTransitionID = undefined
  layoutReadyRequiredTransitionID = undefined
  layoutReadyTransitionID = undefined
  setLayoutMotionSuppressed(false)
}
