import { readFileSync, watch } from "node:fs"
import { readFile } from "node:fs/promises"

export const BACKEND_DEVELOPMENT_RELOAD_SIGNAL_ENV =
  "BUDDY_ELECTRON_DEV_BACKEND_RELOAD_SIGNAL" as const
export const BACKEND_DEVELOPMENT_RELOAD_ACKNOWLEDGEMENT_ENV =
  "BUDDY_ELECTRON_DEV_BACKEND_RELOAD_ACKNOWLEDGEMENT" as const

const DEVELOPMENT_GENERATION_DEBOUNCE_MS = 50

type TDevelopmentGenerationWatcherInput = {
  readonly generationPath: string
  readonly onError: (error: Error) => void
  readonly onGeneration: (generation: string) => Promise<void>
}

export function watchDevelopmentGenerationFile(
  input: TDevelopmentGenerationWatcherInput,
): () => void {
  let closed = false
  let lastGeneration: string
  let generationQueue = Promise.resolve()
  let generationTimer: ReturnType<typeof setTimeout> | undefined

  const reportReloadError = <TError>(error: TError) => {
    input.onError(error instanceof Error ? error : new Error(String(error)))
  }

  try {
    lastGeneration = readFileSync(input.generationPath, "utf8")
  } catch (error) {
    reportReloadError(error)
    return () => undefined
  }

  const readGeneration = async () => {
    try {
      return await readFile(input.generationPath, "utf8")
    } catch (error) {
      if (!closed) reportReloadError(error)
      return undefined
    }
  }

  const queueGeneration = async () => {
    if (closed) return
    const generation = await readGeneration()
    if (closed || generation === undefined || generation === lastGeneration) return
    lastGeneration = generation
    generationQueue = generationQueue
      .then(async () => {
        if (!closed) await input.onGeneration(generation)
      })
      .catch(reportReloadError)
  }

  const scheduleGeneration = () => {
    if (closed) return
    if (generationTimer) clearTimeout(generationTimer)
    generationTimer = setTimeout(() => {
      generationTimer = undefined
      void queueGeneration()
    }, DEVELOPMENT_GENERATION_DEBOUNCE_MS)
  }

  let watcher: ReturnType<typeof watch>
  try {
    watcher = watch(input.generationPath, { persistent: false }, scheduleGeneration)
  } catch (error) {
    reportReloadError(error)
    return () => undefined
  }
  watcher.on("error", input.onError)
  void queueGeneration()

  return () => {
    if (closed) return
    closed = true
    if (generationTimer) clearTimeout(generationTimer)
    watcher.close()
  }
}
