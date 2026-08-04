import { AbsoluteFill, Sequence } from "remotion"

import { BackgroundMusic } from "./components/BackgroundMusic"
import {
  LaunchSlotCanvas,
  SLOT_CANVAS_DURATION_FRAMES,
} from "./components/LaunchSlotCanvas"
import {
  OPENING_HOOK_DURATION_FRAMES,
  OpeningHook,
} from "./components/OpeningHook"

export const BuddyLaunch = () => {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#000000",
        overflow: "hidden",
      }}
    >
      <Sequence durationInFrames={OPENING_HOOK_DURATION_FRAMES}>
        <OpeningHook />
      </Sequence>

      <Sequence
        durationInFrames={SLOT_CANVAS_DURATION_FRAMES}
        from={OPENING_HOOK_DURATION_FRAMES}
      >
        <LaunchSlotCanvas />
      </Sequence>

      {/*
        Nothing follows the canvas: the composition runs past its last picture
        frame on this plate's black while the score fades out.
      */}
      <BackgroundMusic />
    </AbsoluteFill>
  )
}
