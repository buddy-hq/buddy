import type { PersistedWhiteboardElement, WhiteboardViewport } from "./whiteboard-elements"

type WhiteboardLearnerSaveInput = {
  baseBoardID: string
  elements: PersistedWhiteboardElement[]
  viewport: WhiteboardViewport
}

type WhiteboardLearnerSaveResult =
  | { status: "saved" }
  | { status: "conflict" }
  | { status: "failed" }

export type WhiteboardLearnerSaveSettlement =
  | { status: "clean" }
  | { status: "saved" }
  | { status: "save-error" }
  | { status: "conflict" }
  | { status: "still-saving" }

type WhiteboardLearnerSaveHandler = (
  input: WhiteboardLearnerSaveInput,
) => Promise<WhiteboardLearnerSaveResult>

type PendingWhiteboardLearnerSave = WhiteboardLearnerSaveInput & {
  save: WhiteboardLearnerSaveHandler
  signature: string
}

type WhiteboardLearnerSaveScheduler = {
  schedule(input: Omit<PendingWhiteboardLearnerSave, "signature">): void
  flush(): Promise<WhiteboardLearnerSaveSettlement>
  clear(): void
}

function learnerSaveSignature(input: WhiteboardLearnerSaveInput): string {
  return JSON.stringify([input.baseBoardID, input.elements, input.viewport])
}

function createWhiteboardLearnerSaveScheduler(input: {
  delayMs: number
}): WhiteboardLearnerSaveScheduler {
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: PendingWhiteboardLearnerSave | undefined
  let saving = false
  let activeSavePromise: Promise<WhiteboardLearnerSaveSettlement> | undefined
  let activeSaveToken: symbol | undefined
  let activeSaveSignature: string | undefined
  let lastSavedSignature: string | undefined

  function clearTimer(): void {
    if (!timer) return
    clearTimeout(timer)
    timer = undefined
  }

  function readPendingSave(): PendingWhiteboardLearnerSave | undefined {
    return pending
  }

  function flush(): Promise<WhiteboardLearnerSaveSettlement> {
    clearTimer()
    const next = pending
    if (saving) {
      return activeSavePromise ?? Promise.resolve({ status: "still-saving" })
    }
    if (!next) return Promise.resolve({ status: "clean" })
    pending = undefined
    const { save, signature, ...payload } = next
    saving = true
    const saveToken = Symbol("whiteboard-save")
    activeSaveToken = saveToken
    activeSaveSignature = signature
    activeSavePromise = (async () => {
      let clearActiveSave = true
      try {
        const result = await save(payload)
        const queued = readPendingSave()
        if (result.status === "conflict" && queued?.baseBoardID === next.baseBoardID) {
          pending = undefined
        }
        if (result.status === "saved") {
          lastSavedSignature = signature
        }
        if (result.status === "saved" && readPendingSave()) {
          saving = false
          activeSavePromise = undefined
          activeSaveToken = undefined
          activeSaveSignature = undefined
          clearActiveSave = false
          return flush()
        }
        if (result.status === "failed") {
          if (!queued) pending = next
        }
        if (result.status === "failed") return { status: "save-error" }
        return result
      } catch {
        if (!readPendingSave()) pending = next
        return { status: "save-error" }
      } finally {
        if (clearActiveSave && activeSaveToken === saveToken) {
          saving = false
          activeSavePromise = undefined
          activeSaveToken = undefined
          activeSaveSignature = undefined
        }
      }
    })()
    return activeSavePromise
  }

  return {
    schedule(next) {
      const signature = learnerSaveSignature(next)
      if (
        (saving && signature === activeSaveSignature) ||
        (!saving && signature === lastSavedSignature)
      ) {
        return
      }
      pending = {
        ...next,
        signature,
      }
      clearTimer()
      timer = setTimeout(() => {
        void flush()
      }, input.delayMs)
    },
    flush,
    clear() {
      pending = undefined
      if (!saving) activeSaveSignature = undefined
      lastSavedSignature = undefined
      clearTimer()
    },
  }
}

export { createWhiteboardLearnerSaveScheduler }
export type {
  WhiteboardLearnerSaveHandler,
  WhiteboardLearnerSaveInput,
  WhiteboardLearnerSaveResult,
  WhiteboardLearnerSaveScheduler,
}
