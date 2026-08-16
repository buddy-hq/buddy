import { watchDevelopmentGenerationFile } from "../shared/backend-development-reload"

type TBackendDevelopmentReloadWatcherInput = {
  onError: <TError>(error: TError) => void
  onReload: (generation: string) => Promise<void>
  signalPath: string
}

export function watchBackendDevelopmentReloadSignal(
  input: TBackendDevelopmentReloadWatcherInput,
): () => void {
  return watchDevelopmentGenerationFile({
    generationPath: input.signalPath,
    onError: input.onError,
    onGeneration: input.onReload,
  })
}
