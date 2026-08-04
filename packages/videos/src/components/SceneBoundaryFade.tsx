import { Easing, interpolate, useCurrentFrame } from "remotion"

import type { ReactNode } from "react"

const LAST_FRAME_OFFSET = 1
export const SCENE_BOUNDARY_FADE_FRAMES = 12
export const PROMPT_TO_RESULT_FADE_IN_FRAMES = 18
export const PROMPT_TO_RESULT_FADE_OUT_FRAMES = 8
const SLOW_FADE_IN_EASING = Easing.bezier(0.42, 0, 0.58, 1)
const QUICK_FADE_OUT_EASING = Easing.bezier(0.23, 1, 0.32, 1)

export type SceneFadeOutCurve = "linear" | "quick"

type SceneBoundaryFadeProps = {
  readonly children: ReactNode
  readonly durationInFrames: number
  readonly fadeInDurationInFrames?: number
  readonly fadeOutCurve?: SceneFadeOutCurve
  readonly fadeOutDurationInFrames?: number
}

export const SceneBoundaryFade = ({
  children,
  durationInFrames,
  fadeInDurationInFrames = SCENE_BOUNDARY_FADE_FRAMES,
  fadeOutCurve = "quick",
  fadeOutDurationInFrames = SCENE_BOUNDARY_FADE_FRAMES,
}: SceneBoundaryFadeProps) => {
  const frame = useCurrentFrame()
  const lastFrame = durationInFrames - LAST_FRAME_OFFSET
  const fadeInFrames = Math.min(
    fadeInDurationInFrames,
    Math.floor(durationInFrames / 3),
  )
  const fadeOutFrames = Math.min(
    fadeOutDurationInFrames,
    Math.floor(durationInFrames / 3),
  )
  const fadeOutStartFrame = lastFrame - fadeOutFrames
  const fadeInOpacity = interpolate(
    frame,
    [0, fadeInFrames],
    [0, 1],
    {
      easing: SLOW_FADE_IN_EASING,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  )
  const fadeOutOpacity = interpolate(
    frame,
    [fadeOutStartFrame, lastFrame],
    [1, 0],
    {
      easing:
        fadeOutCurve === "linear"
          ? Easing.linear
          : QUICK_FADE_OUT_EASING,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  )
  const opacity = fadeInOpacity * fadeOutOpacity

  return <div style={{ height: "100%", opacity, width: "100%" }}>{children}</div>
}
