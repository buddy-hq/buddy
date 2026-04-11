import { create } from "zustand"
import { persist } from "zustand/middleware"
import { immer } from "zustand/middleware/immer"
import { createPlatformJsonStorage } from "../context/platform"

export const UI_PREFERENCES_STORAGE_KEY = "buddy.ui.v1"

export type NotebookMainPaneTab =
  | "chat"
  | "resources"
  | "diagrams"
  | "instructions"
  | "question-set"

type UiPreferencesStore = {
  pinnedByDirectory: Record<string, string[]>
  unreadByDirectory: Record<string, Record<string, true>>
  leftSidebarOpen: boolean
  leftSidebarWidth: number
  rightSidebarOpen: boolean
  rightSidebarWidth: number
  mainPaneTab: NotebookMainPaneTab
  rightSidebarTab:
    | "curriculum"
    | "diagrams"
    | "files"
    | "editor"
    | "figure"
    | "question-set"
    | "resources"
    | "agents-md"
    | "capabilities"
    | "system-prompt"
    | "palette"
    | "settings"
  isPinned: (directory: string, sessionID: string) => boolean
  togglePinned: (directory: string, sessionID: string) => void
  markUnread: (directory: string, sessionID: string) => void
  clearUnread: (directory: string, sessionID: string) => void
  isUnread: (directory: string, sessionID: string) => boolean
  clearDirectorySessionState: (directory: string, sessionID: string) => void
  setLeftSidebarOpen: (open: boolean) => void
  setLeftSidebarWidth: (width: number) => void
  setRightSidebarOpen: (open: boolean) => void
  setRightSidebarWidth: (width: number) => void
  setMainPaneTab: (tab: NotebookMainPaneTab) => void
  setRightSidebarTab: (
    tab:
      | "curriculum"
      | "diagrams"
      | "files"
      | "editor"
      | "figure"
      | "question-set"
      | "resources"
      | "agents-md"
      | "capabilities"
      | "system-prompt"
      | "palette"
      | "settings",
  ) => void
}

export const useUiPreferences = create<UiPreferencesStore>()(
  persist(
    immer((set, get) => ({
      pinnedByDirectory: {} as Record<string, string[]>,
      unreadByDirectory: {} as Record<string, Record<string, true>>,
      leftSidebarOpen: true,
      leftSidebarWidth: 344,
      rightSidebarOpen: false,
      rightSidebarWidth: 344,
      mainPaneTab: "chat" as NotebookMainPaneTab,
      rightSidebarTab: "curriculum" as const,
      isPinned(directory, sessionID) {
        return (get().pinnedByDirectory[directory] ?? []).includes(sessionID)
      },
      togglePinned(directory, sessionID) {
        set((state) => {
          const current = state.pinnedByDirectory[directory] ?? []
          const exists = current.includes(sessionID)
          if (exists) {
            state.pinnedByDirectory[directory] = current.filter((id: string) => id !== sessionID)
          } else {
            state.pinnedByDirectory[directory] = [sessionID, ...current]
          }
        })
      },
      markUnread(directory, sessionID) {
        set((state) => {
          if (state.unreadByDirectory[directory]?.[sessionID]) return
          if (!state.unreadByDirectory[directory]) {
            state.unreadByDirectory[directory] = {}
          }
          state.unreadByDirectory[directory]![sessionID] = true
        })
      },
      clearUnread(directory, sessionID) {
        set((state) => {
          if (!state.unreadByDirectory[directory]?.[sessionID]) return
          delete state.unreadByDirectory[directory]![sessionID]
        })
      },
      isUnread(directory, sessionID) {
        return !!get().unreadByDirectory[directory]?.[sessionID]
      },
      clearDirectorySessionState(directory, sessionID) {
        set((state) => {
          state.pinnedByDirectory[directory] = (state.pinnedByDirectory[directory] ?? []).filter(
            (id: string) => id !== sessionID,
          )
          delete state.unreadByDirectory[directory]?.[sessionID]
        })
      },
      setLeftSidebarOpen(open) {
        set((state) => {
          state.leftSidebarOpen = open
        })
      },
      setLeftSidebarWidth(width) {
        set((state) => {
          state.leftSidebarWidth = width
        })
      },
      setRightSidebarOpen(open) {
        set((state) => {
          state.rightSidebarOpen = open
        })
      },
      setRightSidebarWidth(width) {
        set((state) => {
          state.rightSidebarWidth = width
        })
      },
      setMainPaneTab(tab) {
        set((state) => {
          state.mainPaneTab = tab
        })
      },
      setRightSidebarTab(tab) {
        set((state) => {
          state.rightSidebarTab = tab
        })
      },
    })),
    {
      name: UI_PREFERENCES_STORAGE_KEY,
      version: 10,
      storage: createPlatformJsonStorage("buddy.ui.dat"),
      migrate(persistedState) {
        const state = persistedState as Partial<UiPreferencesStore> | undefined
        return {
          pinnedByDirectory: state?.pinnedByDirectory ?? {},
          unreadByDirectory: state?.unreadByDirectory ?? {},
          leftSidebarOpen: state?.leftSidebarOpen ?? true,
          leftSidebarWidth: state?.leftSidebarWidth ?? 344,
          rightSidebarOpen: state?.rightSidebarOpen ?? false,
          rightSidebarWidth: state?.rightSidebarWidth ?? 344,
          mainPaneTab:
            state?.mainPaneTab === "resources"
              ? "resources"
              : state?.mainPaneTab === "diagrams"
                ? "diagrams"
                : state?.mainPaneTab === "instructions"
                  ? "instructions"
                  : state?.mainPaneTab === "question-set"
                    ? "question-set"
                    : "chat",
          rightSidebarTab:
            state?.rightSidebarTab === "settings"
              ? "settings"
              : state?.rightSidebarTab === "system-prompt"
                ? "system-prompt"
                : state?.rightSidebarTab === "capabilities"
                  ? "capabilities"
                  : state?.rightSidebarTab === "resources"
                    ? "resources"
                    : state?.rightSidebarTab === "agents-md"
                      ? "agents-md"
                      : state?.rightSidebarTab === "files"
                        ? "files"
                        : state?.rightSidebarTab === "figure"
                          ? "figure"
                          : state?.rightSidebarTab === "question-set"
                            ? "question-set"
                            : state?.rightSidebarTab === "editor"
                              ? "editor"
                              : state?.rightSidebarTab === "diagrams"
                                ? "diagrams"
                                : state?.rightSidebarTab === "palette"
                                  ? "palette"
                                  : "curriculum",
        }
      },
      partialize(state) {
        return {
          pinnedByDirectory: state.pinnedByDirectory,
          unreadByDirectory: state.unreadByDirectory,
          leftSidebarOpen: state.leftSidebarOpen,
          leftSidebarWidth: state.leftSidebarWidth,
          rightSidebarOpen: state.rightSidebarOpen,
          rightSidebarWidth: state.rightSidebarWidth,
          mainPaneTab: state.mainPaneTab,
          rightSidebarTab: state.rightSidebarTab,
        }
      },
    },
  ),
)
