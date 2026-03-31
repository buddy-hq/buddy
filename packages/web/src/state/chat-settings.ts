import { create } from "zustand"
import { persist } from "zustand/middleware"
import { createPlatformJsonStorage } from "../context/platform"

export const CHAT_SETTINGS_STORAGE_KEY = "buddy.chat-settings.v1"

type ChatSettingsStore = {
  showReasoningSummaries: boolean
  shellToolDefaultOpen: boolean
  editToolDefaultOpen: boolean
  setShowReasoningSummaries: (value: boolean) => void
  setShellToolDefaultOpen: (value: boolean) => void
  setEditToolDefaultOpen: (value: boolean) => void
}

export const useChatSettings = create<ChatSettingsStore>()(
  persist(
    (set) => ({
      showReasoningSummaries: true,
      shellToolDefaultOpen: false,
      editToolDefaultOpen: false,
      setShowReasoningSummaries: (value) => set({ showReasoningSummaries: value }),
      setShellToolDefaultOpen: (value) => set({ shellToolDefaultOpen: value }),
      setEditToolDefaultOpen: (value) => set({ editToolDefaultOpen: value }),
    }),
    {
      name: CHAT_SETTINGS_STORAGE_KEY,
      storage: createPlatformJsonStorage("buddy.chat-settings.dat"),
      partialize(state) {
        return {
          showReasoningSummaries: state.showReasoningSummaries,
          shellToolDefaultOpen: state.shellToolDefaultOpen,
          editToolDefaultOpen: state.editToolDefaultOpen,
        }
      },
    },
  ),
)
