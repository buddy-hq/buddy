export const BUDDY_LAUNCH_FPS = 30
export const BUDDY_LAUNCH_WIDTH_PX = 1920
export const BUDDY_LAUNCH_HEIGHT_PX = 1080

/** A compact beat for a generated result to register before it leaves. */
export const RESULT_LANDING_HOLD_SECONDS = 0.8
export const RESULT_LANDING_HOLD_FRAMES = Math.round(
  RESULT_LANDING_HOLD_SECONDS * BUDDY_LAUNCH_FPS,
)
