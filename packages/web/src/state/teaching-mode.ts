import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

export const TEACHING_MODE_STORAGE_KEY = "buddy.teaching.v1"

export type TeachingLanguage = "ts" | "tsx"

export type TeachingSelection = {
  selectionStartLine?: number
  selectionStartColumn?: number
  selectionEndLine?: number
  selectionEndColumn?: number
}

export type TeachingWorkspace = {
  sessionID: string
  workspaceRoot: string
  language: TeachingLanguage
  lessonFilePath: string
  checkpointFilePath: string
  revision: number
  code: string
}

export type TeachingPromptContext = {
  active: boolean
  sessionID: string
  lessonFilePath: string
  checkpointFilePath: string
  language: TeachingLanguage
  revision: number
} & TeachingSelection

export type TeachingConflict = {
  code: string
  revision: number
  lessonFilePath: string
}

export type TeachingWorkspaceState = TeachingWorkspace & {
  savedCode: string
  pendingSave: boolean
  saveError?: string
  conflict?: TeachingConflict
  selection?: TeachingSelection
}

export type TeachingModeState = {
  selectedAgentBySession: Record<string, string>
  workspaceBySession: Record<string, TeachingWorkspaceState>
  setSessionAgent: (sessionKey: string, agent: string) => void
  setWorkspace: (sessionKey: string, workspace: TeachingWorkspace) => void
  updateWorkspaceCode: (sessionKey: string, code: string) => void
  setSelection: (sessionKey: string, selection?: TeachingSelection) => void
  setPendingSave: (sessionKey: string, pending: boolean) => void
  setSaveError: (sessionKey: string, error?: string) => void
  applySaveSuccess: (sessionKey: string, input: { requestCode: string; workspace: TeachingWorkspace }) => void
  setConflict: (sessionKey: string, conflict?: TeachingConflict) => void
  loadConflictVersion: (sessionKey: string) => void
  applyRemoteSnapshot: (sessionKey: string, workspace: TeachingWorkspace) => void
}

export function teachingSessionKey(directory: string, sessionID: string) {
  return `${directory}::${sessionID}`
}

function withWorkspace(
  state: TeachingModeState,
  sessionKey: string,
  fn: (workspace: TeachingWorkspaceState) => TeachingWorkspaceState,
) {
  const current = state.workspaceBySession[sessionKey]
  if (!current) return state.workspaceBySession
  return {
    ...state.workspaceBySession,
    [sessionKey]: fn(current),
  }
}

export const useTeachingMode = create<TeachingModeState>()(
  persist(
    (set) => ({
      selectedAgentBySession: {},
      workspaceBySession: {},
      setSessionAgent(sessionKey, agent) {
        set((state) => ({
          selectedAgentBySession: {
            ...state.selectedAgentBySession,
            [sessionKey]: agent,
          },
        }))
      },
      setWorkspace(sessionKey, workspace) {
        set((state) => {
          const current = state.workspaceBySession[sessionKey]
          return {
            workspaceBySession: {
              ...state.workspaceBySession,
              [sessionKey]: {
                ...workspace,
                savedCode: workspace.code,
                pendingSave: false,
                saveError: undefined,
                conflict: undefined,
                selection: current?.selection,
              },
            },
          }
        })
      },
      updateWorkspaceCode(sessionKey, code) {
        set((state) => ({
          workspaceBySession: withWorkspace(state, sessionKey, (workspace) => ({
            ...workspace,
            code,
          })),
        }))
      },
      setSelection(sessionKey, selection) {
        set((state) => ({
          workspaceBySession: withWorkspace(state, sessionKey, (workspace) => ({
            ...workspace,
            selection,
          })),
        }))
      },
      setPendingSave(sessionKey, pending) {
        set((state) => ({
          workspaceBySession: withWorkspace(state, sessionKey, (workspace) => ({
            ...workspace,
            pendingSave: pending,
          })),
        }))
      },
      setSaveError(sessionKey, error) {
        set((state) => ({
          workspaceBySession: withWorkspace(state, sessionKey, (workspace) => ({
            ...workspace,
            saveError: error,
          })),
        }))
      },
      applySaveSuccess(sessionKey, input) {
        set((state) => ({
          workspaceBySession: withWorkspace(state, sessionKey, (workspace) => ({
            ...workspace,
            ...input.workspace,
            code: workspace.code === input.requestCode ? input.workspace.code : workspace.code,
            savedCode: input.workspace.code,
            pendingSave: false,
            saveError: undefined,
            conflict: undefined,
            selection: workspace.selection,
          })),
        }))
      },
      setConflict(sessionKey, conflict) {
        set((state) => ({
          workspaceBySession: withWorkspace(state, sessionKey, (workspace) => ({
            ...workspace,
            pendingSave: false,
            conflict,
          })),
        }))
      },
      loadConflictVersion(sessionKey) {
        set((state) => ({
          workspaceBySession: withWorkspace(state, sessionKey, (workspace) => {
            if (!workspace.conflict) return workspace
            return {
              ...workspace,
              code: workspace.conflict.code,
              savedCode: workspace.conflict.code,
              revision: workspace.conflict.revision,
              lessonFilePath: workspace.conflict.lessonFilePath,
              conflict: undefined,
              saveError: undefined,
              pendingSave: false,
            }
          }),
        }))
      },
      applyRemoteSnapshot(sessionKey, workspace) {
        set((state) => {
          const current = state.workspaceBySession[sessionKey]
          if (!current) {
            return {
              workspaceBySession: {
                ...state.workspaceBySession,
                [sessionKey]: {
                  ...workspace,
                  savedCode: workspace.code,
                  pendingSave: false,
                },
              },
            }
          }

          const hasLocalEdits = current.code !== current.savedCode

          if (current.code === workspace.code || !hasLocalEdits) {
            return {
              workspaceBySession: {
                ...state.workspaceBySession,
                [sessionKey]: {
                  ...current,
                  ...workspace,
                  code: workspace.code,
                  savedCode: workspace.code,
                  saveError: undefined,
                  pendingSave: false,
                  conflict: undefined,
                },
              },
            }
          }

          return {
            workspaceBySession: {
              ...state.workspaceBySession,
              [sessionKey]: {
                ...current,
                pendingSave: false,
                conflict: {
                  code: workspace.code,
                  revision: workspace.revision,
                  lessonFilePath: workspace.lessonFilePath,
                },
              },
            },
          }
        })
      },
    }),
    {
      name: TEACHING_MODE_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      migrate(persistedState) {
        const state = persistedState as Partial<TeachingModeState> | undefined
        return {
          selectedAgentBySession: state?.selectedAgentBySession ?? {},
          workspaceBySession: {},
        }
      },
      partialize(state) {
        return {
          selectedAgentBySession: state.selectedAgentBySession,
        }
      },
    },
  ),
)
