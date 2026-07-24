import type { DirectoryWorkspaceController } from "@/lib/directory-workspace-controller"
import { canonicalProjectDirectory } from "@/lib/project-directory"
import type { BenchRouteSnapshot } from "@/state/directory-workspace-store"

export type LiveDirectoryWorkspaceHandle = {
  directory: string
  controller: DirectoryWorkspaceController
  getRoute: () => BenchRouteSnapshot
  setActiveSessionContext: (sessionID: string | undefined) => Promise<void>
  persist: () => Promise<void>
  isDisposed: () => boolean
}

type RegisteredDirectoryWorkspaceHandle = LiveDirectoryWorkspaceHandle & {
  generation: number
}

const liveWorkspaceByDirectory = new Map<string, RegisteredDirectoryWorkspaceHandle>()
let workspaceGeneration = 0

export function registerLiveDirectoryWorkspace(
  handle: LiveDirectoryWorkspaceHandle,
): () => void {
  const directory = canonicalProjectDirectory(handle.directory)
  if (!directory) return () => undefined
  workspaceGeneration += 1
  const registration = {
    ...handle,
    directory,
    generation: workspaceGeneration,
  }
  liveWorkspaceByDirectory.set(directory, registration)

  return () => {
    const current = liveWorkspaceByDirectory.get(directory)
    if (
      current?.generation === registration.generation &&
      current.controller === registration.controller
    ) {
      liveWorkspaceByDirectory.delete(directory)
    }
  }
}

export function getLiveDirectoryWorkspace(
  directory: string,
): LiveDirectoryWorkspaceHandle | undefined {
  const canonicalDirectory = canonicalProjectDirectory(directory)
  if (!canonicalDirectory) return undefined
  const registration = liveWorkspaceByDirectory.get(canonicalDirectory)
  if (!registration) return undefined
  if (registration.isDisposed()) {
    liveWorkspaceByDirectory.delete(canonicalDirectory)
    return undefined
  }
  return registration
}

export function resetLiveDirectoryWorkspaceRegistryForTests(): void {
  liveWorkspaceByDirectory.clear()
  workspaceGeneration = 0
}
