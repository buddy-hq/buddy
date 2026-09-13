import { listLiveDirectoryWorkspaces } from "@/lib/directory-workspace-registry"
import {
  removePersistedNotesBenchTargets,
  type DirectoryWorkspacePersistenceStorage,
} from "@/state/directory-workspace-store"

export async function invalidateNotesBenchTargets(input?: {
  storage?: DirectoryWorkspacePersistenceStorage
}): Promise<void> {
  await Promise.all(
    listLiveDirectoryWorkspaces().map((workspace) => workspace.removeNotesBenchTargets()),
  )
  await removePersistedNotesBenchTargets(input)
}
