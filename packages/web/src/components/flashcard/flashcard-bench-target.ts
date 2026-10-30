import { createBenchObjectTarget } from "@/components/layout/chat-left-sidebar/library-object-selectors"
import {
  benchSurfaceUiKey,
  emptyFlashcardReviewTally,
  writeFlashcardDeckSurfaceState,
  readFlashcardDeckSurfaceState,
  type FlashcardDeckSurfaceMode,
} from "@/state/bench-surface-ui-state"
import {
  loadObjectFlashcardDeckPayload,
  loadObjectFlashcardDeckQueue,
} from "@/state/workspace-objects-query"
import { stringifyError } from "@/lib/api-client"
import { resolveFlashcardStanding } from "./flashcard-deck-standing"
import {
  readFlashcardResetAttempt,
  readFlashcardResetAttemptCount,
} from "./flashcard-reset-attempt"
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
      { mode: input.mode, requestedMode: input.mode },
      input.mode === "review" ? { reviewTally: emptyFlashcardReviewTally() } : undefined,
    ),
  )
  return target
}

class FlashcardBenchOpenError extends Error {
  readonly _tag = "FlashcardBenchOpenError"

  constructor(
    readonly objectID: string,
    cause: unknown,
  ) {
    super(stringifyError(cause), { cause })
    this.name = "FlashcardBenchOpenError"
  }
}

type FlashcardBenchOpenResult =
  | { status: "ready" }
  | { status: "error"; error: FlashcardBenchOpenError }

export async function prepareFlashcardBenchOpen(input: {
  directory: string
  target: BenchTarget
}): Promise<FlashcardBenchOpenResult> {
  if (input.target.type !== "object" || input.target.ref.kind !== "flashcard-deck") {
    return { status: "ready" }
  }
  const query = { directory: input.directory, objectID: input.target.ref.objectID }
  const key = benchSurfaceUiKey(input)
  const keepResetSitting = (): FlashcardBenchOpenResult => {
    writeFlashcardDeckSurfaceState(key, { mode: "review", requestedMode: undefined })
    return { status: "ready" }
  }
  if (readFlashcardResetAttempt(query)) return keepResetSitting()
  const resetAttemptsBeforeLoad = readFlashcardResetAttemptCount(query)
  try {
    const [deck, queue] = await Promise.all([
      loadObjectFlashcardDeckPayload(query),
      loadObjectFlashcardDeckQueue(query),
    ])
    if (readFlashcardResetAttemptCount(query) !== resetAttemptsBeforeLoad) {
      return keepResetSitting()
    }
    const current = readFlashcardDeckSurfaceState(key)
    const completed =
      deck.cards.length > 0 &&
      resolveFlashcardStanding({ deck, queue, now: Date.now() }).id === "clear"
    writeFlashcardDeckSurfaceState(key, {
      mode: completed ? "done" : (current.requestedMode ?? "deck"),
      requestedMode: undefined,
      reviewMode: "scheduled",
      resetError: undefined,
      openSequence: (current.openSequence ?? 0) + 1,
      reviewTally: emptyFlashcardReviewTally(),
    })
    return { status: "ready" }
  } catch (cause) {
    return { status: "error", error: new FlashcardBenchOpenError(query.objectID, cause) }
  }
}
