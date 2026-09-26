import { listLiveDirectoryWorkspaces } from "@/lib/directory-workspace-registry"
import { useHostedBrowserStore } from "@/state/hosted-browser-store"
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
  useHostedBrowserStore.getState().invalidateNotesTargets(input?.matches)
  await removePersistedNotesBenchTargets(input)
}
