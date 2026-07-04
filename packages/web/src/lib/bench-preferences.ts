import { create, type StoreApi, type UseBoundStore } from "zustand"
import { persist } from "zustand/middleware"
import { createPlatformJsonStorage } from "@/context/platform"
import { RIGHT_WORKSPACE_DEFAULT_WIDTH_PX } from "@/lib/directory-chat/right-workspace-layout"
import {
  benchModePreferenceKey,
  isBenchModePreferenceKey,
  readBenchChatLayoutMode,
  type BenchMode,
  type BenchModePreferenceKey,
  type BenchTarget,
} from "./bench-targets"
import type { DirectoryWorkspaceCommandResult } from "@/state/directory-workspace-store"

const BENCH_PRESENTATION_PREFERENCES_STORAGE_KEY = "buddy.bench.presentation.v2"
const BENCH_PRESENTATION_PREFERENCES_STORAGE_FILE = "buddy.bench.presentation.v2.dat"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export type BenchPresentationPreferences = {
  modeBySurface: Partial<Record<BenchModePreferenceKey, BenchMode>>
  workspaceWidthPx: number
}

type BenchPresentationPreferencesStore = BenchPresentationPreferences & {
  setModePreference: (input: { target: BenchTarget; mode: BenchMode }) => void
  setWorkspaceWidth: (widthPx: number) => void
}

const useBenchPresentationPreferencesStore = create<BenchPresentationPreferencesStore>()(
  persist(
    (set) => ({
      modeBySurface: {},
      workspaceWidthPx: RIGHT_WORKSPACE_DEFAULT_WIDTH_PX,
      setModePreference(input) {
        const key = benchModePreferenceKey(input.target)
        set((state) => ({
          modeBySurface: {
            ...state.modeBySurface,
            [key]: input.mode,
          },
        }))
      },
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
          modeBySurface: state.modeBySurface,
          workspaceWidthPx: state.workspaceWidthPx,
        }
      },
      merge(persistedState, currentState) {
        if (!isRecord(persistedState)) return currentState

        const modeBySurface: BenchPresentationPreferences["modeBySurface"] = {}
        if (isRecord(persistedState.modeBySurface)) {
          for (const [key, value] of Object.entries(persistedState.modeBySurface)) {
            const mode = readBenchChatLayoutMode(value)
            if (isBenchModePreferenceKey(key) && mode) {
              modeBySurface[key] = mode
            }
          }
        }
        const workspaceWidthPx =
          typeof persistedState.workspaceWidthPx === "number" &&
          Number.isFinite(persistedState.workspaceWidthPx) &&
          persistedState.workspaceWidthPx > 0
            ? persistedState.workspaceWidthPx
            : currentState.workspaceWidthPx

        return {
          ...currentState,
          modeBySurface,
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
    modeBySurface: state.modeBySurface,
    workspaceWidthPx: state.workspaceWidthPx,
  }
}

function setBenchPresentationModePreference(input: { target: BenchTarget; mode: BenchMode }): void {
  useBenchPresentationPreferencesStore.getState().setModePreference(input)
}

export function setBenchPresentationWorkspaceWidth(widthPx: number): void {
  useBenchPresentationPreferencesStore.getState().setWorkspaceWidth(widthPx)
}

export function finalizeBenchModeTransition(input: {
  target: BenchTarget
  mode: BenchMode
  persistPreference: boolean
  result: Pick<DirectoryWorkspaceCommandResult, "outcome" | "projection">
}): boolean {
  if (
    input.result.outcome !== "committed" ||
    input.result.projection.route.status !== "open" ||
    input.result.projection.route.mode !== input.mode
  ) {
    return false
  }

  if (input.persistPreference) {
    setBenchPresentationModePreference({
      target: input.target,
      mode: input.mode,
    })
  }
  return true
}

export { readBenchPresentationPreferences, setBenchPresentationModePreference }
