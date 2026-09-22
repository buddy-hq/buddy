import { useSyncExternalStore } from "react"
import { create } from "zustand"
import { persist } from "zustand/middleware"
import { immer } from "zustand/middleware/immer"
import { z } from "zod"
import { createPlatformJsonStorage } from "../context/platform"
import { LEFT_SIDEBAR_DEFAULT_WIDTH_PX } from "@/lib/directory-chat/left-sidebar-layout"
import type { OneTimeNoticeID, SeenOneTimeNotices } from "@/state/one-time-notices"
import { parseFiniteNumber, parseWithSchema } from "./parse-external"

export const UI_PREFERENCES_STORAGE_KEY = "buddy.ui.v1"

const DEFAULT_PROJECT_FILE_TREE_OPEN = false

type TPersistedUiPreferences = {
  pinnedByDirectory?: Record<string, string[]>
  unreadByDirectory?: Record<string, Record<string, true>>
  collapsedChatSidebarDirectories?: Record<string, true>
  leftSidebarOpen?: boolean
  leftSidebarWidth?: number
  chatLeftSidebarWidth?: number
  settingsSidebarWidth?: number
  projectFileTreeOpen?: boolean
  teacherStandardsAutoSetupComplete?: boolean
  notesLocationIntroSeen?: boolean
  seenNotices?: Record<string, true>
  openExternalFilesWithoutAsking?: boolean
}

const persistedUiPreferencesSchema = z.object({
  pinnedByDirectory: z.record(z.string(), z.array(z.string())).optional(),
  unreadByDirectory: z.record(z.string(), z.record(z.string(), z.literal(true))).optional(),
  collapsedChatSidebarDirectories: z.record(z.string(), z.literal(true)).optional(),
  leftSidebarOpen: z.boolean().optional(),
  leftSidebarWidth: z.number().finite().optional(),
  chatLeftSidebarWidth: z.number().finite().optional(),
  settingsSidebarWidth: z.number().finite().optional(),
  projectFileTreeOpen: z.boolean().optional(),
  teacherStandardsAutoSetupComplete: z.boolean().optional(),
  notesLocationIntroSeen: z.boolean().optional(),
  seenNotices: z.record(z.string(), z.literal(true)).optional(),
  openExternalFilesWithoutAsking: z.boolean().optional(),
})

function parsePersistedUiPreferences<TValue>(value: TValue): TPersistedUiPreferences | undefined {
  return parseWithSchema(persistedUiPreferencesSchema, value)
}

function readLegacyLeftSidebarWidth(state: TPersistedUiPreferences | undefined) {
  return parseFiniteNumber(state?.leftSidebarWidth) ?? LEFT_SIDEBAR_DEFAULT_WIDTH_PX
}

function migrateSeenNotices(state: TPersistedUiPreferences | undefined): SeenOneTimeNotices {
  const seenNotices: SeenOneTimeNotices = { ...state?.seenNotices }
  if (state?.notesLocationIntroSeen) seenNotices["notes-location-intro"] = true
  return seenNotices
}

export type UiPreferencesStore = {
  pinnedByDirectory: Record<string, string[]>
  unreadByDirectory: Record<string, Record<string, true>>
  collapsedChatSidebarDirectories: Record<string, true>
  leftSidebarOpen: boolean
  chatLeftSidebarWidth: number
  settingsSidebarWidth: number
  projectFileTreeOpen: boolean
  teacherStandardsAutoSetupComplete: boolean
  seenNotices: SeenOneTimeNotices
  openExternalFilesWithoutAsking: boolean
  isPinned: (directory: string, sessionID: string) => boolean
  togglePinned: (directory: string, sessionID: string) => void
  markUnread: (directory: string, sessionID: string) => void
  clearUnread: (directory: string, sessionID: string) => void
  isUnread: (directory: string, sessionID: string) => boolean
  clearDirectorySessionState: (directory: string, sessionID: string) => void
  setChatSidebarDirectoryOpen: (directory: string, open: boolean) => void
  setLeftSidebarOpen: (open: boolean) => void
  setChatLeftSidebarWidth: (width: number) => void
  setSettingsSidebarWidth: (width: number) => void
  setProjectFileTreeOpen: (open: boolean) => void
  setTeacherStandardsAutoSetupComplete: (complete: boolean) => void
  markNoticeSeen: (id: OneTimeNoticeID) => void
  setOpenExternalFilesWithoutAsking: (allowed: boolean) => void
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
        | "collapsedChatSidebarDirectories"
        | "leftSidebarOpen"
        | "chatLeftSidebarWidth"
        | "settingsSidebarWidth"
        | "projectFileTreeOpen"
        | "setChatSidebarDirectoryOpen"
        | "setLeftSidebarOpen"
        | "setChatLeftSidebarWidth"
        | "setSettingsSidebarWidth"
        | "setProjectFileTreeOpen"
      > = {
        collapsedChatSidebarDirectories: {},
        leftSidebarOpen: true,
        // Settings shows the same directory/thread list, so both start at the same width.
        chatLeftSidebarWidth: LEFT_SIDEBAR_DEFAULT_WIDTH_PX,
        settingsSidebarWidth: LEFT_SIDEBAR_DEFAULT_WIDTH_PX,
        projectFileTreeOpen: DEFAULT_PROJECT_FILE_TREE_OPEN,
        setChatSidebarDirectoryOpen(directory, open) {
          set((state) => {
            if (open) {
              delete state.collapsedChatSidebarDirectories[directory]
            } else {
              state.collapsedChatSidebarDirectories[directory] = true
            }
          })
        },
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
        | "teacherStandardsAutoSetupComplete"
        | "setTeacherStandardsAutoSetupComplete"
        | "seenNotices"
        | "markNoticeSeen"
      > = {
        teacherStandardsAutoSetupComplete: false,
        setTeacherStandardsAutoSetupComplete(complete) {
          set((state) => {
            state.teacherStandardsAutoSetupComplete = complete
          })
        },
        seenNotices: {},
        markNoticeSeen(id) {
          set((state) => {
            state.seenNotices[id] = true
          })
        },
      }

      const fileLinkSlice: Pick<
        UiPreferencesStore,
        "openExternalFilesWithoutAsking" | "setOpenExternalFilesWithoutAsking"
      > = {
        openExternalFilesWithoutAsking: false,
        setOpenExternalFilesWithoutAsking(allowed) {
          set((state) => {
            state.openExternalFilesWithoutAsking = allowed
          })
        },
      }

      return {
        ...sessionStateSlice,
        ...layoutSlice,
        ...discoverySlice,
        ...fileLinkSlice,
      }
    }),
    {
      name: UI_PREFERENCES_STORAGE_KEY,
      version: 21,
      storage: createPlatformJsonStorage("buddy.ui.dat"),
      migrate(persistedState) {
        const state = parsePersistedUiPreferences(persistedState)
        const legacyLeftSidebarWidth = readLegacyLeftSidebarWidth(state)
        return {
          pinnedByDirectory: state?.pinnedByDirectory ?? {},
          unreadByDirectory: state?.unreadByDirectory ?? {},
          collapsedChatSidebarDirectories: state?.collapsedChatSidebarDirectories ?? {},
          leftSidebarOpen: state?.leftSidebarOpen ?? true,
          chatLeftSidebarWidth: state?.chatLeftSidebarWidth ?? legacyLeftSidebarWidth,
          settingsSidebarWidth: state?.settingsSidebarWidth ?? legacyLeftSidebarWidth,
          projectFileTreeOpen: state?.projectFileTreeOpen ?? DEFAULT_PROJECT_FILE_TREE_OPEN,
          teacherStandardsAutoSetupComplete: state?.teacherStandardsAutoSetupComplete ?? false,
          seenNotices: migrateSeenNotices(state),
          openExternalFilesWithoutAsking: state?.openExternalFilesWithoutAsking ?? false,
        }
      },
      partialize(state) {
        return {
          pinnedByDirectory: state.pinnedByDirectory,
          unreadByDirectory: state.unreadByDirectory,
          collapsedChatSidebarDirectories: state.collapsedChatSidebarDirectories,
          leftSidebarOpen: state.leftSidebarOpen,
          chatLeftSidebarWidth: state.chatLeftSidebarWidth,
          settingsSidebarWidth: state.settingsSidebarWidth,
          projectFileTreeOpen: state.projectFileTreeOpen,
          teacherStandardsAutoSetupComplete: state.teacherStandardsAutoSetupComplete,
          seenNotices: state.seenNotices,
          openExternalFilesWithoutAsking: state.openExternalFilesWithoutAsking,
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
