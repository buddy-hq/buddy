/**
 * The index card's material, in one place.
 *
 * Every surface in the review stage — the card faces, the deck slabs beneath
 * it, the phase panels, the rating ruler — is cut from these values. If the
 * card's radius or border changes, it changes everywhere at once, which is the
 * only way the stage stays coherent.
 */

// ─── Geometry ──────────────────────────────────────────────────────────────

export const REVIEW_HEADER_H_PX = 44
export const REVIEW_BODY_MIN_H_PX = 200

export const REVIEW_CARD_MAX_W_PX = 560
export const REVIEW_CARD_MAX_H_PX = 380

/**
 * The rating ruler belongs to the card, not to the window. It sits directly
 * under the deck at the card's own width, and the whole group centres together
 * — pinning it to the bottom of a tall panel divorces the action from the thing
 * being acted on.
 *
 * Its slot is a fixed height so revealing an answer cannot move the card.
 */
export const REVIEW_ACTIONS_H_PX = 46
export const REVIEW_ACTIONS_GAP_PX = 14

/**
 * The deck under the card. Its depth is reserved *inside* the card box rather
 * than hanging off the bottom, so the deck can never paint over the footer and
 * the card does not move when the deck disappears.
 */
export const REVIEW_STACK_COUNT = 3
export const REVIEW_STACK_STEP_PX = 9
export const REVIEW_STACK_TOTAL_PX = REVIEW_STACK_COUNT * REVIEW_STACK_STEP_PX
export const REVIEW_BOX_MAX_H_PX = REVIEW_CARD_MAX_H_PX + REVIEW_STACK_TOTAL_PX
/** Card + deck + gap + ruler, centred as one object. */
export const REVIEW_GROUP_MAX_H_PX =
  REVIEW_BOX_MAX_H_PX + REVIEW_ACTIONS_GAP_PX + REVIEW_ACTIONS_H_PX

export const REVIEW_PERSPECTIVE_PX = 1500

// ─── Material ──────────────────────────────────────────────────────────────

/**
 * Hinge faces must be opaque. In dark themes most `surface-*` tokens resolve to
 * neutralAlpha(), so a translucent face lets the stage — and mid-turn, the
 * mirrored back face — bleed through. Only these two families are solid in both
 * light and dark, so faces may only use these.
 */
export const REVIEW_PAPER = "bg-surface-raised-stronger-non-alpha"
export const REVIEW_UNDER = "bg-surface-float-base"

export const REVIEW_CARD_RADIUS = "rounded-sm"
export const REVIEW_CARD_CHROME = `${REVIEW_PAPER} border border-border-strong-base shadow-md`
export const REVIEW_STACK_CHROME = `${REVIEW_UNDER} border border-border-base`
export const REVIEW_STAGE_BACKGROUND = "bg-background-strong"

/** One colour per rating, spent only on hairlines — never on a filled pill. */
export const REVIEW_RATING_TONE = {
  again: { rule: "bg-surface-critical-base", text: "text-text-critical-base" },
  hard: { rule: "bg-surface-warning-base", text: "text-text-warning-base" },
  good: { rule: "bg-surface-success-base", text: "text-text-success-base" },
  easy: { rule: "bg-surface-interactive-base", text: "text-text-interactive-base" },
} satisfies Record<"again" | "hard" | "good" | "easy", { rule: string; text: string }>
