import {
  ensureProfile as ensureProfileStore,
  patchProfile as patchProfileStore,
  readProfile as readProfileStore,
  writeProfile as writeProfileStore,
} from "./store/profile.js"
import {
  listArtifacts as listArtifactsStore,
  readArtifactById as readArtifactByIdStore,
  readArtifacts as readArtifactsStore,
  upsertArtifact as upsertArtifactStore,
} from "./store/records.js"
import {
  ensureWorkspaceContext as ensureWorkspaceContextStore,
  patchWorkspaceContext as patchWorkspaceContextStore,
  readWorkspaceContext as readWorkspaceContextStore,
  writeWorkspaceContext as writeWorkspaceContextStore,
} from "./store/workspace.js"

export namespace LearnerArtifactStore {
  export const readWorkspaceContext = readWorkspaceContextStore
  export const writeWorkspaceContext = writeWorkspaceContextStore
  export const ensureWorkspaceContext = ensureWorkspaceContextStore
  export const patchWorkspaceContext = patchWorkspaceContextStore

  export const readProfile = readProfileStore
  export const writeProfile = writeProfileStore
  export const ensureProfile = ensureProfileStore
  export const patchProfile = patchProfileStore

  export const upsertArtifact = upsertArtifactStore
  export const readArtifacts = readArtifactsStore
  export const readArtifactById = readArtifactByIdStore
  export const listArtifacts = listArtifactsStore
}
