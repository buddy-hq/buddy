import { create } from "zustand"
import { immer } from "zustand/middleware/immer"

const emptySelectedArtifactIDByDirectory = {} as Record<string, string | undefined>
const emptyPendingOpenByDirectory = {} as Record<string, string | undefined>

type WorkspaceQuestionSetPanelStore = {
  selectedArtifactIDByDirectory: Record<string, string | undefined>
  pendingOpenByDirectory: Record<string, string | undefined>
  openQuestionSet: (directory: string, artifactID: string) => void
  queueQuestionSetOpen: (directory: string, artifactID: string) => void
  consumePendingOpen: (directory: string) => string | undefined
  closeQuestionSet: (directory: string) => void
}

export const useWorkspaceQuestionSetPanelStore = create<WorkspaceQuestionSetPanelStore>()(
  immer((set, get) => ({
    selectedArtifactIDByDirectory: emptySelectedArtifactIDByDirectory,
    pendingOpenByDirectory: emptyPendingOpenByDirectory,
    openQuestionSet(directory, artifactID) {
      set((state) => {
        state.selectedArtifactIDByDirectory[directory] = artifactID
        delete state.pendingOpenByDirectory[directory]
      })
    },
    queueQuestionSetOpen(directory, artifactID) {
      set((state) => {
        state.pendingOpenByDirectory[directory] = artifactID
      })
    },
    consumePendingOpen(directory): string | undefined {
      const artifactID = get().pendingOpenByDirectory[directory]
      if (!artifactID) {
        return undefined
      }

      set((state) => {
        delete state.pendingOpenByDirectory[directory]
      })

      return artifactID
    },
    closeQuestionSet(directory) {
      set((state) => {
        delete state.selectedArtifactIDByDirectory[directory]
        delete state.pendingOpenByDirectory[directory]
      })
    },
  })),
)
