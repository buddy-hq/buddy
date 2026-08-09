import type { Variants } from "motion/react"
import type { CardRating } from "./flashcard-review-session"

/**
 * The card-to-card hand-off.
 *
 *   aim   — hovering a rating leans the card that way, telegraphing the throw
 *   leave — the rating throws the card: Again ← … → Easy, Hard and Good fall
 *   enter — the next card lifts off the deck underneath
 *
 * Arrivals decelerate hard so the card looks like it settled rather than
 * stopped; departures accelerate, because a thrown card gets faster.
 */

type Ease = [number, number, number, number]
const EASE_SETTLE: Ease = [0.22, 1, 0.36, 1]
const EASE_LEAVE: Ease = [0.4, 0.02, 0.85, 0.4]

const HINGE_SPRING = { type: "spring", stiffness: 220, damping: 26, mass: 0.9 } as const

export const REVIEW_HINGE_TRANSITION = HINGE_SPRING
export const REVIEW_AIM_TRANSITION = { duration: 0.22, ease: EASE_SETTLE }

/** Where the rating throws the card. Again ← … → Easy; the two middles fall. */
const THROW_VECTOR: Record<CardRating, { x: number; y: number; rotate: number }> = {
  again: { x: -520, y: 30, rotate: -18 },
  hard: { x: -330, y: 260, rotate: -11 },
  good: { x: 330, y: 260, rotate: 11 },
  easy: { x: 520, y: 30, rotate: 18 },
}

/** No rating — the card was replaced rather than graded, so it lifts straight out. */
const THROW_NEUTRAL = { x: 0, y: -300, rotate: 0 }

export const REVIEW_AIM_LEAN: Record<CardRating, { x: number; rotate: number }> = {
  again: { x: -18, rotate: -2.4 },
  hard: { x: -8, rotate: -1.1 },
  good: { x: 8, rotate: 1.1 },
  easy: { x: 18, rotate: 2.4 },
}

export const REVIEW_NO_LEAN = { x: 0, rotate: 0 }

export const REVIEW_SWAP_VARIANTS: Variants = {
  enter: { opacity: 0, x: 0, y: 30, scale: 0.9, rotate: 0, zIndex: 1 },
  settled: {
    opacity: 1,
    x: 0,
    y: 0,
    scale: 1,
    rotate: 0,
    zIndex: 1,
    transition: { duration: 0.38, delay: 0.06, ease: EASE_SETTLE },
  },
  leave: (rating: CardRating | null) => {
    const vector = rating ? THROW_VECTOR[rating] : THROW_NEUTRAL
    return {
      ...vector,
      opacity: 0,
      scale: 0.94,
      zIndex: 3,
      transition: { duration: 0.44, ease: EASE_LEAVE },
    }
  },
}

export const REVIEW_REDUCED_SWAP_VARIANTS: Variants = {
  enter: { opacity: 0 },
  settled: {
    opacity: 1,
    transition: { duration: 0.12, ease: EASE_SETTLE },
  },
  leave: {
    opacity: 0,
    transition: { duration: 0.08, ease: EASE_LEAVE },
  },
}
