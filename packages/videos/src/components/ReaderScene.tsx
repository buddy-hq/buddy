import { Video } from "@remotion/media"
import { AbsoluteFill, Freeze, staticFile } from "remotion"

import { BUDDY_LAUNCH_FPS, RESULT_LANDING_HOLD_FRAMES } from "../videoConfig"

const READER_CLIP = staticFile("captures/reader.mp4")
const READER_CLIP_DURATION_SECONDS = 12.233333
const READER_FADE_OUT_DURATION_SECONDS = 1

const READER_PLAYABLE_DURATION_FRAMES = Math.round(READER_CLIP_DURATION_SECONDS * BUDDY_LAUNCH_FPS)
const READER_LAST_PLAYABLE_FRAME = READER_PLAYABLE_DURATION_FRAMES - 1
export const READER_FADE_OUT_DURATION_FRAMES = Math.round(
  READER_FADE_OUT_DURATION_SECONDS * BUDDY_LAUNCH_FPS,
)
export const READER_SCENE_DURATION_FRAMES =
  READER_PLAYABLE_DURATION_FRAMES + RESULT_LANDING_HOLD_FRAMES + READER_FADE_OUT_DURATION_FRAMES

export const ReaderScene = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      <Freeze
        active={(frame) => frame >= READER_PLAYABLE_DURATION_FRAMES}
        frame={READER_LAST_PLAYABLE_FRAME}
      >
        <Video
          muted
          objectFit="contain"
          src={READER_CLIP}
          style={{
            height: "100%",
            width: "100%",
          }}
        />
      </Freeze>
    </AbsoluteFill>
  )
}
