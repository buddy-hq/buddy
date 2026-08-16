import { create } from "zustand"
import { persist } from "zustand/middleware"
import { z } from "zod"
import { createPlatformJsonStorage } from "../context/platform"

export const CHAT_SETTINGS_STORAGE_KEY = "buddy.chat-settings.v1"

export const FOLLOWUP_BEHAVIOR_STEER = "steer"
export const FOLLOWUP_BEHAVIOR_QUEUE = "queue"

export type FollowupBehavior = typeof FOLLOWUP_BEHAVIOR_STEER | typeof FOLLOWUP_BEHAVIOR_QUEUE

type ChatSettingsStore = {
  followupBehavior: FollowupBehavior
  showReasoningSummaries: boolean
  shellToolDefaultOpen: boolean
  editToolDefaultOpen: boolean
  setFollowupBehavior: (value: FollowupBehavior) => void
  setShowReasoningSummaries: (value: boolean) => void
  setShellToolDefaultOpen: (value: boolean) => void
  setEditToolDefaultOpen: (value: boolean) => void
}

const persistedChatSettingsSchema = z.object({
  followupBehavior: z.enum([FOLLOWUP_BEHAVIOR_STEER, FOLLOWUP_BEHAVIOR_QUEUE]).optional(),
  showReasoningSummaries: z.boolean().optional(),
  shellToolDefaultOpen: z.boolean().optional(),
  editToolDefaultOpen: z.boolean().optional(),
})

export const useChatSettings = create<ChatSettingsStore>()(
  persist(
    (set) => ({
      followupBehavior: FOLLOWUP_BEHAVIOR_STEER,
      showReasoningSummaries: true,
      shellToolDefaultOpen: false,
      editToolDefaultOpen: false,
      setFollowupBehavior: (value) => set({ followupBehavior: value }),
      setShowReasoningSummaries: (value) => set({ showReasoningSummaries: value }),
      setShellToolDefaultOpen: (value) => set({ shellToolDefaultOpen: value }),
      setEditToolDefaultOpen: (value) => set({ editToolDefaultOpen: value }),
    }),
    {
      name: CHAT_SETTINGS_STORAGE_KEY,
      storage: createPlatformJsonStorage("buddy.chat-settings.dat"),
      merge(persistedState, currentState) {
        const persisted = persistedChatSettingsSchema.safeParse(persistedState)
        if (!persisted.success) return currentState

        return {
          ...currentState,
          followupBehavior: persisted.data.followupBehavior ?? currentState.followupBehavior,
          showReasoningSummaries:
            persisted.data.showReasoningSummaries ?? currentState.showReasoningSummaries,
          shellToolDefaultOpen:
            persisted.data.shellToolDefaultOpen ?? currentState.shellToolDefaultOpen,
          editToolDefaultOpen: persisted.data.editToolDefaultOpen ?? currentState.editToolDefaultOpen,
        }
      },
      partialize(state) {
        return {
          followupBehavior: state.followupBehavior,
          showReasoningSummaries: state.showReasoningSummaries,
          shellToolDefaultOpen: state.shellToolDefaultOpen,
          editToolDefaultOpen: state.editToolDefaultOpen,
        }
      },
    },
  ),
)
