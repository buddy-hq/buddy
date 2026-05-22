import { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent"
import { registerOpenCodeZenProvider } from "./opencode-zen-provider"
import { piAuthFilePath, piModelsFilePath } from "./paths"

let authStorageSingleton: AuthStorage | undefined
let modelRegistrySingleton: ModelRegistry | undefined

export function getPiAuthStorage() {
  if (!authStorageSingleton) {
    authStorageSingleton = AuthStorage.create(piAuthFilePath())
  }
  return authStorageSingleton
}

export function getPiModelRegistry() {
  if (!modelRegistrySingleton) {
    modelRegistrySingleton = ModelRegistry.create(getPiAuthStorage(), piModelsFilePath())
    registerOpenCodeZenProvider(modelRegistrySingleton)
  }
  return modelRegistrySingleton
}

export function refreshPiModels() {
  getPiAuthStorage().reload()
  getPiModelRegistry().refresh()
}
