import { AbsoluteFill, Sequence } from "remotion"
import {
  LOGO_TRANSITION_DURATION_FRAMES,
  LogoTransition,
} from "./LogoTransition"
import { FeynmanCaptions } from "./FeynmanCaptions"
import {
  TELEVISION_FADE_OUT_START_FRAME,
  TELEVISION_TOTAL_FRAMES,
  Television,
} from "./Television"

const OPENING_START_FRAME = 0
const LOGO_TRANSITION_START_FRAME = TELEVISION_FADE_OUT_START_FRAME

export const OPENING_HOOK_DURATION_FRAMES =
  LOGO_TRANSITION_START_FRAME + LOGO_TRANSITION_DURATION_FRAMES

export const OpeningHook = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#09090b" }}>
      <Sequence
        durationInFrames={TELEVISION_TOTAL_FRAMES}
        from={OPENING_START_FRAME}
      >
        <AbsoluteFill
          style={{
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Television />
        </AbsoluteFill>
      </Sequence>
      <Sequence
        durationInFrames={LOGO_TRANSITION_DURATION_FRAMES}
        from={LOGO_TRANSITION_START_FRAME}
      >
        <LogoTransition />
      </Sequence>
      <FeynmanCaptions />
    </AbsoluteFill>
  )
}
