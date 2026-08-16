import { parseTJsonObject, parseTNumber } from "@/components/chat/tools/types"
import { create, type StoreApi, type UseBoundStore } from "zustand"
import { persist } from "zustand/middleware"
import { createPlatformJsonStorage } from "@/context/platform"
import { RIGHT_WORKSPACE_DEFAULT_WIDTH_PX } from "@/lib/directory-chat/right-workspace-layout"

const BENCH_PRESENTATION_PREFERENCES_STORAGE_KEY = "buddy.bench.presentation.v2"
const BENCH_PRESENTATION_PREFERENCES_STORAGE_FILE = "buddy.bench.presentation.v2.dat"

export type BenchPresentationPreferences = {
  workspaceWidthPx: number
}

type BenchPresentationPreferencesStore = BenchPresentationPreferences & {
  setWorkspaceWidth: (widthPx: number) => void
}

const useBenchPresentationPreferencesStore = create<BenchPresentationPreferencesStore>()(
  persist(
    (set) => ({
      workspaceWidthPx: RIGHT_WORKSPACE_DEFAULT_WIDTH_PX,
      setWorkspaceWidth(widthPx) {
        if (!Number.isFinite(widthPx) || widthPx <= 0) return
        set({ workspaceWidthPx: widthPx })
      },
    }),
    {
      name: BENCH_PRESENTATION_PREFERENCES_STORAGE_KEY,
      version: 2,
      storage: createPlatformJsonStorage(BENCH_PRESENTATION_PREFERENCES_STORAGE_FILE),
      partialize(state) {
        return {
          workspaceWidthPx: state.workspaceWidthPx,
        }
      },
      merge(persistedState, currentState) {
        const record = parseTJsonObject(persistedState)
        if (!record) return currentState

        const parsedWidth = parseTNumber(record.workspaceWidthPx)
        const workspaceWidthPx =
          parsedWidth !== undefined && Number.isFinite(parsedWidth) && parsedWidth > 0
            ? parsedWidth
            : currentState.workspaceWidthPx

        return {
          ...currentState,
          workspaceWidthPx,
        }
      },
    },
  ),
)

export const useBenchPresentationPreferences: UseBoundStore<
  StoreApi<BenchPresentationPreferences>
> = useBenchPresentationPreferencesStore

function readBenchPresentationPreferences(): BenchPresentationPreferences {
  const state = useBenchPresentationPreferencesStore.getState()
  return {
    workspaceWidthPx: state.workspaceWidthPx,
  }
}

export function setBenchPresentationWorkspaceWidth(widthPx: number): void {
  useBenchPresentationPreferencesStore.getState().setWorkspaceWidth(widthPx)
}

export { readBenchPresentationPreferences }
