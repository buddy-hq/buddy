import type { PersistedWhiteboardElement, WhiteboardViewport } from "./whiteboard-elements"

type WhiteboardLearnerSaveInput = {
  elements: PersistedWhiteboardElement[]
  viewport: WhiteboardViewport
  baseRevisionID?: string
}

type WhiteboardLearnerSaveResult =
  | { status: "saved"; baseRevisionID: string }
  | { status: "skipped" | "failed"; baseRevisionID?: string }

type WhiteboardLearnerSaveHandler = (
  input: WhiteboardLearnerSaveInput,
) => Promise<WhiteboardLearnerSaveResult>

type PendingWhiteboardLearnerSave = WhiteboardLearnerSaveInput & {
  save: WhiteboardLearnerSaveHandler
}

type WhiteboardLearnerSaveScheduler = {
  schedule(input: PendingWhiteboardLearnerSave): void
  flush(): Promise<boolean>
  clear(): void
}

function whiteboardElementsSignature(elements: PersistedWhiteboardElement[]): string {
  return JSON.stringify(elements)
}

function isLearnerEditContentAlreadyDurable(input: {
  latestElements: PersistedWhiteboardElement[] | undefined
  elements: PersistedWhiteboardElement[]
}): boolean {
  if (!input.latestElements) return false
  return (
    whiteboardElementsSignature(input.latestElements) ===
    whiteboardElementsSignature(input.elements)
  )
}

function createWhiteboardLearnerSaveScheduler(input: {
  delayMs: number
}): WhiteboardLearnerSaveScheduler {
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: PendingWhiteboardLearnerSave | undefined
  let saving = false
  let activeSavePromise: Promise<boolean> | undefined
  let activeSaveToken: symbol | undefined

  function clearTimer(): void {
    if (!timer) return
    clearTimeout(timer)
    timer = undefined
  }

  function readPendingSave(): PendingWhiteboardLearnerSave | undefined {
    return pending
  }

  function flush(): Promise<boolean> {
    clearTimer()
    const next = pending
    if (saving) {
      return activeSavePromise ?? Promise.resolve(true)
    }
    if (!next) return Promise.resolve(true)
    pending = undefined
    const { save, ...payload } = next
    saving = true
    const saveToken = Symbol("whiteboard-save")
    activeSaveToken = saveToken
    activeSavePromise = (async () => {
      let clearActiveSave = true
      try {
        const result = await save(payload)
        const queued = readPendingSave()
        if (queued && result.baseRevisionID) {
          pending = {
            ...queued,
            baseRevisionID: result.baseRevisionID,
          }
          saving = false
          activeSavePromise = undefined
          activeSaveToken = undefined
          clearActiveSave = false
          return flush()
        }
        if (result.status === "failed") {
          const retry = queued ?? next
          pending = result.baseRevisionID
            ? { ...retry, baseRevisionID: result.baseRevisionID }
            : retry
        }
        return result.status === "saved"
      } catch {
        if (!readPendingSave()) pending = next
        return false
      } finally {
        if (clearActiveSave && activeSaveToken === saveToken) {
          saving = false
          activeSavePromise = undefined
          activeSaveToken = undefined
        }
      }
    })()
    return activeSavePromise
  }

  return {
    schedule(next) {
      pending = next
      clearTimer()
      timer = setTimeout(() => {
        void flush()
      }, input.delayMs)
    },
    flush,
    clear() {
      pending = undefined
      clearTimer()
    },
  }
}

export { createWhiteboardLearnerSaveScheduler, isLearnerEditContentAlreadyDurable }
export type {
  WhiteboardLearnerSaveHandler,
  WhiteboardLearnerSaveInput,
  WhiteboardLearnerSaveResult,
}
