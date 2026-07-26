import { readFileSync, watch } from "node:fs"
import { readFile } from "node:fs/promises"

export const BACKEND_DEVELOPMENT_RELOAD_SIGNAL_ENV =
  "BUDDY_ELECTRON_DEV_BACKEND_RELOAD_SIGNAL" as const
export const BACKEND_DEVELOPMENT_RELOAD_ACKNOWLEDGEMENT_ENV =
  "BUDDY_ELECTRON_DEV_BACKEND_RELOAD_ACKNOWLEDGEMENT" as const

const DEVELOPMENT_GENERATION_DEBOUNCE_MS = 50

type DevelopmentGenerationWatcherInput = {
  generationPath: string
  onError: (error: unknown) => void
  onGeneration: (generation: string) => Promise<void>
}

export function watchDevelopmentGenerationFile(
  input: DevelopmentGenerationWatcherInput,
): () => void {
  let closed = false
  let lastGeneration: string
  let generationQueue = Promise.resolve()
  let generationTimer: ReturnType<typeof setTimeout> | undefined

  try {
    lastGeneration = readFileSync(input.generationPath, "utf8")
  } catch (error) {
    input.onError(error)
    return () => undefined
  }

  const readGeneration = async () => {
    try {
      return await readFile(input.generationPath, "utf8")
    } catch (error) {
      input.onError(error)
      return undefined
    }
  }

  const queueGeneration = async () => {
    const generation = await readGeneration()
    if (closed || generation === undefined || generation === lastGeneration) return
    lastGeneration = generation
    generationQueue = generationQueue
      .then(() => input.onGeneration(generation))
      .catch(input.onError)
  }

  const scheduleGeneration = () => {
    if (closed) return
    if (generationTimer) clearTimeout(generationTimer)
    generationTimer = setTimeout(() => {
      generationTimer = undefined
      void queueGeneration()
    }, DEVELOPMENT_GENERATION_DEBOUNCE_MS)
  }

  const watcher = watch(input.generationPath, { persistent: false }, scheduleGeneration)
  watcher.on("error", input.onError)
  // Re-read after subscribing so a write that lands between the initial read
  // and watcher registration cannot be missed.
  void queueGeneration()

  return () => {
    if (closed) return
    closed = true
    if (generationTimer) clearTimeout(generationTimer)
    watcher.close()
  }
}
