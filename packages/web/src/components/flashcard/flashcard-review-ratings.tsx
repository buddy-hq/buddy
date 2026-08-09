import { cn } from "@buddy/ui"
import { language } from "@/context/language"
import { REVIEW_CARD_RADIUS, REVIEW_PAPER, REVIEW_RATING_TONE } from "./flashcard-review-surface"
import type { CardRating } from "./flashcard-review-session"

/**
 * The rating ruler.
 *
 * One strip cut from the card: same radius, same border, same paper, cells
 * divided by the same hairline that rules the card's head. The aim shows as a
 * coloured rule along the cell's top edge — no pills, no capsules, nothing that
 * looks dropped on top of the card instead of part of it.
 *
 * Hovering a cell also leans the card toward where that rating will throw it,
 * which is why `onAim` exists: the lean is owned by the stage, not by a cell.
 */

const RATINGS: { rating: CardRating; labelKey: string }[] = [
  { rating: "again", labelKey: "workspaceFlashcard.ratingAgain" },
  { rating: "hard", labelKey: "workspaceFlashcard.ratingHard" },
  { rating: "good", labelKey: "workspaceFlashcard.ratingGood" },
  { rating: "easy", labelKey: "workspaceFlashcard.ratingEasy" },
]

export function FlashcardRatingRuler(props: {
  onRate: (rating: CardRating) => void
  onAim: (rating: CardRating | null) => void
  aimed: CardRating | null
  disabled?: boolean
}) {
  return (
    <div
      className={cn(
        "flex h-full w-full overflow-hidden border border-border-strong-base transition-opacity",
        REVIEW_CARD_RADIUS,
        props.disabled && "opacity-50",
      )}
    >
      {RATINGS.map(({ rating, labelKey }, index) => {
        const tone = REVIEW_RATING_TONE[rating]
        const isAimed = props.aimed === rating
        return (
          <button
            key={rating}
            type="button"
            disabled={props.disabled}
            onClick={() => {
              props.onAim(null)
              props.onRate(rating)
            }}
            onMouseEnter={() => props.onAim(rating)}
            onMouseLeave={() => props.onAim(null)}
            onFocus={() => props.onAim(rating)}
            onBlur={() => props.onAim(null)}
            className={cn(
              "relative flex flex-1 cursor-pointer items-center justify-center transition-colors",
              REVIEW_PAPER,
              "hover:bg-surface-float-base disabled:cursor-not-allowed",
              index > 0 && "border-l border-border-base",
            )}
          >
            {/* At rest the rule still has to read as its rating's colour, so it
                stays bright; the aim state separates itself with the label
                colour and the paper lift rather than by brightness alone. */}
            <span
              aria-hidden
              className={cn(
                "absolute inset-x-0 top-0 h-[3px] transition-opacity",
                tone.rule,
                isAimed ? "opacity-100" : "opacity-70",
              )}
            />
            <span
              className={cn(
                "text-[12px] font-medium transition-colors",
                isAimed ? tone.text : "text-text-strong",
              )}
            >
              {language.t(labelKey)}
            </span>
          </button>
        )
      })}
    </div>
  )
}
