import type { PersistedWhiteboardElement, WhiteboardViewport } from "./whiteboard-elements"

type WhiteboardLearnerSaveInput = {
  baseBoardID: string
  elements: PersistedWhiteboardElement[]
  viewport: WhiteboardViewport
}

type WhiteboardLearnerSaveResult =
  | { status: "saved" }
  | { status: "skipped" | "failed" }

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
        if (result.status === "skipped" && queued?.baseBoardID === next.baseBoardID) {
          pending = undefined
        }
        if (result.status !== "failed" && readPendingSave()) {
          saving = false
          activeSavePromise = undefined
          activeSaveToken = undefined
          clearActiveSave = false
          return flush()
        }
        if (result.status === "failed") {
          if (!queued) pending = next
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

export { createWhiteboardLearnerSaveScheduler }
export type {
  WhiteboardLearnerSaveHandler,
  WhiteboardLearnerSaveInput,
  WhiteboardLearnerSaveResult,
}
