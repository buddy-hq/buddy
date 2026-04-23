/**
 * Shared motion tokens for the tool rendering system.
 *
 * Three spring profiles covering every tool animation:
 * - SNAPPY: small UI elements (chevron rotate, status dot pop-in, toggle)
 * - GENTLE: content reveals (body expand, panel slide, error reveal)
 * - SOFT:   subtle entry (card fade-in, artifact appear)
 *
 * Tool-specific motion (task shimmer gradient, mermaid viewport springs)
 * lives in its own file — these are the shared cross-cutting tokens.
 */

/** Small UI elements: chevron, status dot, toggle */
export const MOTION_SNAPPY = {
  type: "spring",
  stiffness: 500,
  damping: 35,
  mass: 0.8,
} as const

/** Content reveals: body expand, panel slide, error panel */
export const MOTION_GENTLE = {
  type: "spring",
  stiffness: 300,
  damping: 30,
  mass: 1,
} as const

/** Subtle entry: card fade-in, artifact appear */
export const MOTION_SOFT = {
  type: "spring",
  stiffness: 260,
  damping: 28,
  mass: 1.2,
} as const

/** Standard content reveal transition (height: 0 → auto with gentle spring) */
export const CONTENT_REVEAL_TRANSITION = {
  duration: 0.2,
  ease: [0.23, 1, 0.32, 1],
} as const

/** Card entry animation initial state */
export const CARD_ENTRY_INITIAL = { opacity: 0, y: 6 } as const

/** Card entry animation target state */
export const CARD_ENTRY_ANIMATE = { opacity: 1, y: 0 } as const

/** Button press scale for interactive cards */
export const BUTTON_PRESS_SCALE = 0.98 as const

/** Button press duration */
export const BUTTON_PRESS_DURATION = 0.14 as const

/** Pulsing gradient animation for loading state */
export const LOADING_PULSE_DURATION = 1.5 as const
export const LOADING_PULSE_EASE = "easeInOut" as const
