import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { artifactRef, artifactTarget } from "@/components/bench/bench-context-utils"
import { useRegisterBenchContextProvider } from "@/components/bench/bench-route-context"
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
import { buildFlashcardVisibleContent } from "@/components/flashcard/flashcard-card-content"

type FlashcardBenchReviewProps = {
  directory: string
  artifactID: string
  route: string
  deck: FlashcardDeckReadResponse
}

type FetchNextCardOptions = {
  shouldApplyResult?: () => boolean
}

function buildFlashcardContextContent(input: {
  phase: ReviewPhase
  deck: FlashcardDeckReadResponse
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
  const contextProvider = useMemo(
    () => ({
      read: () => ({
        status: "open" as const,
        target: artifactTarget({
          artifactKind: "flashcard-deck",
          directory: props.directory,
          title: deck.title,
          artifactID: props.artifactID,
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
          artifactRef({
            artifactID: props.artifactID,
            note: "Flashcard deck artifact on Bench.",
          }),
        ],
        hints: ["Do not include hidden answer text until it is revealed."],
      }),
    }),
    [
      cardsReviewed,
      deck,
      phase,
      props.artifactID,
      props.directory,
      props.route,
      revealed,
    ],
  )
  useRegisterBenchContextProvider(contextProvider)

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
