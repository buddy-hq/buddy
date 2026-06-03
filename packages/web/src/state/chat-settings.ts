import { create } from "zustand"
import { persist } from "zustand/middleware"
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function normalizeFollowupBehavior(value: unknown): FollowupBehavior {
  if (value === FOLLOWUP_BEHAVIOR_QUEUE) return FOLLOWUP_BEHAVIOR_QUEUE
  return FOLLOWUP_BEHAVIOR_STEER
}

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
        if (!isRecord(persistedState)) return currentState

        return {
          ...currentState,
          followupBehavior: normalizeFollowupBehavior(persistedState.followupBehavior),
          showReasoningSummaries:
            typeof persistedState.showReasoningSummaries === "boolean"
              ? persistedState.showReasoningSummaries
              : currentState.showReasoningSummaries,
          shellToolDefaultOpen:
            typeof persistedState.shellToolDefaultOpen === "boolean"
              ? persistedState.shellToolDefaultOpen
              : currentState.shellToolDefaultOpen,
          editToolDefaultOpen:
            typeof persistedState.editToolDefaultOpen === "boolean"
              ? persistedState.editToolDefaultOpen
              : currentState.editToolDefaultOpen,
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
