import { watchDevelopmentGenerationFile } from "../shared/backend-development-reload"

type TBackendDevelopmentReloadWatcherInput = {
  readonly onError: (error: Error) => void
  readonly onReload: (generation: string) => Promise<void>
  readonly signalPath: string
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
