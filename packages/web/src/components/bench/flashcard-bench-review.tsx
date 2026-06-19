import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { objectRef, objectTarget } from "@/components/bench/bench-context-utils"
import { useRegisterBenchContextProvider } from "@/components/bench/bench-route-context"
import { BenchViewerShell } from "@/components/bench/bench-viewer-shell"
import {
  ReviewContent,
  type CardRating,
  type ReviewPhase,
} from "@/components/flashcard/flashcard-review-content"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"
import type {
  ObjectFlashcardDeckReadDeckResponse,
  ObjectFlashcardDeckSubmitReviewResponse,
} from "@buddy/sdk/types"
import { buildFlashcardVisibleContent } from "@/components/flashcard/flashcard-card-content"

type FlashcardBenchReviewProps = {
  directory: string
  objectID: string
  route: string
  deck: ObjectFlashcardDeckReadDeckResponse
}

type FetchNextCardOptions = {
  shouldApplyResult?: () => boolean
}

function buildFlashcardContextContent(input: {
  phase: ReviewPhase
  deck: ObjectFlashcardDeckReadDeckResponse
  revealed: boolean
  cardsReviewed: number
}): string {
  if (input.phase.kind === "loading") {
    return "Flashcard review is loading the next card."
  }

  if (input.phase.kind === "error") {
    return `Flashcard review error: ${input.phase.message}`
  }

  if (input.phase.kind === "no-due") {
    return "Flashcard review is open. There are no due cards."
  }

  if (input.phase.kind === "complete") {
    return `Flashcard review is complete. Cards reviewed this session: ${input.cardsReviewed}.`
  }

  const cardPhase = input.phase
  const note = input.deck.notes.find((entry) => entry.noteID === cardPhase.card.noteID)
  if (!note) {
    return "Flashcard review is open, but the current card note is unavailable."
  }

  const visibleContent = buildFlashcardVisibleContent({
    note,
    templateIdx: cardPhase.card.templateIdx,
    revealed: input.revealed,
  })

  return [
    `Flashcard review: ${input.deck.title}`,
    `Current card: ${cardPhase.card.cardID}`,
    `Revealed: ${input.revealed}`,
    `Front:\n${visibleContent.frontText}`,
    visibleContent.backText ? `Back:\n${visibleContent.backText}` : "Back: hidden until revealed",
  ].join("\n\n")
}

export function FlashcardBenchReview(props: FlashcardBenchReviewProps) {
  const [deck, setDeck] = useState<ObjectFlashcardDeckReadDeckResponse>(props.deck)
  const [phase, setPhase] = useState<ReviewPhase>({ kind: "loading" })
  const [revealed, setRevealed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [leechWarning, setLeechWarning] = useState(false)
  const [cardsReviewed, setCardsReviewed] = useState(0)
  const [swipeDirection, setSwipeDirection] = useState<1 | -1 | null>(null)
  const [swipeRating, setSwipeRating] = useState<CardRating | null>(null)
  const cardsReviewedRef = useRef(0)
  const cardStartTimeRef = useRef(Date.now())
  const contextProvider = useMemo(
    () => ({
      read: () => ({
        status: "open" as const,
        target: objectTarget({
          directory: props.directory,
          title: deck.title,
          target: {
            type: "object",
            ref: {
              kind: "flashcard-deck",
              objectID: props.objectID,
              revisionID: null,
              itemID: null,
            },
            viewID: "review",
          },
          route: props.route,
          status: phase.kind === "error" ? "error" : phase.kind === "loading" ? "loading" : "ready",
        }),
        metadata: [
          `review_phase: ${phase.kind}`,
          `revealed: ${revealed}`,
          `cards_reviewed: ${cardsReviewed}`,
          `card_id: ${phase.kind === "card" ? phase.card.cardID : "none"}`,
          `note_id: ${phase.kind === "card" ? phase.card.noteID : "none"}`,
          `template_idx: ${phase.kind === "card" ? phase.card.templateIdx : "none"}`,
        ],
        content: buildFlashcardContextContent({
          phase,
          deck,
          revealed,
          cardsReviewed,
        }),
        refs: [
          objectRef({
            objectID: props.objectID,
            note: "Flashcard deck object on Bench.",
          }),
        ],
        hints: ["Do not include hidden answer text until it is revealed."],
      }),
    }),
    [cardsReviewed, deck, phase, props.directory, props.objectID, props.route, revealed],
  )
  useRegisterBenchContextProvider(contextProvider)

  const fetchNextCard = useCallback(
    async (options?: FetchNextCardOptions): Promise<void> => {
      try {
        const response = requireBuddyData(
          await getBuddyClient(props.directory).objectFlashcardDeck.nextCard({
            directory: props.directory,
            objectID: props.objectID,
          }),
        )
        if (options?.shouldApplyResult?.() === false) return

        if (response.card === null) {
          setPhase(cardsReviewedRef.current > 0 ? { kind: "complete" } : { kind: "no-due" })
          return
        }

        setPhase({ kind: "card", card: response.card })
        setRevealed(false)
        setLeechWarning(false)
        cardStartTimeRef.current = Date.now()
        setSwipeRating(null)
        setSwipeDirection(null)
      } catch (error) {
        if (options?.shouldApplyResult?.() === false) return
        setPhase({ kind: "error", message: error instanceof Error ? error.message : String(error) })
      }
    },
    [props.directory, props.objectID],
  )

  useEffect(() => {
    let active = true
    setDeck(props.deck)
    setPhase({ kind: "loading" })
    setRevealed(false)
    setSubmitting(false)
    setLeechWarning(false)
    setCardsReviewed(0)
    cardsReviewedRef.current = 0

    void fetchNextCard({ shouldApplyResult: () => active })
    return () => {
      active = false
    }
  }, [fetchNextCard, props.deck])

  const handleRate = useCallback(
    async (rating: CardRating) => {
      if (phase.kind !== "card" || submitting) return

      setSubmitting(true)
      const timeTakenMs = Date.now() - cardStartTimeRef.current
      setSwipeDirection(rating === "again" || rating === "hard" ? -1 : 1)
      setSwipeRating(rating)

      try {
        const result: ObjectFlashcardDeckSubmitReviewResponse = requireBuddyData(
          await getBuddyClient(props.directory).objectFlashcardDeck.submitReview({
            directory: props.directory,
            objectID: props.objectID,
            cardID: phase.card.cardID,
            rating,
            timeTakenMs,
          }),
        )

        if (result.isLeech) {
          setLeechWarning(true)
          await new Promise((resolve) => setTimeout(resolve, 1200))
        }

        cardsReviewedRef.current += 1
        setCardsReviewed(cardsReviewedRef.current)
        await fetchNextCard()
        setSubmitting(false)
      } catch (error) {
        setSubmitting(false)
        setPhase({
          kind: "error",
          message: error instanceof Error ? error.message : String(error),
        })
      }
    },
    [fetchNextCard, phase, props.directory, props.objectID, submitting],
  )

  return (
    <BenchViewerShell title={props.deck.title} contentClassName="overflow-hidden">
      <ReviewContent
        phase={phase}
        deck={deck}
        revealed={revealed}
        submitting={submitting}
        leechWarning={leechWarning}
        cardsReviewed={cardsReviewed}
        swipeDirection={swipeDirection}
        swipeRating={swipeRating}
        onToggleReveal={() => setRevealed((current) => !current)}
        onRate={handleRate}
      />
    </BenchViewerShell>
  )
}
