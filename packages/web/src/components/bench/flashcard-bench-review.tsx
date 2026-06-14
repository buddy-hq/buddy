import { useCallback, useEffect, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { BenchViewerShell } from "@/components/bench/bench-viewer-shell"
import {
  ReviewContent,
  type CardRating,
  type ReviewPhase,
} from "@/components/flashcard/flashcard-review-content"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"
import {
  workspaceArtifactsQueryKeys,
  workspaceFlashcardDecksQueryOptions,
} from "@/state/workspace-artifacts-query"
import { artifactKindFilter } from "@/components/layout/chat-left-sidebar/library-artifact-selectors"
import type {
  FlashcardDeckReadResponse,
  FlashcardDeckSubmitReviewResponse,
} from "@buddy/sdk/types"

type FlashcardBenchReviewProps = {
  directory: string
  artifactID: string
  deck: FlashcardDeckReadResponse
}

type FetchNextCardOptions = {
  shouldApplyResult?: () => boolean
}

export function FlashcardBenchReview(props: FlashcardBenchReviewProps) {
  const queryClient = useQueryClient()
  const decksQuery = useQuery(workspaceFlashcardDecksQueryOptions(props.directory))
  const liveDeck = decksQuery.data?.artifacts
    .filter(artifactKindFilter("flashcard-deck"))
    .find((deck) => deck.artifactID === props.artifactID)
  const [deck, setDeck] = useState<FlashcardDeckReadResponse>(props.deck)
  const [phase, setPhase] = useState<ReviewPhase>({ kind: "loading" })
  const [revealed, setRevealed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [leechWarning, setLeechWarning] = useState(false)
  const [cardsReviewed, setCardsReviewed] = useState(0)
  const [swipeDirection, setSwipeDirection] = useState<1 | -1 | null>(null)
  const [swipeRating, setSwipeRating] = useState<CardRating | null>(null)
  const cardsReviewedRef = useRef(0)
  const cardStartTimeRef = useRef(Date.now())

  const fetchNextCard = useCallback(async (options?: FetchNextCardOptions): Promise<void> => {
    try {
      const response = requireBuddyData(
        await getBuddyClient(props.directory).flashcardDeck.nextCard({
          directory: props.directory,
          artifactID: props.artifactID,
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
  }, [props.artifactID, props.directory])

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
        const result: FlashcardDeckSubmitReviewResponse = requireBuddyData(
          await getBuddyClient(props.directory).flashcardDeck.submitReview({
            directory: props.directory,
            artifactID: props.artifactID,
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
        void queryClient.invalidateQueries({
          queryKey: workspaceArtifactsQueryKeys.flashcard(props.directory),
        })
        setSubmitting(false)
      } catch (error) {
        setSubmitting(false)
        setPhase({
          kind: "error",
          message: error instanceof Error ? error.message : String(error),
        })
      }
    },
    [fetchNextCard, phase, props.artifactID, props.directory, queryClient, submitting],
  )

  return (
    <BenchViewerShell title={props.deck.title} contentClassName="overflow-hidden">
      <ReviewContent
        phase={phase}
        deck={deck}
        liveDeck={liveDeck}
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
