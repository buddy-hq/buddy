import { Button, cn } from "@buddy/ui"
import { ArrowLeftIcon, ArrowRightIcon } from "@/icons/app-icons"
import { language } from "@/context/language"
import { ReviewCardHinge } from "./flashcard-review-card"
import {
  REVIEW_ACTIONS_GAP_PX,
  REVIEW_ACTIONS_H_PX,
  REVIEW_BODY_MIN_H_PX,
  REVIEW_CARD_MAX_W_PX,
  REVIEW_GROUP_MAX_H_PX,
  REVIEW_HEADER_H_PX,
  REVIEW_PERSPECTIVE_PX,
  REVIEW_STACK_TOTAL_PX,
  REVIEW_STAGE_BACKGROUND,
} from "./flashcard-review-surface"
import type { ObjectFlashcardDeckReadDeckResponse } from "@buddy/sdk/types"

function FlashcardPracticeHeader(props: {
  deckTitle: string
  cardNumber?: number
  cardCount: number
  onExit: () => void
}) {
  return (
    <header
      data-component="flashcard-practice-header"
      className="flex shrink-0 items-center gap-3 px-4"
      style={{ height: REVIEW_HEADER_H_PX }}
    >
      <button
        type="button"
        onClick={props.onExit}
        className="flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-1 py-1 text-[10px] uppercase tracking-[0.14em] text-text-weaker transition-colors hover:text-text-base"
      >
        <ArrowLeftIcon className="size-3" aria-hidden />
        {language.t("flashcardDeck.exitToDeck")}
      </button>
      <span className="h-3 w-px shrink-0 bg-border-base" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-[11px] text-text-weak">{props.deckTitle}</span>
      {props.cardNumber === undefined ? null : (
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-text-weaker">
          {props.cardNumber}/{props.cardCount}
        </span>
      )}
    </header>
  )
}

/**
 * Off-schedule practice is the review stage with its write affordance removed.
 * The shared card hinge, stage geometry, banner, and fixed footer slot are the
 * Easel state; only the card source differs from scheduled review.
 */
export function FlashcardPracticeStage(props: {
  deck: ObjectFlashcardDeckReadDeckResponse
  index: number
  revealed: boolean
  onIndex: (index: number) => void
  onRevealed: (revealed: boolean) => void
  onExit: () => void
}) {
  const card = props.deck.cards[props.index % Math.max(1, props.deck.cards.length)]
  const note = card ? props.deck.notes.find((entry) => entry.noteID === card.noteID) : undefined

  if (!card || !note) {
    return (
      <div
        data-component="flashcard-practice-stage"
        className={cn("flex h-full min-h-0 w-full flex-col", REVIEW_STAGE_BACKGROUND)}
      >
        <FlashcardPracticeHeader
          deckTitle={props.deck.title}
          cardCount={props.deck.cards.length}
          onExit={props.onExit}
        />
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <p className="text-[12px] text-text-weaker">{language.t("flashcardDeck.noCards")}</p>
        </div>
      </div>
    )
  }

  const cardNumber = (props.index % props.deck.cards.length) + 1

  return (
    <div
      data-component="flashcard-practice-stage"
      className={cn("flex h-full min-h-0 w-full flex-col", REVIEW_STAGE_BACKGROUND)}
    >
      <FlashcardPracticeHeader
        deckTitle={props.deck.title}
        cardNumber={cardNumber}
        cardCount={props.deck.cards.length}
        onExit={props.onExit}
      />

      <div className="shrink-0 px-4 pb-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-l-2 border-border-strong-base bg-surface-base px-3 py-2">
          <span className="text-[10px] uppercase tracking-[0.14em] text-text-weaker">
            {language.t("flashcardDeck.offSchedule")}
          </span>
          <span className="text-[11px] text-text-weak">
            {language.t("flashcardDeck.offScheduleDetail")}
          </span>
        </div>
      </div>

      <div
        className="flex min-h-0 flex-1 items-center justify-center px-6 py-4"
        style={{ minHeight: REVIEW_BODY_MIN_H_PX }}
      >
        <div
          data-component="flashcard-practice-card-group"
          className="flex w-full flex-col"
          style={{
            maxWidth: REVIEW_CARD_MAX_W_PX,
            height: "100%",
            maxHeight: REVIEW_GROUP_MAX_H_PX,
            minHeight: `min(${REVIEW_GROUP_MAX_H_PX}px, 100%)`,
          }}
        >
          <div
            data-component="flashcard-practice-card-frame"
            className="relative min-h-0 w-full flex-1"
            style={{ perspective: REVIEW_PERSPECTIVE_PX }}
          >
            <div className="absolute inset-x-0 top-0" style={{ bottom: REVIEW_STACK_TOTAL_PX }}>
              <ReviewCardHinge
                note={note}
                templateIdx={card.templateIdx}
                revealed={props.revealed}
              />
            </div>
          </div>

          <div
            className="flex w-full shrink-0 items-center justify-center"
            style={{ height: REVIEW_ACTIONS_H_PX, marginTop: REVIEW_ACTIONS_GAP_PX }}
          >
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => props.onRevealed(!props.revealed)}>
                {language.t(
                  props.revealed ? "flashcardDeck.hideAnswer" : "flashcardDeck.showAnswer",
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  props.onRevealed(false)
                  props.onIndex(props.index + 1)
                }}
              >
                {language.t("flashcardDeck.nextCard")}
                <ArrowRightIcon data-icon="inline-end" aria-hidden />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
