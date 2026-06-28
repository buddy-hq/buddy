/** Compositor-only transition for semantic task-card state changes. */
export const TASK_CARD_TRANSITION = {
  duration: 0.2,
  ease: [0.23, 1, 0.32, 1], // Strong ease-out
} as const

export const TASK_CARD_ENTER_ANIMATE = {
  opacity: 1,
  transform: "translateY(0)",
} as const

export function taskCardEnterInitial(reducedMotion: boolean) {
  return {
    opacity: 0,
    transform: reducedMotion ? "translateY(0)" : "translateY(2px)",
  } as const
}
