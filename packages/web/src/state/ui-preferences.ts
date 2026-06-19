import { create } from "zustand"
import { persist } from "zustand/middleware"
import { immer } from "zustand/middleware/immer"
import { createPlatformJsonStorage } from "../context/platform"

export const UI_PREFERENCES_STORAGE_KEY = "buddy.ui.v1"

export type RightWorkspaceSelector = "explorer" | "library"

const DEFAULT_SIDEBAR_WIDTH_PX = 344
const DEFAULT_PROJECT_FILE_TREE_OPEN = false

type PersistedUiPreferences = {
  pinnedByDirectory?: Record<string, string[]>
  unreadByDirectory?: Record<string, Record<string, true>>
  leftSidebarOpen?: boolean
  leftSidebarWidth?: number
  chatLeftSidebarWidth?: number
  settingsSidebarWidth?: number
  rightSidebarOpen?: boolean
  rightSidebarWidth?: number
  projectFileTreeOpen?: boolean
  mainPaneTab?: unknown
  rightSidebarTab?: UiPreferencesStore["rightSidebarTab"]
  rightWorkspaceLastSelectorByDirectory?: Record<string, unknown>
}

function isPersistedUiPreferences(value: unknown): value is PersistedUiPreferences {
  return typeof value === "object" && value !== null
}

function readLegacyLeftSidebarWidth(state: PersistedUiPreferences | undefined) {
  if (!state || typeof state.leftSidebarWidth !== "number") {
    return DEFAULT_SIDEBAR_WIDTH_PX
  }
  return state.leftSidebarWidth
}

export type UiPreferencesStore = {
  pinnedByDirectory: Record<string, string[]>
  unreadByDirectory: Record<string, Record<string, true>>
  leftSidebarOpen: boolean
  chatLeftSidebarWidth: number
  settingsSidebarWidth: number
  rightSidebarOpen: boolean
  rightSidebarWidth: number
  projectFileTreeOpen: boolean
  rightWorkspaceLastSelectorByDirectory: Record<string, RightWorkspaceSelector>
  rightSidebarTab:
    | "curriculum"
    | "diagrams"
    | "files"
    | "editor"
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
  setChatLeftSidebarWidth: (width: number) => void
  setSettingsSidebarWidth: (width: number) => void
  setRightSidebarOpen: (open: boolean) => void
  setRightSidebarWidth: (width: number) => void
  setProjectFileTreeOpen: (open: boolean) => void
  setRightWorkspaceLastSelector: (directory: string, selector: RightWorkspaceSelector) => void
  setRightSidebarTab: (
    tab:
      | "curriculum"
      | "diagrams"
      | "files"
      | "editor"
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
    immer((set, get) => {
      const sessionStateSlice: Pick<
        UiPreferencesStore,
        | "pinnedByDirectory"
        | "unreadByDirectory"
        | "isPinned"
        | "togglePinned"
        | "markUnread"
        | "clearUnread"
        | "isUnread"
        | "clearDirectorySessionState"
      > = {
        pinnedByDirectory: {},
        unreadByDirectory: {},
        isPinned(directory, sessionID) {
          return (get().pinnedByDirectory[directory] ?? []).includes(sessionID)
        },
        togglePinned(directory, sessionID) {
          set((state) => {
            const current = state.pinnedByDirectory[directory] ?? []
            const exists = current.includes(sessionID)
            if (exists) {
              state.pinnedByDirectory[directory] = current.filter((id) => id !== sessionID)
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
            const unreadDirectory = state.unreadByDirectory[directory]
            if (!unreadDirectory) return
            unreadDirectory[sessionID] = true
          })
        },
        clearUnread(directory, sessionID) {
          set((state) => {
            if (!state.unreadByDirectory[directory]?.[sessionID]) return
            const unreadDirectory = state.unreadByDirectory[directory]
            if (!unreadDirectory) return
            delete unreadDirectory[sessionID]
          })
        },
        isUnread(directory, sessionID) {
          return !!get().unreadByDirectory[directory]?.[sessionID]
        },
        clearDirectorySessionState(directory, sessionID) {
          set((state) => {
            state.pinnedByDirectory[directory] = (state.pinnedByDirectory[directory] ?? []).filter(
              (id) => id !== sessionID,
            )
            delete state.unreadByDirectory[directory]?.[sessionID]
          })
        },
      }

      const layoutSlice: Pick<
        UiPreferencesStore,
        | "leftSidebarOpen"
        | "chatLeftSidebarWidth"
        | "settingsSidebarWidth"
        | "rightSidebarOpen"
        | "rightSidebarWidth"
        | "projectFileTreeOpen"
        | "rightWorkspaceLastSelectorByDirectory"
        | "rightSidebarTab"
        | "setLeftSidebarOpen"
        | "setChatLeftSidebarWidth"
        | "setSettingsSidebarWidth"
        | "setRightSidebarOpen"
        | "setRightSidebarWidth"
        | "setProjectFileTreeOpen"
        | "setRightWorkspaceLastSelector"
        | "setRightSidebarTab"
      > = {
        leftSidebarOpen: true,
        chatLeftSidebarWidth: 280,
        settingsSidebarWidth: 260,
        rightSidebarOpen: false,
        rightSidebarWidth: 380,
        projectFileTreeOpen: DEFAULT_PROJECT_FILE_TREE_OPEN,
        rightWorkspaceLastSelectorByDirectory: {},
        rightSidebarTab: "curriculum",
        setLeftSidebarOpen(open) {
          set((state) => {
            state.leftSidebarOpen = open
          })
        },
        setChatLeftSidebarWidth(width) {
          set((state) => {
            state.chatLeftSidebarWidth = width
          })
        },
        setSettingsSidebarWidth(width) {
          set((state) => {
            state.settingsSidebarWidth = width
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
        setProjectFileTreeOpen(open) {
          set((state) => {
            state.projectFileTreeOpen = open
          })
        },
        setRightWorkspaceLastSelector(directory, selector) {
          set((state) => {
            state.rightWorkspaceLastSelectorByDirectory[directory] = selector
          })
        },
        setRightSidebarTab(tab) {
          set((state) => {
            state.rightSidebarTab = tab
          })
        },
      }

      return {
        ...sessionStateSlice,
        ...layoutSlice,
      }
    }),
    {
      name: UI_PREFERENCES_STORAGE_KEY,
      version: 14,
      storage: createPlatformJsonStorage("buddy.ui.dat"),
      migrate(persistedState) {
        const state = isPersistedUiPreferences(persistedState) ? persistedState : undefined
        const legacyLeftSidebarWidth = readLegacyLeftSidebarWidth(state)
        return {
          pinnedByDirectory: state?.pinnedByDirectory ?? {},
          unreadByDirectory: state?.unreadByDirectory ?? {},
          leftSidebarOpen: state?.leftSidebarOpen ?? true,
          chatLeftSidebarWidth: state?.chatLeftSidebarWidth ?? legacyLeftSidebarWidth,
          settingsSidebarWidth: state?.settingsSidebarWidth ?? legacyLeftSidebarWidth,
          rightSidebarOpen: state?.rightSidebarOpen ?? false,
          rightSidebarWidth: state?.rightSidebarWidth ?? DEFAULT_SIDEBAR_WIDTH_PX,
          projectFileTreeOpen: state?.projectFileTreeOpen ?? DEFAULT_PROJECT_FILE_TREE_OPEN,
          rightWorkspaceLastSelectorByDirectory: Object.fromEntries(
            Object.entries(state?.rightWorkspaceLastSelectorByDirectory ?? {}).map(
              ([directory, selector]) => [
                directory,
                selector === "library" ? "library" : "explorer",
              ],
            ),
          ),
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
          chatLeftSidebarWidth: state.chatLeftSidebarWidth,
          settingsSidebarWidth: state.settingsSidebarWidth,
          rightSidebarOpen: state.rightSidebarOpen,
          rightSidebarWidth: state.rightSidebarWidth,
          projectFileTreeOpen: state.projectFileTreeOpen,
          rightWorkspaceLastSelectorByDirectory: state.rightWorkspaceLastSelectorByDirectory,
          rightSidebarTab: state.rightSidebarTab,
        }
      },
    },
  ),
)
