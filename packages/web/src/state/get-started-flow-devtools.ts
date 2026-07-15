import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"
import {
  GET_STARTED_FLOW_DEVTOOLS_MODE,
  isGetStartedFlowDevtoolsMode,
  type GetStartedFlowDevtoolsMode,
} from "@/lib/get-started-chats"

const GET_STARTED_FLOW_DEVTOOLS_STORAGE_KEY = "buddy.devtools.get-started-flow.v3"

type GetStartedFlowDevtoolsStore = {
  mode: GetStartedFlowDevtoolsMode
  setMode: (mode: GetStartedFlowDevtoolsMode) => void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

// Persisted app store: this developer-only selection survives local page reloads.
export const useGetStartedFlowDevtools = create<GetStartedFlowDevtoolsStore>()(
  persist(
    (set) => ({
      mode: GET_STARTED_FLOW_DEVTOOLS_MODE.appState,
      setMode(mode) {
        set({ mode })
      },
    }),
    {
      name: GET_STARTED_FLOW_DEVTOOLS_STORAGE_KEY,
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ mode: state.mode }),
      merge(persistedState, currentState) {
        if (!isRecord(persistedState)) return currentState
        const mode = persistedState.mode
        return {
          ...currentState,
          mode:
            typeof mode === "string" && isGetStartedFlowDevtoolsMode(mode)
              ? mode
              : currentState.mode,
        }
      },
    },
  ),
)
