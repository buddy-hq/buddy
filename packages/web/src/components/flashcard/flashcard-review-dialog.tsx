import { useCallback, useEffect, useRef, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@buddy/ui"
import { language } from "@/context/language"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"
import { FlashcardCardDisplay } from "./flashcard-card-display"
import { FlashcardReviewRatings } from "./flashcard-review-ratings"
import type {
  FlashcardDecksReadResponse,
  FlashcardDecksNextCardResponse,
  FlashcardDecksSubmitReviewResponse,
} from "@buddy/sdk/types"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CardRating = "again" | "hard" | "good" | "easy"

type ReviewPhase =
  | { kind: "loading" }
  | { kind: "no-due" }
  | { kind: "card"; card: FlashcardDecksNextCardResponse["card"] & {} }
  | { kind: "complete" }
  | { kind: "error"; message: string }

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type FlashcardReviewDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  directory: string
  deckID: string
  deckTitle: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FlashcardReviewDialog({
  open,
  onOpenChange,
  directory,
  deckID,
  deckTitle,
}: FlashcardReviewDialogProps) {
  const [deck, setDeck] = useState<FlashcardDecksReadResponse | null>(null)
  const [phase, setPhase] = useState<ReviewPhase>({ kind: "loading" })
  const [revealed, setRevealed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [leechWarning, setLeechWarning] = useState(false)
  const [cardsReviewed, setCardsReviewed] = useState(0)
  const cardsReviewedRef = useRef(0)
  const cardStartTimeRef = useRef(Date.now())

  const fetchNextCard = useCallback(
    async (deckData: FlashcardDecksReadResponse): Promise<void> => {
      try {
        const client = getBuddyClient(directory)
        const response = requireBuddyData(
          await client.flashcardDecks.nextCard({ deckID: deckData.deckID }),
        )
        if (response.card === null) {
          setPhase(cardsReviewedRef.current > 0 ? { kind: "complete" } : { kind: "no-due" })
        } else {
          setPhase({ kind: "card", card: response.card })
          setRevealed(false)
          setLeechWarning(false)
          cardStartTimeRef.current = Date.now()
        }
      } catch (err) {
        setPhase({ kind: "error", message: err instanceof Error ? err.message : String(err) })
      }
    },
    [directory],
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
        const deckData = requireBuddyData(await client.flashcardDecks.read({ deckID }))
        if (cancelled) return
        setDeck(deckData)
        await fetchNextCard(deckData)
      } catch (err) {
        if (cancelled) return
        setPhase({ kind: "error", message: err instanceof Error ? err.message : String(err) })
      }
    }

    void init()
    return () => {
      cancelled = true
    }
  }, [open, directory, deckID, fetchNextCard])

  const handleRate = useCallback(
    async (rating: CardRating) => {
      if (phase.kind !== "card" || !deck || submitting) return

      setSubmitting(true)
      const timeTakenMs = Date.now() - cardStartTimeRef.current

      try {
        const client = getBuddyClient(directory)
        const result: FlashcardDecksSubmitReviewResponse = requireBuddyData(
          await client.flashcardDecks.submitReview({
            deckID,
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
        setSubmitting(false)

        if (result.isLeech) {
          await new Promise((resolve) => setTimeout(resolve, 1200))
        }

        await fetchNextCard(deck)
      } catch (err) {
        setSubmitting(false)
        setPhase({ kind: "error", message: err instanceof Error ? err.message : String(err) })
      }
    },
    [phase, deck, submitting, directory, deckID, fetchNextCard],
  )

  const handleReveal = useCallback(() => {
    setRevealed(true)
  }, [])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle className="truncate text-sm">{deckTitle}</DialogTitle>
          <DialogDescription className="sr-only">
            {language.t("workspaceFlashcard.review")}
          </DialogDescription>
        </DialogHeader>

        <ReviewContent
          phase={phase}
          deck={deck}
          revealed={revealed}
          submitting={submitting}
          leechWarning={leechWarning}
          cardsReviewed={cardsReviewed}
          onReveal={handleReveal}
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
  deck: FlashcardDecksReadResponse | null
  revealed: boolean
  submitting: boolean
  leechWarning: boolean
  cardsReviewed: number
  onReveal: () => void
  onRate: (rating: CardRating) => void
}) {
  const { phase, deck, revealed, submitting, leechWarning, cardsReviewed, onReveal, onRate } = props

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
    (n: FlashcardDecksReadResponse["notes"][number]) => n.noteID === phase.card.noteID,
  )

  if (!note) {
    return (
      <div className="flex min-h-[14rem] items-center justify-center">
        <p className="text-xs text-text-weak">{language.t("workspaceFlashcard.reviewError")}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <div className="overflow-hidden rounded-lg border border-border-base/40 bg-surface-raised-base/50">
        <FlashcardCardDisplay
          note={note}
          templateIdx={phase.card.templateIdx}
          revealed={revealed}
          onReveal={onReveal}
        />
      </div>

      {leechWarning ? (
        <p className="mt-2 text-center text-[11px] text-icon-warning-base">
          {language.t("workspaceFlashcard.leechWarning")}
        </p>
      ) : null}

      {revealed ? (
        <div className="mt-3">
          <FlashcardReviewRatings onRate={onRate} disabled={submitting} />
        </div>
      ) : null}
    </div>
  )
}
