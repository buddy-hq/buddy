import { watchDevelopmentGenerationFile } from "../shared/backend-development-reload"

type BackendDevelopmentReloadWatcherInput = {
  onError: (error: unknown) => void
  onReload: (generation: string) => Promise<void>
  signalPath: string
}

export function watchBackendDevelopmentReloadSignal(
  input: BackendDevelopmentReloadWatcherInput,
): () => void {
  return watchDevelopmentGenerationFile({
    generationPath: input.signalPath,
    onError: input.onError,
    onGeneration: input.onReload,
  })
}
