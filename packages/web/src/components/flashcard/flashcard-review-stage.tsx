import { useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { cn } from "@buddy/ui"
import { ArrowLeftIcon } from "@/icons/app-icons"
import { language } from "@/context/language"
import { ReviewCardHinge, ReviewRuledHead } from "./flashcard-review-card"
import { FlashcardRatingRuler } from "./flashcard-review-ratings"
import {
  REVIEW_AIM_LEAN,
  REVIEW_AIM_TRANSITION,
  REVIEW_NO_LEAN,
  REVIEW_REDUCED_SWAP_VARIANTS,
  REVIEW_SWAP_VARIANTS,
} from "./flashcard-review-motion"
import {
  REVIEW_ACTIONS_GAP_PX,
  REVIEW_ACTIONS_H_PX,
  REVIEW_BODY_MIN_H_PX,
  REVIEW_CARD_CHROME,
  REVIEW_CARD_MAX_W_PX,
  REVIEW_CARD_RADIUS,
  REVIEW_GROUP_MAX_H_PX,
  REVIEW_HEADER_H_PX,
  REVIEW_PERSPECTIVE_PX,
  REVIEW_STACK_CHROME,
  REVIEW_STACK_COUNT,
  REVIEW_STACK_STEP_PX,
  REVIEW_STACK_TOTAL_PX,
  REVIEW_STAGE_BACKGROUND,
} from "./flashcard-review-surface"
import type { CardRating, FlashcardReviewSession, ReviewPhase } from "./flashcard-review-session"

/**
 * The review stage: header, card box with the deck beneath it, rating ruler.
 *
 * Header and footer are fixed rows and every phase renders inside the box the
 * card uses, so nothing on screen moves when the phase changes. The deck's
 * depth is reserved inside that box rather than hanging off the bottom, which
 * is what lets the deck disappear without the card shifting.
 */

const CARD_STATE_LABEL = {
  new: "workspaceFlashcard.cardStateNew",
  learning: "workspaceFlashcard.cardStateLearning",
  review: "workspaceFlashcard.cardStateReview",
  relearning: "workspaceFlashcard.cardStateRelearning",
} satisfies Record<string, string>

type PhaseCopy = { eyebrow: string; title: string; body: string; critical?: boolean }

function phaseCopy(phase: ReviewPhase, cardsReviewed: number): PhaseCopy | null {
  switch (phase.kind) {
    case "loading":
      return {
        eyebrow: language.t("workspaceFlashcard.phaseDealingEyebrow"),
        title: language.t("workspaceFlashcard.phaseDealingTitle"),
        body: language.t("workspaceFlashcard.loadingCard"),
      }
    case "no-due":
      return {
        eyebrow: language.t("workspaceFlashcard.phaseScheduledEyebrow"),
        title: language.t("workspaceFlashcard.phaseNoDueTitle"),
        body: language.t("workspaceFlashcard.noDueCards"),
      }
    case "complete":
      return {
        eyebrow: language.t("workspaceFlashcard.phaseSessionEyebrow"),
        title: language.t("workspaceFlashcard.reviewComplete"),
        body: language.t("workspaceFlashcard.cardProgress", { current: cardsReviewed }),
      }
    case "error":
      return {
        eyebrow: language.t("workspaceFlashcard.phaseInterruptedEyebrow"),
        title: language.t("workspaceFlashcard.phaseErrorTitle"),
        body: phase.message,
        critical: true,
      }
    default:
      return null
  }
}

const PHASE_ACCENT = new Map<ReviewPhase["kind"], string>([
  ["loading", "text-text-weak"],
  ["no-due", "text-text-weak"],
  ["complete", "text-text-success-base"],
  ["error", "text-text-critical-base"],
])

/**
 * Is there a deck under the card at all? Dealing means the next card is on its
 * way, so the pile stays. An empty, drained or unreachable queue has nothing
 * behind it — drawing a stack there would be a lie about the state.
 */
function hasDeck(phase: ReviewPhase) {
  return phase.kind === "card" || phase.kind === "loading"
}

export function shouldAnimateReviewSwap(cardsReviewed: number): boolean {
  return cardsReviewed > 0
}

function PhasePanel(props: { phase: ReviewPhase; copy: PhaseCopy; onRetry?: () => void }) {
  return (
    <div
      className={cn(
        "absolute inset-0 flex flex-col",
        REVIEW_CARD_RADIUS,
        REVIEW_CARD_CHROME,
        props.copy.critical && "border-border-critical-base",
      )}
    >
      <ReviewRuledHead label={props.copy.eyebrow} critical={props.copy.critical} />
      <div className="flex min-h-0 flex-1 flex-col justify-center gap-2 px-8 pb-6">
        <p className={cn("text-lg font-medium", PHASE_ACCENT.get(props.phase.kind))}>
          {props.copy.title}
        </p>
        <p className="max-w-[46ch] text-[13px] leading-relaxed text-text-weak">{props.copy.body}</p>
        {props.phase.kind === "error" && props.onRetry ? (
          <button
            type="button"
            onClick={props.onRetry}
            className={cn(
              "mt-3 w-fit cursor-pointer px-3 py-1.5 text-[12px] font-medium text-text-strong transition-colors",
              REVIEW_CARD_RADIUS,
              "border border-border-strong-base bg-surface-inset-base hover:bg-surface-float-base",
            )}
          >
            {language.t("workspaceFlashcard.retry")}
          </button>
        ) : null}
      </div>
    </div>
  )
}

export function FlashcardReviewStage(props: {
  session: FlashcardReviewSession
  /** Bench hides its outer object bar and carries the name in this row. */
  deckTitle?: string
  /** Surfaces that own a deck behind the reviewer supply a way back to it. */
  onExit?: () => void
}) {
  const { session } = props
  const reduceMotion = useReducedMotion()
  const { phase } = session
  const copy = phaseCopy(phase, session.cardsReviewed)
  const deck = hasDeck(phase)
  const total = session.cardsReviewed + session.cardsRemaining
  const progress = total > 0 ? session.cardsReviewed / total : 0
  const cardState = phase.kind === "card" ? phase.card.state : null

  /**
   * Cleared on rate as well as gated on `revealed`: the ruler unmounts the
   * instant a card is rated, so `onMouseLeave` never fires — without both, a
   * stale aim would mount the *next* card already tilted.
   */
  const [aimed, setAimed] = useState<CardRating | null>(null)
  const lean = !reduceMotion && session.revealed && aimed ? REVIEW_AIM_LEAN[aimed] : REVIEW_NO_LEAN

  const showCard = phase.kind === "card" && session.note !== null
  const missingNote = phase.kind === "card" && session.note === null

  return (
    <div
      data-component="flashcard-review"
      className={cn("grid h-full min-h-0 w-full grid-rows-[auto_1fr]", REVIEW_STAGE_BACKGROUND)}
    >
      <header
        data-component="flashcard-review-header"
        className="flex shrink-0 items-center gap-3 px-6"
        style={{ height: REVIEW_HEADER_H_PX }}
      >
        {props.onExit ? (
          <button
            type="button"
            onClick={props.onExit}
            className="flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-1 py-1 text-[10px] uppercase tracking-[0.14em] text-text-weaker transition-colors hover:text-text-base"
          >
            <ArrowLeftIcon className="size-3" aria-hidden />
            {language.t("flashcardDeck.exitToDeck")}
          </button>
        ) : (
          <span className="h-3 w-1 shrink-0 bg-surface-critical-base" aria-hidden />
        )}
        {props.deckTitle ? (
          <span className="min-w-0 flex-1 truncate text-[11px] text-text-weak">
            {props.deckTitle}
          </span>
        ) : null}
        <span
          className={cn(
            "truncate text-[10px] uppercase tracking-[0.16em] text-text-weaker",
            props.deckTitle ? "shrink-0" : "min-w-0 flex-1",
          )}
        >
          {cardState ? language.t(CARD_STATE_LABEL[cardState] ?? "") : ""}
        </span>
        {/* Reserved slot — occupied or not, the header never re-measures. */}
        <span className="w-14 shrink-0 text-right text-[10px] uppercase tracking-[0.14em] text-text-critical-base">
          {session.leech ? language.t("workspaceFlashcard.leechFlag") : ""}
        </span>
        {/* Squared off, like everything else on this card. */}
        <div className="h-1 w-24 shrink-0 overflow-hidden bg-surface-inset-strong">
          <div
            className="h-full bg-surface-interactive-base transition-[width] duration-300"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-text-weaker">
          {session.cardsReviewed}/{total}
        </span>
      </header>

      <div
        data-component="flashcard-review-stage"
        className="flex min-h-0 items-center justify-center px-6 py-4"
        style={{ minHeight: REVIEW_BODY_MIN_H_PX }}
      >
        {/* Card, deck and ruler are one object and centre together. */}
        <div
          className="flex w-full flex-col"
          style={{
            maxWidth: REVIEW_CARD_MAX_W_PX,
            height: "100%",
            maxHeight: REVIEW_GROUP_MAX_H_PX,
            minHeight: `min(${REVIEW_GROUP_MAX_H_PX}px, 100%)`,
          }}
        >
          {/* One box holds the card AND the deck beneath it. */}
          <div
            data-component="flashcard-review-card-frame"
            className="relative min-h-0 w-full flex-1"
            style={{ perspective: REVIEW_PERSPECTIVE_PX }}
          >
            {/* Deepest first, so nearer slabs paint on top. Each peeks a fixed
                number of pixels further below the card — never `scale`. */}
            {deck
              ? Array.from({ length: REVIEW_STACK_COUNT }, (_, index) => {
                  const depth = REVIEW_STACK_COUNT - index
                  if (depth >= session.cardsRemaining) return null
                  return (
                    <div
                      key={depth}
                      aria-hidden
                      className={cn("absolute", REVIEW_CARD_RADIUS, REVIEW_STACK_CHROME)}
                      style={{
                        left: depth * (REVIEW_STACK_STEP_PX / 2),
                        right: depth * (REVIEW_STACK_STEP_PX / 2),
                        top: depth * REVIEW_STACK_STEP_PX,
                        bottom: REVIEW_STACK_TOTAL_PX - depth * REVIEW_STACK_STEP_PX,
                        opacity: 1 - depth * 0.16,
                      }}
                    />
                  )
                })
              : null}

            <div className="absolute inset-x-0 top-0" style={{ bottom: REVIEW_STACK_TOTAL_PX }}>
              <AnimatePresence initial={false} custom={session.lastRating}>
                <motion.div
                  key={session.seq}
                  custom={session.lastRating}
                  variants={reduceMotion ? REVIEW_REDUCED_SWAP_VARIANTS : REVIEW_SWAP_VARIANTS}
                  initial={shouldAnimateReviewSwap(session.cardsReviewed) ? "enter" : false}
                  animate="settled"
                  /* Only a card is ever thrown. A phase panel — the "Dealing"
                     slab the first load opens on — just gives way, so opening a
                     deck no longer looks like a card flying off the top. */
                  exit={showCard ? "leave" : "dismiss"}
                  className="absolute inset-0"
                  style={{ transformStyle: "preserve-3d" }}
                >
                  {/* Aim sits inside the swap so a thrown card keeps its lean on
                      the way out, and outside the hinge so it survives the flip. */}
                  <motion.div
                    className="absolute inset-0"
                    style={{ transformStyle: "preserve-3d" }}
                    initial={false}
                    animate={{ x: lean.x, rotate: lean.rotate }}
                    transition={REVIEW_AIM_TRANSITION}
                  >
                    {showCard && phase.kind === "card" && session.note ? (
                      <ReviewCardHinge
                        note={session.note}
                        templateIdx={phase.card.templateIdx}
                        revealed={session.revealed}
                        onToggle={session.toggleReveal}
                      />
                    ) : missingNote ? (
                      <PhasePanel
                        phase={{
                          kind: "error",
                          message: language.t("workspaceFlashcard.reviewError"),
                        }}
                        copy={{
                          eyebrow: language.t("workspaceFlashcard.phaseInterruptedEyebrow"),
                          title: language.t("workspaceFlashcard.phaseErrorTitle"),
                          body: language.t("workspaceFlashcard.reviewError"),
                          critical: true,
                        }}
                        onRetry={session.retry}
                      />
                    ) : copy ? (
                      <PhasePanel phase={phase} copy={copy} onRetry={session.retry} />
                    ) : null}
                  </motion.div>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* The ruler: card width, directly under the deck, fixed slot so
              revealing an answer cannot move the card. */}
          <div
            className="flex w-full shrink-0 items-center justify-center"
            style={{ height: REVIEW_ACTIONS_H_PX, marginTop: REVIEW_ACTIONS_GAP_PX }}
          >
            {session.leech ? (
              <p className="text-center text-[11px] leading-snug text-text-warning-base">
                {language.t("workspaceFlashcard.leechWarning")}
              </p>
            ) : showCard && session.revealed ? (
              <FlashcardRatingRuler
                onRate={session.rate}
                onAim={setAimed}
                aimed={aimed}
                disabled={session.submitting}
              />
            ) : showCard ? (
              <p className="text-[11px] text-text-weaker">
                {language.t("workspaceFlashcard.flipToReveal")}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
