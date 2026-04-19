import { language } from "@/context/language"

type CardRating = "again" | "hard" | "good" | "easy"

type FlashcardReviewRatingsProps = {
  onRate: (rating: CardRating) => void
  disabled?: boolean
}

const RATINGS: { rating: CardRating; labelKey: string; className: string }[] = [
  {
    rating: "again",
    labelKey: "workspaceFlashcard.ratingAgain",
    className:
      "border-border-critical-base/30 bg-surface-critical-base/8 text-icon-critical-base hover:bg-surface-critical-base/15",
  },
  {
    rating: "hard",
    labelKey: "workspaceFlashcard.ratingHard",
    className:
      "border-border-warning-base/30 bg-surface-warning-base/8 text-icon-warning-base hover:bg-surface-warning-base/15",
  },
  {
    rating: "good",
    labelKey: "workspaceFlashcard.ratingGood",
    className:
      "border-border-success-base/30 bg-surface-success-base/8 text-text-success-base hover:bg-surface-success-base/15",
  },
  {
    rating: "easy",
    labelKey: "workspaceFlashcard.ratingEasy",
    className:
      "border-border-interactive-base/30 bg-surface-interactive-base/8 text-text-interactive-base hover:bg-surface-interactive-base/15",
  },
]

export function FlashcardReviewRatings({ onRate, disabled }: FlashcardReviewRatingsProps) {
  return (
    <div className="flex items-center justify-center gap-2.5 px-4 py-4">
      {RATINGS.map(({ rating, labelKey, className }) => (
        <button
          key={rating}
          type="button"
          disabled={disabled}
          onClick={() => onRate(rating)}
          className={`cursor-pointer rounded-lg border px-5 py-2.5 text-xs font-medium transition-all duration-150 ease-out active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
        >
          {language.t(labelKey)}
        </button>
      ))}
    </div>
  )
}
