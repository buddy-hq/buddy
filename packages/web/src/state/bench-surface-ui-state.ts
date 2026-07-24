import { create } from "zustand"
import { benchTargetKey, type BenchTarget } from "@/lib/bench-navigation"

/**
 * Durable per-target UI state for Bench surfaces.
 *
 * Keep-alive is bounded, so a surface can still be evicted and remounted. This store is the
 * correctness floor underneath it: whatever a surface records here survives eviction, remounting,
 * and directory changes, so an evicted surface comes back where the user left it instead of at its
 * initial state. It holds only small, serializable presentation values — never live instances.
 */

export type BenchSurfaceViewportState = {
  scrollTop?: number
  scrollLeft?: number
  zoom?: number
  panX?: number
  panY?: number
  autoFit?: boolean
}

const BENCH_SURFACE_VIEWPORT_LIMIT = 48

type BenchSurfaceUiStateStore = {
  viewportByKey: Record<string, BenchSurfaceViewportState>
  readViewport: (key: string) => BenchSurfaceViewportState | undefined
  writeViewport: (key: string, viewport: BenchSurfaceViewportState) => void
  clearViewport: (key: string) => void
}

export const useBenchSurfaceUiState = create<BenchSurfaceUiStateStore>((set, get) => ({
  viewportByKey: {},
  readViewport: (key) => get().viewportByKey[key],
  writeViewport: (key, viewport) =>
    set((state) => {
      const { [key]: currentViewport, ...remaining } = state.viewportByKey
      const nextEntries = Object.entries({
        ...remaining,
        [key]: { ...currentViewport, ...viewport },
      })
      return {
        viewportByKey: Object.fromEntries(nextEntries.slice(-BENCH_SURFACE_VIEWPORT_LIMIT)),
      }
    }),
  clearViewport: (key) =>
    set((state) => {
      if (!(key in state.viewportByKey)) return state
      const { [key]: _removed, ...remaining } = state.viewportByKey
      return { viewportByKey: remaining }
    }),
}))

export function benchSurfaceUiKey(input: { directory: string; target: BenchTarget }): string {
  return JSON.stringify([input.directory, benchTargetKey(input.target)])
}

export function readBenchSurfaceViewport(key: string): BenchSurfaceViewportState | undefined {
  return useBenchSurfaceUiState.getState().readViewport(key)
}

export function writeBenchSurfaceViewport(
  key: string,
  viewport: BenchSurfaceViewportState,
): void {
  useBenchSurfaceUiState.getState().writeViewport(key, viewport)
}
