import { create } from "zustand"

type WorkspaceQuestionSetObjectPanelStore = {
  selectedObjectIDByDirectory: Record<string, string | undefined>
  pendingObjectOpenByDirectory: Record<string, string | undefined>
  openQuestionSet: (directory: string, objectID: string) => void
  queueQuestionSetOpen: (directory: string, objectID: string) => void
  consumePendingOpen: (directory: string) => string | undefined
  closeQuestionSet: (directory: string) => void
}

function omitRecordKey<T>(input: Record<string, T>, keyToOmit: string): Record<string, T> {
  const { [keyToOmit]: _omitted, ...rest } = input
  return rest
}

export const useWorkspaceQuestionSetObjectPanelStore = create<WorkspaceQuestionSetObjectPanelStore>()(
  (set, get) => ({
    selectedObjectIDByDirectory: {},
    pendingObjectOpenByDirectory: {},
    openQuestionSet(directory, objectID) {
      set((state) => ({
        selectedObjectIDByDirectory: {
          ...state.selectedObjectIDByDirectory,
          [directory]: objectID,
        },
        pendingObjectOpenByDirectory: omitRecordKey(state.pendingObjectOpenByDirectory, directory),
      }))
    },
    queueQuestionSetOpen(directory, objectID) {
      set((state) => ({
        pendingObjectOpenByDirectory: {
          ...state.pendingObjectOpenByDirectory,
          [directory]: objectID,
        },
      }))
    },
    consumePendingOpen(directory): string | undefined {
      const objectID = get().pendingObjectOpenByDirectory[directory]
      if (!objectID) {
        return undefined
      }

      set((state) => ({
        pendingObjectOpenByDirectory: omitRecordKey(state.pendingObjectOpenByDirectory, directory),
      }))

      return objectID
    },
    closeQuestionSet(directory) {
      set((state) => ({
        selectedObjectIDByDirectory: omitRecordKey(
          state.selectedObjectIDByDirectory,
          directory,
        ),
        pendingObjectOpenByDirectory: omitRecordKey(state.pendingObjectOpenByDirectory, directory),
      }))
    },
  }),
)
