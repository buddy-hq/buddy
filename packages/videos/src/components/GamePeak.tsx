import { Video } from "@remotion/media"
import { AbsoluteFill, interpolate, staticFile, useCurrentFrame } from "remotion"

import { BUDDY_LAUNCH_FPS } from "../videoConfig"

const GAME_CLIP = staticFile("captures/game.mp4")
const GAME_CLIP_DURATION_SECONDS = 8.55
const GAME_FADE_IN_DURATION_FRAMES = 15
const GAME_FADE_OUT_DURATION_FRAMES = 15
export const GAME_CLIP_DURATION_FRAMES = Math.round(GAME_CLIP_DURATION_SECONDS * BUDDY_LAUNCH_FPS)
const GAME_FADE_OUT_START_FRAME = GAME_CLIP_DURATION_FRAMES - GAME_FADE_OUT_DURATION_FRAMES

export const GamePeak = () => {
  const frame = useCurrentFrame()
  const fadeIn = interpolate(frame, [0, GAME_FADE_IN_DURATION_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })
  const fadeOut = interpolate(
    frame,
    [GAME_FADE_OUT_START_FRAME, GAME_CLIP_DURATION_FRAMES],
    [1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  )
  const opacity = fadeIn * fadeOut

  return (
    <AbsoluteFill style={{ backgroundColor: "#000000", opacity }}>
      <Video
        objectFit="contain"
        src={GAME_CLIP}
        style={{
          height: "100%",
          width: "100%",
        }}
      />
    </AbsoluteFill>
  )
}
