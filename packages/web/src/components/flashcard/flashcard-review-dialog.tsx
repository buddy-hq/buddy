import { useCallback, useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "motion/react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@buddy/ui"
import { language } from "@/context/language"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"
import {
  workspaceArtifactsQueryKeys,
  workspaceFlashcardDecksQueryOptions,
} from "@/state/workspace-artifacts-query"
import {
  artifactKindFilter,
  type FlashcardDeckLibraryArtifact,
} from "@/components/layout/chat-left-sidebar/library-artifact-selectors"
import { FlashcardCardDisplay } from "./flashcard-card-display"
import { FlashcardReviewRatings } from "./flashcard-review-ratings"
import { DueCountsBadges } from "@/components/layout/workspace-flashcard-panel"
import type {
  FlashcardDeckReadResponse,
  FlashcardDeckNextCardResponse,
  FlashcardDeckSubmitReviewResponse,
} from "@buddy/sdk/types"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CardRating = "again" | "hard" | "good" | "easy"

type ReviewPhase =
  | { kind: "loading" }
  | { kind: "no-due" }
  | { kind: "card"; card: FlashcardDeckNextCardResponse["card"] & {} }
  | { kind: "complete" }
  | { kind: "error"; message: string }

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type FlashcardReviewDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  directory: string
  artifactID: string
  deckTitle: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FlashcardReviewDialog({
  open,
  onOpenChange,
  directory,
  artifactID,
  deckTitle,
}: FlashcardReviewDialogProps) {
  const queryClient = useQueryClient()
  const decksQuery = useQuery(workspaceFlashcardDecksQueryOptions(directory))
  const liveDeck = decksQuery.data?.artifacts
    .filter(artifactKindFilter("flashcard-deck"))
    .find((d) => d.artifactID === artifactID)
  const [deck, setDeck] = useState<FlashcardDeckReadResponse | null>(null)
  const [phase, setPhase] = useState<ReviewPhase>({ kind: "loading" })
  const [revealed, setRevealed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [leechWarning, setLeechWarning] = useState(false)
  const [cardsReviewed, setCardsReviewed] = useState(0)
  const [swipeDirection, setSwipeDirection] = useState<1 | -1 | null>(null)
  const [swipeRating, setSwipeRating] = useState<CardRating | null>(null)
  const cardsReviewedRef = useRef(0)
  const cardStartTimeRef = useRef(Date.now())

  const fetchNextCard = useCallback(
    async (): Promise<void> => {
      try {
        const client = getBuddyClient(directory)
        const response = requireBuddyData(
          await client.flashcardDeck.nextCard({ artifactID }),
        )
        if (response.card === null) {
          setPhase(cardsReviewedRef.current > 0 ? { kind: "complete" } : { kind: "no-due" })
        } else {
          setPhase({ kind: "card", card: response.card })
          setRevealed(false)
          setLeechWarning(false)
          cardStartTimeRef.current = Date.now()
          setSwipeRating(null)
          setSwipeDirection(null)
        }
      } catch (err) {
        setPhase({ kind: "error", message: err instanceof Error ? err.message : String(err) })
      }
    },
    [artifactID, directory],
  )

  // Reset state when dialog opens
  useEffect(() => {
    if (!open) return

    let cancelled = false
    setDeck(null)
    setPhase({ kind: "loading" })
    setRevealed(false)
    setSubmitting(false)
    setLeechWarning(false)
    setCardsReviewed(0)
    cardsReviewedRef.current = 0

    async function init() {
      try {
        const client = getBuddyClient(directory)
        const deckData = requireBuddyData(await client.flashcardDeck.read({ artifactID }))
        if (cancelled) return
        setDeck(deckData)
        await fetchNextCard()
      } catch (err) {
        if (cancelled) return
        setPhase({ kind: "error", message: err instanceof Error ? err.message : String(err) })
      }
    }

    void init()
    return () => {
      cancelled = true
    }
  }, [open, directory, artifactID, fetchNextCard])

  const handleRate = useCallback(
    async (rating: CardRating) => {
      if (phase.kind !== "card" || !deck || submitting) return

      setSubmitting(true)
      const timeTakenMs = Date.now() - cardStartTimeRef.current

      // "again" or "hard" swipes left (-1). "good" or "easy" swipes right (1).
      setSwipeDirection(rating === "again" || rating === "hard" ? -1 : 1)
      setSwipeRating(rating)

      try {
        const client = getBuddyClient(directory)
        const result: FlashcardDeckSubmitReviewResponse = requireBuddyData(
          await client.flashcardDeck.submitReview({
            artifactID,
            cardID: phase.card.cardID,
            rating,
            timeTakenMs,
          }),
        )

        if (result.isLeech) {
          setLeechWarning(true)
        }

        cardsReviewedRef.current += 1
        setCardsReviewed(cardsReviewedRef.current)

        if (result.isLeech) {
          await new Promise((resolve) => setTimeout(resolve, 1200))
        }

        await fetchNextCard()
        void queryClient.invalidateQueries({
          queryKey: workspaceArtifactsQueryKeys.flashcard(directory),
        })
        setSubmitting(false)
      } catch (err) {
        setSubmitting(false)
        setPhase({ kind: "error", message: err instanceof Error ? err.message : String(err) })
      }
    },
    [phase, deck, submitting, directory, artifactID, fetchNextCard, queryClient],
  )

  const handleToggleReveal = useCallback(() => {
    setRevealed((prev) => !prev)
  }, [])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[min(90vh,60rem)] w-[95vw] !max-w-[95vw] sm:!max-w-[95vw] h-[85vh] flex-col overflow-hidden"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle className="truncate text-sm">{deckTitle}</DialogTitle>
          <DialogDescription className="sr-only">
            {language.t("workspaceFlashcard.review")}
          </DialogDescription>
        </DialogHeader>

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
          onToggleReveal={handleToggleReveal}
          onRate={handleRate}
        />
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Internal components
// ---------------------------------------------------------------------------

function ReviewContent(props: {
  phase: ReviewPhase
  deck: FlashcardDeckReadResponse | null
  liveDeck?: FlashcardDeckLibraryArtifact | null
  revealed: boolean
  submitting: boolean
  leechWarning: boolean
  cardsReviewed: number
  swipeDirection: 1 | -1 | null
  swipeRating: CardRating | null
  onToggleReveal: () => void
  onRate: (rating: CardRating) => void
}) {
  const {
    phase,
    deck,
    liveDeck,
    revealed,
    submitting,
    leechWarning,
    cardsReviewed,
    swipeDirection,
    swipeRating,
    onToggleReveal,
    onRate,
  } = props

  if (phase.kind === "loading") {
    return (
      <div className="flex min-h-[14rem] items-center justify-center">
        <span className="text-sm text-text-weak">
          {language.t("workspaceFlashcard.loadingDeck")}
        </span>
      </div>
    )
  }

  if (phase.kind === "error") {
    return (
      <div className="flex min-h-[14rem] items-center justify-center px-4">
        <p className="rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 px-3 py-2 text-xs text-icon-critical-base">
          {phase.message}
        </p>
      </div>
    )
  }

  if (phase.kind === "no-due") {
    return (
      <div className="flex min-h-[14rem] items-center justify-center px-4 text-center">
        <p className="text-sm text-text-weak">{language.t("workspaceFlashcard.noDueCards")}</p>
      </div>
    )
  }

  if (phase.kind === "complete") {
    return (
      <div className="flex min-h-[14rem] flex-col items-center justify-center gap-1.5 px-4 text-center">
        <p className="text-sm font-medium text-text-base">
          {language.t("workspaceFlashcard.reviewComplete")}
        </p>
        <p className="text-xs text-text-weak">
          {language.t("workspaceFlashcard.cardProgress", { current: cardsReviewed })}
        </p>
      </div>
    )
  }

  // phase.kind === "card"
  const note = deck?.notes.find(
    (n: FlashcardDeckReadResponse["notes"][number]) => n.noteID === phase.card.noteID,
  )

  if (!note) {
    return (
      <div className="flex min-h-[14rem] items-center justify-center">
        <p className="text-xs text-text-weak">{language.t("workspaceFlashcard.reviewError")}</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-border-base/30 bg-surface-base px-6 py-3">
        <div className="text-xs font-medium text-text-weak">
          Reviewed: <span className="text-text-base">{cardsReviewed}</span>
        </div>
        {liveDeck ? <DueCountsBadges dueCounts={liveDeck.summary.dueCounts} /> : null}
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-8 perspective-[1200px]">
        <div className="relative h-full w-full max-w-[50rem]">
          <AnimatePresence mode="wait" custom={swipeDirection}>
            <motion.div
              key={phase.card.cardID}
              custom={swipeDirection}
              initial={{
                opacity: 0,
                scale: 0.9,
                x: swipeDirection ? (swipeDirection === 1 ? -50 : 50) : 0,
                rotate: swipeDirection ? (swipeDirection === 1 ? -5 : 5) : 0,
              }}
              animate={{ opacity: 1, scale: 1, x: 0, rotate: 0 }}
              exit={{
                opacity: 0,
                x: swipeDirection ? (swipeDirection === 1 ? 300 : -300) : 0,
                rotate: swipeDirection ? (swipeDirection === 1 ? 15 : -15) : 0,
              }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
              className="absolute inset-0"
            >
              <FlashcardCardDisplay
                note={note}
                templateIdx={phase.card.templateIdx}
                revealed={revealed}
                onToggleReveal={onToggleReveal}
                swipeRating={swipeRating}
              />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {leechWarning ? (
        <p className="mt-2 text-center text-[11px] text-icon-warning-base">
          {language.t("workspaceFlashcard.leechWarning")}
        </p>
      ) : null}

      <div className="mt-4 flex min-h-[80px] shrink-0 flex-col items-center justify-center transition-opacity duration-300 pb-4">
        {revealed ? <FlashcardReviewRatings onRate={onRate} disabled={submitting} /> : null}
      </div>
    </div>
  )
}
