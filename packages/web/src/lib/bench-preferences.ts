import { parseTJsonObject, parseTNumber } from "@/components/chat/tools/types"
import { create, type StoreApi, type UseBoundStore } from "zustand"
import { persist } from "zustand/middleware"
import { createPlatformJsonStorage } from "@/context/platform"

const BENCH_PRESENTATION_PREFERENCES_STORAGE_KEY = "buddy.bench.presentation.v2"
const BENCH_PRESENTATION_PREFERENCES_STORAGE_FILE = "buddy.bench.presentation.v2.dat"

const LEGACY_SMALLEST_BENCH_WIDTH_PX = 604

export type BenchPresentationPreferences = {
  workspaceWidthPx: number | null
  benchWidthPx: number | null
}

export type BenchPresentationWidthOwner = "drawer" | "bench"

type StoredBenchPresentationPreferences = {
  workspaceWidthPx?: number
  benchWidthPx?: number
}

type BenchPresentationPreferencesStore = BenchPresentationPreferences & {
  setWorkspaceWidth: (widthPx: number, owner: BenchPresentationWidthOwner) => void
}

function parseStoredWidth<TValue>(value: TValue): number | undefined {
  const parsed = parseTNumber(value)
  return parsed !== undefined && Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

const useBenchPresentationPreferencesStore = create<BenchPresentationPreferencesStore>()(
  persist<BenchPresentationPreferencesStore, [], [], StoredBenchPresentationPreferences>(
    (set) => ({
      workspaceWidthPx: null,
      benchWidthPx: null,
      setWorkspaceWidth(widthPx, owner) {
        if (!Number.isFinite(widthPx) || widthPx <= 0) return
        set(
          owner === "bench"
            ? { workspaceWidthPx: widthPx, benchWidthPx: widthPx }
            : { workspaceWidthPx: widthPx },
        )
      },
    }),
    {
      name: BENCH_PRESENTATION_PREFERENCES_STORAGE_KEY,
      version: 3,
      storage: createPlatformJsonStorage(BENCH_PRESENTATION_PREFERENCES_STORAGE_FILE),
      partialize(state) {
        return Object.assign(
          {},
          state.workspaceWidthPx === null
            ? undefined
            : { workspaceWidthPx: state.workspaceWidthPx },
          state.benchWidthPx === null ? undefined : { benchWidthPx: state.benchWidthPx },
        )
      },
      migrate(persistedState) {
        const legacyWidth = parseStoredWidth(parseTJsonObject(persistedState)?.workspaceWidthPx)
        if (legacyWidth === undefined) return {}
        return legacyWidth >= LEGACY_SMALLEST_BENCH_WIDTH_PX
          ? { workspaceWidthPx: legacyWidth, benchWidthPx: legacyWidth }
          : { workspaceWidthPx: legacyWidth }
      },
      merge(persistedState, currentState) {
        const record = parseTJsonObject(persistedState)
        if (!record) return currentState

        return {
          ...currentState,
          workspaceWidthPx:
            parseStoredWidth(record.workspaceWidthPx) ?? currentState.workspaceWidthPx,
          benchWidthPx: parseStoredWidth(record.benchWidthPx) ?? currentState.benchWidthPx,
        }
      },
    },
  ),
)

export const useBenchPresentationPreferences: UseBoundStore<
  StoreApi<BenchPresentationPreferences>
> & { persist: { rehydrate: () => Promise<void> | void } } = useBenchPresentationPreferencesStore

function readBenchPresentationPreferences(): BenchPresentationPreferences {
  const state = useBenchPresentationPreferencesStore.getState()
  return {
    workspaceWidthPx: state.workspaceWidthPx,
    benchWidthPx: state.benchWidthPx,
  }
}

export function setBenchPresentationWorkspaceWidth(
  widthPx: number,
  owner: BenchPresentationWidthOwner,
): void {
  useBenchPresentationPreferencesStore.getState().setWorkspaceWidth(widthPx, owner)
}

export { readBenchPresentationPreferences }
