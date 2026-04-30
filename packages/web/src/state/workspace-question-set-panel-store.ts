import { create } from "zustand"

type WorkspaceQuestionSetPanelStore = {
  selectedArtifactIDByDirectory: Record<string, string | undefined>
  pendingOpenByDirectory: Record<string, string | undefined>
  openQuestionSet: (directory: string, artifactID: string) => void
  queueQuestionSetOpen: (directory: string, artifactID: string) => void
  consumePendingOpen: (directory: string) => string | undefined
  closeQuestionSet: (directory: string) => void
}

function omitRecordKey<T>(input: Record<string, T>, keyToOmit: string): Record<string, T> {
  const { [keyToOmit]: _omitted, ...rest } = input
  return rest
}

export const useWorkspaceQuestionSetPanelStore = create<WorkspaceQuestionSetPanelStore>()(
  (set, get) => ({
    selectedArtifactIDByDirectory: {},
    pendingOpenByDirectory: {},
    openQuestionSet(directory, artifactID) {
      set((state) => ({
        selectedArtifactIDByDirectory: {
          ...state.selectedArtifactIDByDirectory,
          [directory]: artifactID,
        },
        pendingOpenByDirectory: omitRecordKey(state.pendingOpenByDirectory, directory),
      }))
    },
    queueQuestionSetOpen(directory, artifactID) {
      set((state) => ({
        pendingOpenByDirectory: {
          ...state.pendingOpenByDirectory,
          [directory]: artifactID,
        },
      }))
    },
    consumePendingOpen(directory): string | undefined {
      const artifactID = get().pendingOpenByDirectory[directory]
      if (!artifactID) {
        return undefined
      }

      set((state) => ({
        pendingOpenByDirectory: omitRecordKey(state.pendingOpenByDirectory, directory),
      }))

      return artifactID
    },
    closeQuestionSet(directory) {
      set((state) => ({
        selectedArtifactIDByDirectory: omitRecordKey(
          state.selectedArtifactIDByDirectory,
          directory,
        ),
        pendingOpenByDirectory: omitRecordKey(state.pendingOpenByDirectory, directory),
      }))
    },
  }),
)
