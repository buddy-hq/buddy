import { createBenchObjectTarget } from "@/components/layout/chat-left-sidebar/library-object-selectors"
import {
  benchSurfaceUiKey,
  emptyFlashcardReviewTally,
  writeFlashcardDeckSurfaceState,
  type FlashcardDeckSurfaceMode,
} from "@/state/bench-surface-ui-state"
import type { BenchTarget } from "@/lib/bench-navigation"

/**
 * Selects a flashcard deck target and its initial surface mode atomically.
 * Drawer rows and summary links must agree on this ordering so the newly
 * committed route never renders a stale mode from an earlier visit.
 */
export function prepareFlashcardBenchTarget(input: {
  directory: string
  objectID: string
  mode: FlashcardDeckSurfaceMode
}): BenchTarget {
  const target = createBenchObjectTarget("flashcard-deck", input.objectID)
  writeFlashcardDeckSurfaceState(
    benchSurfaceUiKey({ directory: input.directory, target }),
    Object.assign(
      { mode: input.mode },
      input.mode === "review" ? { reviewTally: emptyFlashcardReviewTally() } : undefined,
    ),
  )
  return target
}
