import { motion, AnimatePresence } from "motion/react"
import { language } from "@/context/language"
import { FlashcardCardDisplay } from "./flashcard-card-display"
import { FlashcardReviewRatings } from "./flashcard-review-ratings"
import type {
  ObjectFlashcardDeckReadDeckResponse,
  ObjectFlashcardDeckNextCardResponse,
} from "@buddy/sdk/types"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CardRating = "again" | "hard" | "good" | "easy"

export type ReviewPhase =
  | { kind: "loading" }
  | { kind: "no-due" }
  | { kind: "card"; card: ObjectFlashcardDeckNextCardResponse["card"] & {} }
  | { kind: "complete" }
  | { kind: "error"; message: string }

export function ReviewContent(props: {
  phase: ReviewPhase
  deck: ObjectFlashcardDeckReadDeckResponse | null
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
    (n: ObjectFlashcardDeckReadDeckResponse["notes"][number]) => n.noteID === phase.card.noteID,
  )

  if (!note) {
    return (
      <div className="flex min-h-[14rem] items-center justify-center">
        <p className="text-xs text-text-weak">{language.t("workspaceFlashcard.reviewError")}</p>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-border-base/30 bg-surface-base px-6 py-3">
        <div className="text-xs font-medium text-text-weak">
          Reviewed: <span className="text-text-base">{cardsReviewed}</span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-between overflow-hidden">
        <div
          data-component="flashcard-review-stage"
          className="flex min-h-[12rem] flex-1 items-center justify-center overflow-hidden p-6 perspective-[1200px] md:p-8"
        >
          <div
            data-component="flashcard-review-card-frame"
            className="relative h-full min-h-[12rem] w-full max-w-[50rem]"
          >
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

        <div className="flex min-h-[96px] shrink-0 flex-col items-center justify-center border-t border-border-base/30 px-3">
          {leechWarning ? (
            <p className="pb-2 text-center text-[11px] text-icon-warning-base">
              {language.t("workspaceFlashcard.leechWarning")}
            </p>
          ) : null}

          {revealed ? <FlashcardReviewRatings onRate={onRate} disabled={submitting} /> : null}
        </div>
      </div>
    </div>
  )
}
