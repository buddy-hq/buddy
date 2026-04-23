/**
 * Motion configuration for task card animations.
 * Following Emil Kowalski's design engineering principles.
 */

export const TASK_CARD_SPRING = {
  type: "spring",
  duration: 0.3,
  bounce: 0.15,
} as const

export const TASK_CARD_TRANSITION = {
  duration: 0.2,
  ease: [0.23, 1, 0.32, 1], // Strong ease-out
} as const

export const TASK_LIST_STAGGER = {
  duration: 0.25,
  ease: [0.23, 1, 0.32, 1],
  staggerChildren: 0.04,
} as const

export const TASK_LIST_ITEM = {
  duration: 0.2,
  ease: [0.23, 1, 0.32, 1],
} as const

export const BUTTON_PRESS_SCALE = 0.98 as const
export const BUTTON_PRESS_DURATION = 0.14 as const

// Pulsing gradient animation for loading state
export const LOADING_PULSE_DURATION = 1.5 as const
export const LOADING_PULSE_EASE = "easeInOut" as const
