import { useCallback, useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { language } from "@/context/language"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"
import {
  loadObjectFlashcardDeckPayload,
  loadObjectFlashcardDeckQueue,
  objectFlashcardDeckPayloadQueryOptions,
  objectFlashcardDeckQueueQueryOptions,
} from "@/state/workspace-objects-query"
import { FLASHCARD_QUEUE_REFETCH_FLOOR_MS, getFlashcardDueCount } from "@/lib/flashcard"
import { createIdempotencyKey, IDEMPOTENCY_KEY_PARAMETER } from "@/lib/idempotency"
import {
  emptyFlashcardReviewTally,
  type FlashcardReviewTallyState,
} from "@/state/bench-surface-ui-state"
import type {
  ObjectFlashcardDeckQueuedCardsResponse,
  ObjectFlashcardDeckReadDeckResponse,
  ObjectFlashcardDeckSubmitReviewResponse,
} from "@buddy/sdk/types"

/**
 * The review loop, owned once.
 *
 * Bench and the workspace panel used to carry near-identical copies of the
 * fetch → rate → queued-card cycle, which meant every scheduler fix had to be
 * made twice. Both now drive this hook and render `FlashcardReviewStage`; the
 * only thing a surface still owns is its own chrome around the stage.
 */

export type CardRating = "again" | "hard" | "good" | "easy"
export type ReviewCard = ObjectFlashcardDeckQueuedCardsResponse["cards"][number]
export type ReviewNote = ObjectFlashcardDeckReadDeckResponse["notes"][number]

export type ReviewPhase =
  | { kind: "loading" }
  | { kind: "no-due" }
  | { kind: "card"; card: ReviewCard }
  | { kind: "complete" }
  | { kind: "error"; message: string }

/** How long a leech flag stays on screen before the next card is dealt. */
const LEECH_DWELL_MS = 1200

/**
 * What this sitting produced, for the closing summary.
 *
 * `elapsedMs` totals the per-card times the client already sends with each
 * rating rather than wall-clock, so walking away mid-session doesn't turn into
 * an hour of "study time".
 */
export type FlashcardSessionTally = FlashcardReviewTallyState

export type FlashcardReviewSession = {
  deck: ObjectFlashcardDeckReadDeckResponse | null
  queue: ObjectFlashcardDeckQueuedCardsResponse | null
  phase: ReviewPhase
  tally: FlashcardSessionTally
  /** The note behind the current card, already resolved out of the deck. */
  note: ReviewNote | null
  revealed: boolean
  submitting: boolean
  /** True while the just-rated card is flagged as a leech. */
  leech: boolean
  cardsReviewed: number
  /** Live due count from the authoritative queue — drives the deck depth. */
  cardsRemaining: number
  /** The rating that ejected the previous card. Aims the throw. */
  lastRating: CardRating | null
  /**
   * Bumped every time a new phase is applied. Drives the enter/leave animation
   * on its own, so a card that legitimately repeats (a lapse re-entering the
   * learning queue) still animates instead of silently swapping in place.
   */
  seq: number
  toggleReveal: () => void
  rate: (rating: CardRating) => void
  retry: () => void
  /** Start a fresh sitting without requiring the owning surface to remount. */
  restart: (seedDeck?: ObjectFlashcardDeckReadDeckResponse) => void
}

type UseFlashcardReviewSessionInput = {
  directory: string
  objectID: string
  /** Surfaces that already hold the payload (Bench) can seed it. */
  initialDeck?: ObjectFlashcardDeckReadDeckResponse
  /** Called with the freshly reloaded deck after each rating lands. */
  onDeckRefreshed?: (deck: ObjectFlashcardDeckReadDeckResponse) => void
  /** Bench restores this after a bounded keep-alive eviction. */
  initialTally?: FlashcardSessionTally
  /** Bench persists each committed answer outside the component lifecycle. */
  onTallyChanged?: (tally: FlashcardSessionTally) => void
}

export function useFlashcardReviewSession(
  input: UseFlashcardReviewSessionInput,
): FlashcardReviewSession {
  const { directory, objectID, initialDeck } = input
  const queryClient = useQueryClient()

  const [deck, setDeck] = useState<ObjectFlashcardDeckReadDeckResponse | null>(initialDeck ?? null)
  const [queue, setQueue] = useState<ObjectFlashcardDeckQueuedCardsResponse | null>(null)
  const [phase, setPhase] = useState<ReviewPhase>({ kind: "loading" })
  const [revealed, setRevealed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [leech, setLeech] = useState(false)
  const [cardsReviewed, setCardsReviewed] = useState(input.initialTally?.reviewed ?? 0)
  const [lastRating, setLastRating] = useState<CardRating | null>(null)
  const [seq, setSeq] = useState(0)
  const [tally, setTally] = useState<FlashcardSessionTally>(
    input.initialTally ?? emptyFlashcardReviewTally(),
  )

  const cardsReviewedRef = useRef(input.initialTally?.reviewed ?? 0)
  const tallyRef = useRef(input.initialTally ?? emptyFlashcardReviewTally())
  const cardStartedAtRef = useRef(Date.now())
  const submissionInFlightRef = useRef(false)
  const queueLeaseRef = useRef<ObjectFlashcardDeckQueuedCardsResponse["queueLease"]>(null)
  /** Bumped on every (re)init so a late response from a previous deck is dropped. */
  const generationRef = useRef(0)

  const onDeckRefreshedRef = useRef(input.onDeckRefreshed)
  const initialTallyRef = useRef(input.initialTally)
  const onTallyChangedRef = useRef(input.onTallyChanged)
  initialTallyRef.current = input.initialTally
  useEffect(() => {
    onDeckRefreshedRef.current = input.onDeckRefreshed
  }, [input.onDeckRefreshed])
  useEffect(() => {
    onTallyChangedRef.current = input.onTallyChanged
  }, [input.onTallyChanged])

  const applyPhase = useCallback((next: ReviewPhase) => {
    setPhase(next)
    setSeq((current) => current + 1)
  }, [])

  const applyQueue = useCallback(
    (nextQueue: ObjectFlashcardDeckQueuedCardsResponse) => {
      setQueue(nextQueue)
      queueLeaseRef.current = nextQueue.queueLease
      queryClient.setQueryData(
        objectFlashcardDeckQueueQueryOptions({ directory, objectID }).queryKey,
        nextQueue,
      )
      const nextCard = nextQueue.cards[0]
      if (!nextCard) {
        applyPhase(cardsReviewedRef.current > 0 ? { kind: "complete" } : { kind: "no-due" })
        return
      }

      applyPhase({ kind: "card", card: nextCard })
      setRevealed(false)
      setLeech(false)
      cardStartedAtRef.current = Date.now()
    },
    [applyPhase, directory, objectID, queryClient],
  )

  const fetchQueue = useCallback(
    async (generation: number): Promise<void> => {
      try {
        const response = await loadObjectFlashcardDeckQueue({ directory, objectID })
        if (generationRef.current !== generation) return
        applyQueue(response)
      } catch (error) {
        if (generationRef.current !== generation) return
        applyPhase({ kind: "error", message: describeError(error) })
      }
    },
    [applyPhase, applyQueue, directory, objectID],
  )

  const beginSession = useCallback(
    (options: {
      seedDeck?: ObjectFlashcardDeckReadDeckResponse
      initialTally: FlashcardSessionTally
      reloadDeck: boolean
    }) => {
      const { seedDeck, initialTally, reloadDeck } = options
      generationRef.current += 1
      const generation = generationRef.current

      cardsReviewedRef.current = initialTally.reviewed
      tallyRef.current = initialTally
      submissionInFlightRef.current = false
      queueLeaseRef.current = null
      setCardsReviewed(initialTally.reviewed)
      setTally(initialTally)
      setRevealed(false)
      setSubmitting(false)
      setLeech(false)
      setLastRating(null)
      setPhase({ kind: "loading" })
      setDeck(seedDeck ?? null)
      setQueue(null)

      async function start() {
        try {
          const deckPromise =
            reloadDeck || !seedDeck
              ? loadObjectFlashcardDeckPayload({ directory, objectID })
              : Promise.resolve(seedDeck)
          const queuePromise = loadObjectFlashcardDeckQueue({ directory, objectID })
          const [loadedDeck, loadedQueue] = await Promise.all([deckPromise, queuePromise])
          if (generationRef.current !== generation) return
          setDeck(loadedDeck)
          queryClient.setQueryData(
            objectFlashcardDeckPayloadQueryOptions({ directory, objectID }).queryKey,
            loadedDeck,
          )
          applyQueue(loadedQueue)
        } catch (error) {
          if (generationRef.current !== generation) return
          applyPhase({ kind: "error", message: describeError(error) })
        }
      }

      void start()
    },
    [applyPhase, applyQueue, directory, objectID, queryClient],
  )

  // (Re)start the session whenever the target deck changes.
  useEffect(() => {
    const initialTally = initialTallyRef.current ?? emptyFlashcardReviewTally()
    beginSession({ seedDeck: initialDeck, initialTally, reloadDeck: false })
    return () => {
      generationRef.current += 1
    }
  }, [beginSession, initialDeck])

  const restart = useCallback(
    (seedDeck?: ObjectFlashcardDeckReadDeckResponse) => {
      const initialTally = emptyFlashcardReviewTally()
      onTallyChangedRef.current?.(initialTally)
      beginSession({ seedDeck, initialTally, reloadDeck: true })
    },
    [beginSession],
  )

  useEffect(() => {
    if (phase.kind !== "no-due" && phase.kind !== "complete") return
    const nextQueueAt = queue?.completion.nextQueueAt
    if (nextQueueAt === null || nextQueueAt === undefined) return

    const timeout = window.setTimeout(
      () => void fetchQueue(generationRef.current),
      Math.max(FLASHCARD_QUEUE_REFETCH_FLOOR_MS, nextQueueAt - Date.now()),
    )
    return () => window.clearTimeout(timeout)
  }, [fetchQueue, phase.kind, queue?.completion.nextQueueAt])

  const rate = useCallback(
    async (rating: CardRating) => {
      if (phase.kind !== "card" || submissionInFlightRef.current) return
      const generation = generationRef.current
      const queueLease = queueLeaseRef.current
      if (!queueLease || queueLease.card.cardID !== phase.card.cardID) {
        applyPhase({ kind: "error", message: language.t("workspaceFlashcard.queueChanged") })
        return
      }
      const tallyAtSubmission = tallyRef.current
      const persistTally = onTallyChangedRef.current

      submissionInFlightRef.current = true
      setSubmitting(true)
      setLastRating(rating)
      const timeTakenMs = Date.now() - cardStartedAtRef.current

      try {
        const result: ObjectFlashcardDeckSubmitReviewResponse = requireBuddyData(
          await getBuddyClient(directory).objectFlashcardDeck.submitReview({
            directory,
            objectID,
            [IDEMPOTENCY_KEY_PARAMETER]: createIdempotencyKey(),
            cardID: phase.card.cardID,
            queueLease,
            rating,
            timeTakenMs,
          }),
        )

        const nextTally: FlashcardSessionTally = {
          reviewed: tallyAtSubmission.reviewed + 1,
          elapsedMs: tallyAtSubmission.elapsedMs + timeTakenMs,
          ratings: {
            ...tallyAtSubmission.ratings,
            [rating]: tallyAtSubmission.ratings[rating] + 1,
          },
        }
        persistTally?.(nextTally)
        if (generationRef.current !== generation) return

        const refreshPromise = Promise.all([
          loadObjectFlashcardDeckPayload({ directory, objectID }),
          loadObjectFlashcardDeckQueue({ directory, objectID }),
        ])

        if (result.isLeech) {
          setLeech(true)
          await new Promise((resolve) => setTimeout(resolve, LEECH_DWELL_MS))
          if (generationRef.current !== generation) return
        }

        tallyRef.current = nextTally
        cardsReviewedRef.current = nextTally.reviewed
        setCardsReviewed(nextTally.reviewed)
        setTally(nextTally)

        const [refreshedDeck, refreshedQueue] = await refreshPromise
        if (generationRef.current !== generation) return
        setDeck(refreshedDeck)
        queryClient.setQueryData(
          objectFlashcardDeckPayloadQueryOptions({ directory, objectID }).queryKey,
          refreshedDeck,
        )
        onDeckRefreshedRef.current?.(refreshedDeck)
        applyQueue(refreshedQueue)
      } catch (error) {
        if (generationRef.current !== generation) return
        applyPhase({ kind: "error", message: describeError(error) })
      } finally {
        if (generationRef.current === generation) {
          submissionInFlightRef.current = false
          setSubmitting(false)
        }
      }
    },
    [applyPhase, applyQueue, directory, objectID, phase, queryClient],
  )

  const retry = useCallback(() => {
    generationRef.current += 1
    const generation = generationRef.current
    setPhase({ kind: "loading" })
    setLastRating(null)
    void Promise.all([
      deck ? Promise.resolve(deck) : loadObjectFlashcardDeckPayload({ directory, objectID }),
      loadObjectFlashcardDeckQueue({ directory, objectID }),
    ])
      .then(([loadedDeck, loadedQueue]) => {
        if (generationRef.current !== generation) return
        setDeck(loadedDeck)
        queryClient.setQueryData(
          objectFlashcardDeckPayloadQueryOptions({ directory, objectID }).queryKey,
          loadedDeck,
        )
        applyQueue(loadedQueue)
      })
      .catch((error) => {
        if (generationRef.current !== generation) return
        applyPhase({ kind: "error", message: describeError(error) })
      })
  }, [applyPhase, applyQueue, deck, directory, objectID, queryClient])

  const toggleReveal = useCallback(() => {
    setRevealed((current) => !current)
  }, [])

  const note =
    phase.kind === "card"
      ? (deck?.notes.find((entry) => entry.noteID === phase.card.noteID) ?? null)
      : null

  const cardsRemaining = getFlashcardDueCount(queue)

  return {
    deck,
    queue,
    phase,
    tally,
    note,
    revealed,
    submitting,
    leech,
    cardsReviewed,
    cardsRemaining,
    lastRating,
    seq,
    toggleReveal,
    rate: (rating) => void rate(rating),
    retry,
    restart,
  }
}

function describeError<TError>(error: TError): string {
  return error instanceof Error ? error.message : String(error)
}
