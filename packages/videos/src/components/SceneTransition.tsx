import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion"

import type { TransitionDefinition } from "../timeline/launchTimeline"

const FIRST_FRAME = 0
const LAST_FRAME_OFFSET = 1
const TRANSITION_FADE_FRAMES = 15
const TRANSITION_EASING = Easing.bezier(0.4, 0, 0.2, 1)

const SANS = "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, sans-serif"

const COPY_SIZE_PX = 92
const COPY_WEIGHT = 700
const COPY_TRACKING = "-0.045em"
const COPY_MAX_WIDTH_PX = 1380
const COPY_PADDING = "100px 120px"

/**
 * Display leading, set for a card that wraps rather than one that doesn't. At
 * 1.08 the two-line card closed up around its descenders; this is still tight
 * enough that two lines read as one block rather than as a stack.
 */
const COPY_LINE_HEIGHT = 1.14

/**
 * Chromium balances the lines instead of filling the first one and dropping the
 * remainder. Greedy wrapping breaks "Connect any Model or / Subscription." —
 * a hanging "or" and a one-word second line. Only the longest card wraps at
 * all, so this is the difference between one good card and one awkward one.
 */
const COPY_WRAP = "balance"

type SceneTransitionProps = {
  readonly transition: TransitionDefinition
}

export const SceneTransition = ({ transition }: SceneTransitionProps) => {
  const frame = useCurrentFrame()
  const lastFrame = transition.durationInFrames - LAST_FRAME_OFFSET
  const fadeFrames = Math.min(TRANSITION_FADE_FRAMES, Math.floor(transition.durationInFrames / 3))
  const fadeOutStartFrame = lastFrame - fadeFrames
  const opacity = interpolate(
    frame,
    [FIRST_FRAME, fadeFrames, fadeOutStartFrame, lastFrame],
    [0, 1, 1, 0],
    {
      easing: TRANSITION_EASING,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  )

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        backgroundColor: transition.overlayPrevious ? "transparent" : "#000000",
        color: "#ffffff",
        justifyContent: "center",
      }}
    >
      {transition.style === "text" && transition.copy ? (
        <div
          style={{
            fontFamily: SANS,
            fontSize: COPY_SIZE_PX,
            fontWeight: COPY_WEIGHT,
            letterSpacing: COPY_TRACKING,
            lineHeight: COPY_LINE_HEIGHT,
            maxWidth: COPY_MAX_WIDTH_PX,
            opacity,
            padding: COPY_PADDING,
            textAlign: "center",
            textWrap: COPY_WRAP,
          }}
        >
          {transition.copy}
        </div>
      ) : null}
    </AbsoluteFill>
  )
}
