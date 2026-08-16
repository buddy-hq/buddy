import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"
import {
  GET_STARTED_FLOW_DEVTOOLS_MODE,
  isGetStartedFlowDevtoolsMode,
  type GetStartedFlowDevtoolsMode,
} from "@/lib/get-started-chats"
import { parseBuddyConfigObject, parseStringValue } from "./parse-external"

const GET_STARTED_FLOW_DEVTOOLS_STORAGE_KEY = "buddy.devtools.get-started-flow.v3"

type TGetStartedFlowDevtoolsStore = {
  mode: GetStartedFlowDevtoolsMode
  setMode: (mode: GetStartedFlowDevtoolsMode) => void
}

function parseGetStartedFlowDevtoolsMode<TValue>(
  value: TValue,
): GetStartedFlowDevtoolsMode | undefined {
  const mode = parseStringValue(value)
  if (mode !== undefined && isGetStartedFlowDevtoolsMode(mode)) return mode
  return undefined
}

// Persisted app store: this developer-only selection survives local page reloads.
export const useGetStartedFlowDevtools = create<TGetStartedFlowDevtoolsStore>()(
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
        const record = parseBuddyConfigObject(persistedState)
        if (!record) return currentState
        const mode = parseGetStartedFlowDevtoolsMode(record.mode)
        return {
          ...currentState,
          mode: mode ?? currentState.mode,
        }
      },
    },
  ),
)
