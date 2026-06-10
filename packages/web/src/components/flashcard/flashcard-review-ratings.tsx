import { language } from "@/context/language"
import { motion } from "motion/react"

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
      "border-transparent bg-surface-critical-base text-text-on-critical-base hover:bg-surface-critical-base-hover hover:text-text-on-critical-strong shadow-sm",
  },
  {
    rating: "hard",
    labelKey: "workspaceFlashcard.ratingHard",
    className:
      "border-transparent bg-surface-warning-base text-text-on-warning-base hover:bg-surface-warning-base-hover hover:text-text-on-warning-strong shadow-sm",
  },
  {
    rating: "good",
    labelKey: "workspaceFlashcard.ratingGood",
    className:
      "border-transparent bg-surface-success-base text-text-on-success-base hover:bg-surface-success-base-hover hover:text-text-on-success-strong shadow-sm",
  },
  {
    rating: "easy",
    labelKey: "workspaceFlashcard.ratingEasy",
    className:
      "border-transparent bg-surface-interactive-base text-text-on-interactive-base hover:bg-surface-interactive-base-hover shadow-sm",
  },
]

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
}

import { type Variants } from "motion/react"

const buttonVariants: Variants = {
  hidden: { opacity: 0, y: 10, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring", stiffness: 300, damping: 20 },
  },
}

export function FlashcardReviewRatings({ onRate, disabled }: FlashcardReviewRatingsProps) {
  return (
    <motion.div
      className="flex items-center justify-center gap-3 px-4 py-4"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {RATINGS.map(({ rating, labelKey, className }) => (
        <motion.button
          key={rating}
          variants={buttonVariants}
          whileTap={disabled ? undefined : { scale: 0.96 }}
          type="button"
          disabled={disabled}
          onClick={() => onRate(rating)}
          className={`cursor-pointer rounded-xl border px-6 py-3 min-w-[80px] text-sm font-semibold transition-colors duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
        >
          {language.t(labelKey)}
        </motion.button>
      ))}
    </motion.div>
  )
}
