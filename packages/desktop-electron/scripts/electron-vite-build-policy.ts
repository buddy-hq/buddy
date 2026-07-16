import { pathToFileURL } from "node:url"

export type ElectronViteCommand = "build" | "serve"

export type ExternalBackendModule = {
  external: true
  id: string
}

export function resolveExternalDevelopmentBackend(
  command: ElectronViteCommand,
  backendEntry: string,
): ExternalBackendModule | undefined {
  if (command !== "serve") return undefined

  return {
    external: true,
    id: pathToFileURL(backendEntry).href,
  }
}

export function shouldCopyPackagedRuntimeAssets(command: ElectronViteCommand): boolean {
  return command === "build"
}
