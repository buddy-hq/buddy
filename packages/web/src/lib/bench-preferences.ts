import { create, type StoreApi, type UseBoundStore } from "zustand"
import { persist } from "zustand/middleware"
import { createPlatformJsonStorage } from "@/context/platform"
import { RIGHT_WORKSPACE_DEFAULT_WIDTH_PX } from "@/lib/directory-chat/right-workspace-layout"

const BENCH_PRESENTATION_PREFERENCES_STORAGE_KEY = "buddy.bench.presentation.v2"
const BENCH_PRESENTATION_PREFERENCES_STORAGE_FILE = "buddy.bench.presentation.v2.dat"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

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
        if (!isRecord(persistedState)) return currentState

        const workspaceWidthPx =
          typeof persistedState.workspaceWidthPx === "number" &&
          Number.isFinite(persistedState.workspaceWidthPx) &&
          persistedState.workspaceWidthPx > 0
            ? persistedState.workspaceWidthPx
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
