import { useCallback, useEffect, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { motion, AnimatePresence } from "motion/react"
import { ArrowLeftIcon } from "lucide-react"
import { Card, CardContent } from "@buddy/ui"
import { language } from "@/context/language"
import { stringifyError } from "@/lib/api-client"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"
import {
  getFlashcardDueCount,
  isFlashcardReviewAvailable,
  type FlashcardDueCounts,
} from "@/lib/flashcard"
import type {
  FlashcardDecksReadResponse,
  FlashcardDecksNextCardResponse,
  FlashcardDecksSubmitReviewResponse,
} from "@buddy/sdk/types"
import {
  workspaceArtifactsQueryKeys,
  workspaceFlashcardDecksQueryOptions,
} from "@/state/workspace-artifacts-query"
import { FlashcardCardDisplay } from "@/components/flashcard/flashcard-card-display"
import { FlashcardReviewRatings } from "@/components/flashcard/flashcard-review-ratings"
import { useInvalidateQueryOnChatIdle } from "@/components/layout/use-invalidate-query-on-chat-idle"

// ---------------------------------------------------------------------------
// Types (from generated SDK)
// ---------------------------------------------------------------------------

type CardRating = "again" | "hard" | "good" | "easy"

// ---------------------------------------------------------------------------
// Review session phases
// ---------------------------------------------------------------------------

type ReviewPhase =
  | { kind: "loading" }
  | { kind: "no-due" }
  | { kind: "card"; card: FlashcardDecksNextCardResponse["card"] & {} }
  | { kind: "complete" }
  | { kind: "error"; message: string }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function noteCountLabel(count: number): string {
  return language.t(
    count === 1 ? "workspaceFlashcard.noteCount.one" : "workspaceFlashcard.noteCount.other",
    { count },
  )
}

function cardCountLabel(count: number): string {
  return language.t(
    count === 1 ? "workspaceFlashcard.cardCount.one" : "workspaceFlashcard.cardCount.other",
    { count },
  )
}

function formatTimestamp(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return parsed.toLocaleString()
}

function findNote(deck: FlashcardDecksReadResponse, noteID: string) {
  return deck.notes.find((n: FlashcardDecksReadResponse["notes"][number]) => n.noteID === noteID)
}

// ---------------------------------------------------------------------------
// DueCountsBadges (reused in both deck list and review header)
// ---------------------------------------------------------------------------

export function DueCountsBadges(props: { dueCounts: FlashcardDueCounts }) {
  const { dueCounts } = props
  const total = getFlashcardDueCount(dueCounts)

  if (total === 0) {
    return (
      <span className="text-[11px] text-text-weaker">{language.t("workspaceFlashcard.noDue")}</span>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      {dueCounts.new > 0 ? (
        <span className="rounded-sm bg-surface-interactive-base/15 px-1.5 py-0.5 text-[11px] font-medium text-text-interactive-base">
          {language.t("workspaceFlashcard.dueNew", { count: dueCounts.new })}
        </span>
      ) : null}
      {dueCounts.learning > 0 ? (
        <span className="rounded-sm bg-surface-warning-base/15 px-1.5 py-0.5 text-[11px] font-medium text-icon-warning-base">
          {language.t("workspaceFlashcard.dueLearning", { count: dueCounts.learning })}
        </span>
      ) : null}
      {dueCounts.review > 0 ? (
        <span className="rounded-sm bg-surface-success-base/15 px-1.5 py-0.5 text-[11px] font-medium text-text-success-base">
          {language.t("workspaceFlashcard.dueReview", { count: dueCounts.review })}
        </span>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ReviewSession — handles the fetch-review-submit loop for one deck
// ---------------------------------------------------------------------------

function ReviewSession(props: {
  directory: string
  deckID: string
  deckTitle: string
  onBack: () => void
}) {
  const { directory, deckID, deckTitle, onBack } = props
  const queryClient = useQueryClient()
  const decksQuery = useQuery(workspaceFlashcardDecksQueryOptions(directory))
  const liveDeck = decksQuery.data?.decks.find((d) => d.deckID === deckID)
  const [deck, setDeck] = useState<FlashcardDecksReadResponse | null>(null)
  const [phase, setPhase] = useState<ReviewPhase>({ kind: "loading" })
  const [revealed, setRevealed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [leechWarning, setLeechWarning] = useState(false)
  const [cardsReviewed, setCardsReviewed] = useState(0)
  const cardsReviewedRef = useRef(0)

  const [swipeDirection, setSwipeDirection] = useState<1 | -1 | null>(null)
  const [swipeRating, setSwipeRating] = useState<CardRating | null>(null)
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
          setSwipeRating(null)
          setSwipeDirection(null)
        }
      } catch (err) {
        setPhase({ kind: "error", message: err instanceof Error ? err.message : String(err) })
      }
    },
    [directory],
  )

  // Initial load: fetch full deck, then first card
  useEffect(() => {
    let cancelled = false

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
  }, [directory, deckID, fetchNextCard])

  const handleRate = useCallback(
    async (rating: CardRating) => {
      if (!deck || submitting || phase.kind !== "card") return
      setSubmitting(true)
      setLeechWarning(false)
      const timeTakenMs = Date.now() - cardStartTimeRef.current

      // Set swipe direction: 1, 2 (Again, Hard) = -1 (left), 3, 4 (Good, Easy) = 1 (right)
      setSwipeDirection(rating === "again" || rating === "hard" ? -1 : 1)
      setSwipeRating(rating)

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

        // Small delay for leech warning visibility before advancing
        if (result.isLeech) {
          await new Promise((resolve) => setTimeout(resolve, 1500))
        }

        await fetchNextCard(deck)
        void queryClient.invalidateQueries({
          queryKey: workspaceArtifactsQueryKeys.flashcard(directory),
        })
        setSubmitting(false)
      } catch (err) {
        setSubmitting(false)
        setPhase({ kind: "error", message: err instanceof Error ? err.message : String(err) })
      }
    },
    [phase, deck, submitting, directory, deckID, fetchNextCard, queryClient],
  )

  const handleToggleReveal = useCallback(() => {
    setRevealed((prev) => !prev)
  }, [])

  // Header with back button and deck title
  const header = (
    <div className="flex items-center gap-2 border-b border-border-base/30 px-3 py-2">
      <button
        type="button"
        onClick={onBack}
        className="flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-xs text-text-weak transition-colors hover:bg-surface-base-hover hover:text-text-base"
      >
        <ArrowLeftIcon className="size-3.5" />
        {language.t("workspaceFlashcard.backToDecks")}
      </button>
      <span className="truncate text-xs font-medium text-text-base">{deckTitle}</span>
    </div>
  )

  if (phase.kind === "loading") {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <div className="flex flex-1 items-center justify-center">
          <span className="text-sm text-text-weak">
            {language.t("workspaceFlashcard.loadingDeck")}
          </span>
        </div>
      </div>
    )
  }

  if (phase.kind === "error") {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4">
          <p className="rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 px-3 py-2 text-xs text-icon-critical-base">
            {phase.message}
          </p>
        </div>
      </div>
    )
  }

  if (phase.kind === "no-due") {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
          <p className="text-sm text-text-weak">{language.t("workspaceFlashcard.noDueCards")}</p>
        </div>
      </div>
    )
  }

  if (phase.kind === "complete") {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
          <p className="text-sm font-medium text-text-base">
            {language.t("workspaceFlashcard.reviewComplete")}
          </p>
          <p className="text-xs text-text-weak">
            {language.t("workspaceFlashcard.cardProgress", { current: cardsReviewed })}
          </p>
        </div>
      </div>
    )
  }

  // phase.kind === "card"
  const note = deck ? findNote(deck, phase.card.noteID) : undefined

  if (!note) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <div className="flex flex-1 items-center justify-center">
          <p className="text-xs text-text-weak">{language.t("workspaceFlashcard.reviewError")}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      <div className="flex shrink-0 items-center justify-between border-b border-border-base/30 bg-surface-base px-4 py-2">
        <div className="text-[11px] font-medium text-text-weak">
          Reviewed: <span className="text-text-base">{cardsReviewed}</span>
        </div>
        {liveDeck ? <DueCountsBadges dueCounts={liveDeck.dueCounts} /> : null}
      </div>
      <div className="flex flex-1 flex-col justify-between overflow-hidden">
        <div className="flex flex-1 items-center justify-center p-6 perspective-[1000px]">
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
                  onToggleReveal={handleToggleReveal}
                  swipeRating={swipeRating}
                />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <div className="flex shrink-0 min-h-[96px] flex-col items-center justify-center border-t border-border-base/30 px-3">
          {leechWarning ? (
            <p className="pb-2 text-center text-[11px] text-icon-warning-base">
              {language.t("workspaceFlashcard.leechWarning")}
            </p>
          ) : null}

          {revealed ? <FlashcardReviewRatings onRate={handleRate} disabled={submitting} /> : null}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main panel component
// ---------------------------------------------------------------------------

export function WorkspaceFlashcardPanel(props: { directory: string }) {
  const queryClient = useQueryClient()
  const decksQuery = useQuery(workspaceFlashcardDecksQueryOptions(props.directory))
  const decks = decksQuery.data?.decks ?? []
  const loading = decksQuery.isPending
  const error = decksQuery.error ? stringifyError(decksQuery.error) : undefined

  const [reviewDeck, setReviewDeck] = useState<{
    deckID: string
    title: string
  } | null>(null)

  useInvalidateQueryOnChatIdle({
    directory: props.directory,
    queryKey: workspaceArtifactsQueryKeys.flashcard(props.directory),
  })

  const handleBack = useCallback(() => {
    setReviewDeck(null)
    // Refresh deck list to get updated due counts after reviewing
    void queryClient.invalidateQueries({
      queryKey: workspaceArtifactsQueryKeys.flashcard(props.directory),
    })
  }, [queryClient, props.directory])

  // Review mode: show the review session
  if (reviewDeck) {
    return (
      <div data-component="workspace-flashcard-panel" className="flex min-h-0 flex-1 flex-col">
        <ReviewSession
          directory={props.directory}
          deckID={reviewDeck.deckID}
          deckTitle={reviewDeck.title}
          onBack={handleBack}
        />
      </div>
    )
  }

  // Deck list mode
  return (
    <div data-component="workspace-flashcard-panel" className="flex min-h-0 flex-1 flex-col p-3">
      {loading ? (
        <div className="flex w-full min-h-0 flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border-base/20 bg-surface-weak/5 px-4 py-10 text-center animate-pulse">
          <div className="h-4 w-32 rounded-md bg-surface-strong/20"></div>
          <div className="mt-2 h-3 w-48 rounded-md bg-surface-strong/10"></div>
        </div>
      ) : null}

      {!loading && decks.length === 0 ? (
        <div className="flex w-full min-h-0 flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border-base/40 bg-surface-weak/5 px-4 py-10 text-center">
          <h3 className="text-[13px] font-medium text-text-base">
            {language.t("workspaceFlashcard.title")}
          </h3>
          <p className="mt-1.5 max-w-[220px] text-[12px] leading-relaxed text-text-weak">
            {language.t("workspaceFlashcard.emptyState")}
          </p>
        </div>
      ) : null}

      {decks.length > 0 ? (
        <div className="scrollbar-hover flex-1 min-h-0 overflow-y-auto space-y-3">
          {decks.map((deck) => {
            const reviewAvailable = isFlashcardReviewAvailable(deck)
            return (
              <Card
                key={deck.deckID}
                size="sm"
                className={`gap-0 overflow-hidden border-border-base/60 bg-surface-raised-base/70 transition-colors ${reviewAvailable ? "cursor-pointer hover:border-border-interactive-base/60 hover:bg-surface-raised-base" : ""}`}
                onClick={
                  reviewAvailable
                    ? () => setReviewDeck({ deckID: deck.deckID, title: deck.title })
                    : undefined
                }
              >
                <CardContent className="space-y-2 px-3 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-text-base">{deck.title}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-text-weak">
                    <span>{noteCountLabel(deck.noteCount)}</span>
                    <span className="text-text-weaker">·</span>
                    <span>{cardCountLabel(deck.cardCount)}</span>
                    <span className="text-text-weaker">·</span>
                    <span>{formatTimestamp(deck.createdAt)}</span>
                  </div>
                  <DueCountsBadges dueCounts={deck.dueCounts} />
                </CardContent>
              </Card>
            )
          })}
        </div>
      ) : null}

      {error ? (
        <p className="mt-2 rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 px-2 py-1.5 text-xs text-icon-critical-base">
          {error}
        </p>
      ) : null}
    </div>
  )
}
