import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion"

import { LAUNCH_COPY } from "../launchCopy"
import {
  getTelevisionCameraScale,
  TELEVISION_HEIGHT_PX,
  televisionSourceSecondsToFrame,
} from "./Television"

const SOURCE_START_SECONDS = 1
const CAPTION_FADE_IN_FRAMES = 6
const CAPTION_FADE_OUT_FRAMES = 6
const CAPTION_FONT_SIZE_PX = 24
const CAPTION_LINE_HEIGHT_PX = 30
const FINAL_CAPTION_END_SOURCE_SECONDS = 13.469

const getActiveCaption = (frame: number): string | null => {
  let cueStartFrame = televisionSourceSecondsToFrame(SOURCE_START_SECONDS)

  for (const cue of LAUNCH_COPY.opening.feynman.captions) {
    const cueEndFrame = televisionSourceSecondsToFrame(
      cue.endAtSourceSeconds,
    )

    if (frame >= cueStartFrame && frame < cueEndFrame) {
      return cue.text
    }

    cueStartFrame = cueEndFrame
  }

  return null
}

export const FeynmanCaptions = () => {
  const frame = useCurrentFrame()
  const { height } = useVideoConfig()
  const firstSpeechFrame = televisionSourceSecondsToFrame(SOURCE_START_SECONDS)
  const finalCaptionEndFrame = televisionSourceSecondsToFrame(
    FINAL_CAPTION_END_SOURCE_SECONDS,
  )
  const caption = getActiveCaption(frame)
  const televisionVisualBottom =
    height / 2 +
    (TELEVISION_HEIGHT_PX * getTelevisionCameraScale(frame)) / 2
  const captionCenter = (televisionVisualBottom + height) / 2
  const captionTop = Math.round(captionCenter - CAPTION_LINE_HEIGHT_PX / 2)

  const captionOpacity = interpolate(
    frame,
    [
      firstSpeechFrame,
      firstSpeechFrame + CAPTION_FADE_IN_FRAMES,
      finalCaptionEndFrame - CAPTION_FADE_OUT_FRAMES,
      finalCaptionEndFrame,
    ],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  )

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        color: "#f7f1e8",
        fontFamily:
          "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, sans-serif",
        pointerEvents: "none",
      }}
    >
      {caption === null ? null : (
        <div
          style={{
            color: "rgba(205, 205, 205, 0.42)",
            fontSize: CAPTION_FONT_SIZE_PX,
            fontWeight: 500,
            left: 0,
            letterSpacing: "0.005em",
            lineHeight: `${CAPTION_LINE_HEIGHT_PX}px`,
            opacity: captionOpacity,
            position: "absolute",
            right: 0,
            textAlign: "center",
            textShadow: "0 1px 8px rgba(0, 0, 0, 0.72)",
            top: captionTop,
            whiteSpace: "nowrap",
          }}
        >
          {caption}
        </div>
      )}
    </AbsoluteFill>
  )
}
