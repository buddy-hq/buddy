/**
 * Shared motion tokens for the tool rendering system.
 *
 * Tool shells render at final geometry. This spring is reserved for small,
 * semantic state indicators and user-controlled disclosure affordances.
 */

/** Small UI elements: chevron, status dot, toggle */
export const MOTION_SNAPPY = {
  type: "spring",
  stiffness: 500,
  damping: 35,
  mass: 0.8,
} as const
