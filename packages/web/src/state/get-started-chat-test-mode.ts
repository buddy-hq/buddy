import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"
import {
  GET_STARTED_CHAT_TEST_MODE,
  isGetStartedChatTestMode,
  type GetStartedChatTestMode,
} from "@/lib/get-started-chats"
import { useGetStartedFlowStore } from "./get-started-flow-store"

const GET_STARTED_CHAT_TEST_MODE_STORAGE_KEY = "buddy.devtools.get-started-chat-test-mode.v1"

type GetStartedChatTestModeStore = {
  mode: GetStartedChatTestMode
  setMode: (mode: GetStartedChatTestMode) => void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

// Persisted app store: this developer-only selection survives local page reloads.
export const useGetStartedChatTestMode = create<GetStartedChatTestModeStore>()(
  persist(
    (set) => ({
      mode: GET_STARTED_CHAT_TEST_MODE.hidden,
      setMode(mode) {
        set({ mode })
        useGetStartedFlowStore.getState().setEnabled(mode !== GET_STARTED_CHAT_TEST_MODE.hidden)
      },
    }),
    {
      name: GET_STARTED_CHAT_TEST_MODE_STORAGE_KEY,
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ mode: state.mode }),
      merge(persistedState, currentState) {
        if (!isRecord(persistedState)) return currentState
        const mode = persistedState.mode
        return {
          ...currentState,
          mode:
            typeof mode === "string" && isGetStartedChatTestMode(mode) ? mode : currentState.mode,
        }
      },
    },
  ),
)
