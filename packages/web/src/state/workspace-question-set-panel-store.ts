import { create } from "zustand"
import { immer } from "zustand/middleware/immer"

type WorkspaceQuestionSetPanelStore = {
  selectedArtifactIDByDirectory: Record<string, string | undefined>
  openQuestionSet: (directory: string, artifactID: string) => void
  closeQuestionSet: (directory: string) => void
}

export const useWorkspaceQuestionSetPanelStore = create<WorkspaceQuestionSetPanelStore>()(
  immer((set) => ({
    selectedArtifactIDByDirectory: {},
    openQuestionSet(directory, artifactID) {
      set((state) => {
        state.selectedArtifactIDByDirectory[directory] = artifactID
      })
    },
    closeQuestionSet(directory) {
      set((state) => {
        delete state.selectedArtifactIDByDirectory[directory]
      })
    },
  })),
)
