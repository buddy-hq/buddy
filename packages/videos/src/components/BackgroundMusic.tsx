import { Audio } from "@remotion/media"
import { Easing, interpolate, Sequence, staticFile, useVideoConfig } from "remotion"

import { BUDDY_LAUNCH_FEATURES_PUSH_FRAME } from "../timeline/launchTimeline"
import { TELEVISION_TOTAL_FRAMES } from "./Television"

const BACKGROUND_TRACK = staticFile("audio/unresolved-pursuit-master.wav")
const MUSIC_START_SECONDS = 2
const SILENCE_VOLUME = 0
const FULL_BACKGROUND_VOLUME = 0.5
const FIRST_FRAME = 0
const MUSIC_FADE_IN_EASING = Easing.bezier(0.42, 0, 1, 1)

/**
 * The score begins its final, linear descent when the feature wall starts its
 * camera push and reaches silence on the composition's last frame. The visual
 * acceleration and audio release therefore begin as one movement.
 */
const FULL_GAIN = 1
const SILENT_GAIN = 0

export const BackgroundMusic = () => {
  const { durationInFrames, fps } = useVideoConfig()
  const musicStartFrame = MUSIC_START_SECONDS * fps
  const voiceEndFrame = TELEVISION_TOTAL_FRAMES - musicStartFrame
  const musicDurationFrames = durationInFrames - musicStartFrame
  const fadeOutStartFrame = BUDDY_LAUNCH_FEATURES_PUSH_FRAME - musicStartFrame

  return (
    <Sequence durationInFrames={musicDurationFrames} from={musicStartFrame} layout="none">
      <Audio
        src={BACKGROUND_TRACK}
        volume={(frame) => {
          const fadeIn = interpolate(
            frame,
            [FIRST_FRAME, voiceEndFrame],
            [SILENCE_VOLUME, FULL_BACKGROUND_VOLUME],
            {
              easing: MUSIC_FADE_IN_EASING,
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            },
          )
          const fadeOut = interpolate(
            frame,
            [fadeOutStartFrame, musicDurationFrames],
            [FULL_GAIN, SILENT_GAIN],
            {
              easing: Easing.linear,
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            },
          )
          return fadeIn * fadeOut
        }}
      />
    </Sequence>
  )
}
