import { listLiveDirectoryWorkspaces } from "@/lib/directory-workspace-registry"
import {
  removePersistedNotesBenchTargets,
  type DirectoryWorkspacePersistenceStorage,
  type NotesBenchTargetMatcher,
} from "@/state/directory-workspace-store"

export async function invalidateNotesBenchTargets(input?: {
  storage?: DirectoryWorkspacePersistenceStorage
  matches?: NotesBenchTargetMatcher
}): Promise<void> {
  await Promise.all(
    listLiveDirectoryWorkspaces().map((workspace) =>
      workspace.removeNotesBenchTargets(input?.matches),
    ),
  )
  await removePersistedNotesBenchTargets(input)
}
