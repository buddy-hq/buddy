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

/**
 * Which mode a flashcard deck surface is in.
 *
 * A deck is one bench target with several modes rather than several targets,
 * so the mode belongs to the target's durable state: a surface evicted
 * mid-session must come back mid-session, not at the deck's front page.
 */
export type FlashcardDeckSurfaceMode = "deck" | "review" | "practice" | "done"

export type FlashcardReviewTallyState = {
  reviewed: number
  elapsedMs: number
  ratings: {
    again: number
    hard: number
    good: number
    easy: number
  }
}

export function emptyFlashcardReviewTally(): FlashcardReviewTallyState {
  return {
    reviewed: 0,
    elapsedMs: 0,
    ratings: { again: 0, hard: 0, good: 0, easy: 0 },
  }
}

export type FlashcardDeckSurfaceState = {
  mode: FlashcardDeckSurfaceMode
  peekCardID?: string
  practiceIndex: number
  practiceRevealed: boolean
  reviewTally: FlashcardReviewTallyState
}

const FLASHCARD_DECK_SURFACE_DEFAULT: FlashcardDeckSurfaceState = {
  mode: "deck",
  practiceIndex: 0,
  practiceRevealed: false,
  reviewTally: emptyFlashcardReviewTally(),
}

type BenchSurfaceUiStateStore = {
  viewportByKey: Record<string, BenchSurfaceViewportState>
  flashcardDeckByKey: Record<string, FlashcardDeckSurfaceState>
  readViewport: (key: string) => BenchSurfaceViewportState | undefined
  writeViewport: (key: string, viewport: BenchSurfaceViewportState) => void
  clearViewport: (key: string) => void
  writeFlashcardDeck: (key: string, patch: Partial<FlashcardDeckSurfaceState>) => void
}

export const useBenchSurfaceUiState = create<BenchSurfaceUiStateStore>((set, get) => ({
  viewportByKey: {},
  flashcardDeckByKey: {},
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
  writeFlashcardDeck: (key, patch) =>
    set((state) => {
      const current = state.flashcardDeckByKey[key] ?? FLASHCARD_DECK_SURFACE_DEFAULT
      const next = { ...current, ...patch }
      const { [key]: _replaced, ...remaining } = state.flashcardDeckByKey
      return {
        flashcardDeckByKey: Object.fromEntries(
          Object.entries({ ...remaining, [key]: next }).slice(-BENCH_SURFACE_VIEWPORT_LIMIT),
        ),
      }
    }),
}))

export function benchSurfaceUiKey(input: { directory: string; target: BenchTarget }): string {
  return JSON.stringify([input.directory, benchTargetKey(input.target)])
}

export function readBenchSurfaceViewport(key: string): BenchSurfaceViewportState | undefined {
  return useBenchSurfaceUiState.getState().readViewport(key)
}

export function writeBenchSurfaceViewport(key: string, viewport: BenchSurfaceViewportState): void {
  useBenchSurfaceUiState.getState().writeViewport(key, viewport)
}

export function useFlashcardDeckSurfaceState(key: string): FlashcardDeckSurfaceState {
  return useBenchSurfaceUiState(
    (state) => state.flashcardDeckByKey[key] ?? FLASHCARD_DECK_SURFACE_DEFAULT,
  )
}

export function readFlashcardDeckSurfaceState(key: string): FlashcardDeckSurfaceState {
  return useBenchSurfaceUiState.getState().flashcardDeckByKey[key] ?? FLASHCARD_DECK_SURFACE_DEFAULT
}

export function writeFlashcardDeckSurfaceState(
  key: string,
  patch: Partial<FlashcardDeckSurfaceState>,
): void {
  useBenchSurfaceUiState.getState().writeFlashcardDeck(key, patch)
}
