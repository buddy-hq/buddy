import { useSyncExternalStore } from "react"
import { create } from "zustand"
import { persist } from "zustand/middleware"
import { immer } from "zustand/middleware/immer"
import { createPlatformJsonStorage } from "../context/platform"

export const UI_PREFERENCES_STORAGE_KEY = "buddy.ui.v1"

const DEFAULT_LEFT_SIDEBAR_WIDTH_PX = 344
const DEFAULT_PROJECT_FILE_TREE_OPEN = false

type PersistedUiPreferences = {
  pinnedByDirectory?: Record<string, string[]>
  unreadByDirectory?: Record<string, Record<string, true>>
  leftSidebarOpen?: boolean
  leftSidebarWidth?: number
  chatLeftSidebarWidth?: number
  settingsSidebarWidth?: number
  projectFileTreeOpen?: boolean
  teacherStandardsAutoSetupComplete?: boolean
  mainPaneTab?: unknown
}

function isPersistedUiPreferences(value: unknown): value is PersistedUiPreferences {
  return typeof value === "object" && value !== null
}

function readLegacyLeftSidebarWidth(state: PersistedUiPreferences | undefined) {
  if (!state || typeof state.leftSidebarWidth !== "number") {
    return DEFAULT_LEFT_SIDEBAR_WIDTH_PX
  }
  return state.leftSidebarWidth
}

export type UiPreferencesStore = {
  pinnedByDirectory: Record<string, string[]>
  unreadByDirectory: Record<string, Record<string, true>>
  leftSidebarOpen: boolean
  chatLeftSidebarWidth: number
  settingsSidebarWidth: number
  projectFileTreeOpen: boolean
  teacherStandardsAutoSetupComplete: boolean
  isPinned: (directory: string, sessionID: string) => boolean
  togglePinned: (directory: string, sessionID: string) => void
  markUnread: (directory: string, sessionID: string) => void
  clearUnread: (directory: string, sessionID: string) => void
  isUnread: (directory: string, sessionID: string) => boolean
  clearDirectorySessionState: (directory: string, sessionID: string) => void
  setLeftSidebarOpen: (open: boolean) => void
  setChatLeftSidebarWidth: (width: number) => void
  setSettingsSidebarWidth: (width: number) => void
  setProjectFileTreeOpen: (open: boolean) => void
  setTeacherStandardsAutoSetupComplete: (complete: boolean) => void
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
        | "projectFileTreeOpen"
        | "setLeftSidebarOpen"
        | "setChatLeftSidebarWidth"
        | "setSettingsSidebarWidth"
        | "setProjectFileTreeOpen"
      > = {
        leftSidebarOpen: true,
        chatLeftSidebarWidth: 280,
        settingsSidebarWidth: 260,
        projectFileTreeOpen: DEFAULT_PROJECT_FILE_TREE_OPEN,
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
        setProjectFileTreeOpen(open) {
          set((state) => {
            state.projectFileTreeOpen = open
          })
        },
      }

      const discoverySlice: Pick<
        UiPreferencesStore,
        "teacherStandardsAutoSetupComplete" | "setTeacherStandardsAutoSetupComplete"
      > = {
        teacherStandardsAutoSetupComplete: false,
        setTeacherStandardsAutoSetupComplete(complete) {
          set((state) => {
            state.teacherStandardsAutoSetupComplete = complete
          })
        },
      }

      return {
        ...sessionStateSlice,
        ...layoutSlice,
        ...discoverySlice,
      }
    }),
    {
      name: UI_PREFERENCES_STORAGE_KEY,
      version: 18,
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
          projectFileTreeOpen: state?.projectFileTreeOpen ?? DEFAULT_PROJECT_FILE_TREE_OPEN,
          teacherStandardsAutoSetupComplete: state?.teacherStandardsAutoSetupComplete ?? false,
        }
      },
      partialize(state) {
        return {
          pinnedByDirectory: state.pinnedByDirectory,
          unreadByDirectory: state.unreadByDirectory,
          leftSidebarOpen: state.leftSidebarOpen,
          chatLeftSidebarWidth: state.chatLeftSidebarWidth,
          settingsSidebarWidth: state.settingsSidebarWidth,
          projectFileTreeOpen: state.projectFileTreeOpen,
          teacherStandardsAutoSetupComplete: state.teacherStandardsAutoSetupComplete,
        }
      },
    },
  ),
)

function subscribeToUiPreferencesHydration(onStoreChange: () => void): () => void {
  const unsubscribeHydrate = useUiPreferences.persist.onHydrate(onStoreChange)
  const unsubscribeFinishHydration = useUiPreferences.persist.onFinishHydration(onStoreChange)

  return () => {
    unsubscribeHydrate()
    unsubscribeFinishHydration()
  }
}

function uiPreferencesHydrationSnapshot(): boolean {
  return useUiPreferences.persist.hasHydrated()
}

function uiPreferencesServerHydrationSnapshot(): boolean {
  return false
}

export function useUiPreferencesHydrated(): boolean {
  return useSyncExternalStore(
    subscribeToUiPreferencesHydration,
    uiPreferencesHydrationSnapshot,
    uiPreferencesServerHydrationSnapshot,
  )
}
