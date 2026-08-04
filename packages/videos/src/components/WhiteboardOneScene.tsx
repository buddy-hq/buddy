import { Video } from "@remotion/media"
import { AbsoluteFill, Freeze, staticFile } from "remotion"

import {
  BUDDY_LAUNCH_FPS,
  RESULT_LANDING_HOLD_FRAMES,
} from "../videoConfig"

const WHITEBOARD_CLIP = staticFile("captures/whiteboard1.mp4")
const WHITEBOARD_CLIP_DURATION_SECONDS = 9.233333
const WHITEBOARD_PLAYABLE_DURATION_FRAMES = Math.round(
  WHITEBOARD_CLIP_DURATION_SECONDS * BUDDY_LAUNCH_FPS,
)
const WHITEBOARD_LAST_PLAYABLE_FRAME =
  WHITEBOARD_PLAYABLE_DURATION_FRAMES - 1
const WHITEBOARD_FADE_OUT_DURATION_SECONDS = 1
export const WHITEBOARD_FADE_OUT_DURATION_FRAMES = Math.round(
  WHITEBOARD_FADE_OUT_DURATION_SECONDS * BUDDY_LAUNCH_FPS,
)
export const WHITEBOARD_ONE_SCENE_DURATION_FRAMES =
  WHITEBOARD_PLAYABLE_DURATION_FRAMES +
  RESULT_LANDING_HOLD_FRAMES +
  WHITEBOARD_FADE_OUT_DURATION_FRAMES

export const WhiteboardOneScene = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      <Freeze
        active={(frame) => frame >= WHITEBOARD_PLAYABLE_DURATION_FRAMES}
        frame={WHITEBOARD_LAST_PLAYABLE_FRAME}
      >
        <Video
          from={1}
          muted
          objectFit="contain"
          src={WHITEBOARD_CLIP}
          style={{
            height: "100%",
            width: "100%",
          }}
        />
      </Freeze>
    </AbsoluteFill>
  )
}
