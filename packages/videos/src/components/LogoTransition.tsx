import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion"

import { LAUNCH_COPY } from "../launchCopy"
import { BUDDY_LAUNCH_FPS } from "../videoConfig"
import { AuroraBackdrop } from "./AuroraBackdrop"
import { ScrambleReveal } from "./ScrambleReveal"
import { TELEVISION_FADE_OUT_DURATION_FRAMES } from "./Television"

const BUDDY_APP_ICON = staticFile("brand/buddy-app-icon.png")

const FADE_EASING = Easing.bezier(0.4, 0, 0.2, 1)

const MS_PER_SECOND = 1000
const msToFrames = (ms: number): number => (ms / MS_PER_SECOND) * BUDDY_LAUNCH_FPS

/**
 * The opening ends on the onboarding's closing beat: the icon and wordmark
 * cross over from the television as they always did, the line beneath them
 * resolves out of scrambled characters, and after a held beat the aurora
 * expands past the frame as the lockup lifts away. Timings are the app's own,
 * in ms — see `Finish` in
 * packages/web/src/components/onboarding/cinematic/screens.tsx and the
 * expansion in that folder's aurora.tsx.
 */
const REVEAL_CHARACTER_MS = 95
const SCRAMBLE_FLIP_MS = 50
/** Onboarding waits this long after the words land before it expands. */
const EXPANSION_DELAY_MS = 1200
const EXPANSION_MS = 2800
/**
 * How much of the expansion the opening actually holds. The app cuts to the
 * product underneath while the aurora is still travelling; with nothing to
 * hand off to, the last second is just an empty nebula centre, so the scene
 * leaves during the move instead of waiting it out.
 */
const EXPANSION_VISIBLE_MS = 1500
const CONTENT_EXIT_MS = 1200

const REVEAL_FRAMES_PER_CHARACTER = msToFrames(REVEAL_CHARACTER_MS)
const SCRAMBLE_FLIP_FRAMES = msToFrames(SCRAMBLE_FLIP_MS)
const SUBTITLE_REVEAL_FRAMES = Math.ceil(
  LAUNCH_COPY.opening.subtitle.length * REVEAL_FRAMES_PER_CHARACTER,
)
/** A beat of scrambled characters before the first one resolves. */
const SCRAMBLE_LEAD_IN_FRAMES = 12

/**
 * The lockup, rebalanced around a subtitle that now carries the motion.
 *
 * The line carries the reveal, so it is set large enough to be the thing the
 * eye lands on. Hierarchy comes from weight and ink instead of size — 800 at
 * full white against 400 at 62% — which lets the line run big without the
 * wordmark losing the frame.
 */
const ICON_SIZE_PX = 200
const ICON_TO_TEXT_GAP_PX = 36
const BRAND_SIZE_PX = 128
const BRAND_TO_SUBTITLE_GAP_PX = 32
const SUBTITLE_SIZE_PX = 64
const SUBTITLE_WEIGHT = 400
const SUBTITLE_INK = "rgba(255,255,255,0.62)"
/**
 * The scrambling line changes width on every flip, and a shrink-wrapped column
 * would resize with it — re-centring the whole lockup a fraction of a pixel at
 * a time, which reads as the wordmark twitching. A fixed box wider than the
 * mono scramble ever gets keeps the layout still; only the line itself moves.
 */
const LOCKUP_WIDTH_PX = 1280
/** Dead centre sits low to the eye; a title card wants the optical centre. */
const LOCKUP_OPTICAL_RISE_PX = 40
const CONTENT_EXIT_FRAMES = msToFrames(CONTENT_EXIT_MS)
const CONTENT_EXIT_RISE_PX = 30
const AURORA_EXPANSION_FRAMES = msToFrames(EXPANSION_MS)
const AURORA_EXPANDED_SCALE = 2.5
const AURORA_RESTING_SCALE = 1
const AURORA_EXPANSION_EASING = Easing.bezier(0.16, 1, 0.3, 1)

export const LOGO_TRANSITION_FADE_IN_FRAMES =
  TELEVISION_FADE_OUT_DURATION_FRAMES
export const LOGO_TRANSITION_FADE_OUT_FRAMES = 18

/**
 * The line lands exactly as the icon finishes crossing over from the
 * television, so the whole lockup arrives at full strength on the same frame —
 * and the long dissolve has something moving in it on the way there.
 */
const REVEAL_START_FRAME =
  LOGO_TRANSITION_FADE_IN_FRAMES - SUBTITLE_REVEAL_FRAMES
const SCRAMBLE_START_FRAME = REVEAL_START_FRAME - SCRAMBLE_LEAD_IN_FRAMES
const EXPANSION_START_FRAME =
  LOGO_TRANSITION_FADE_IN_FRAMES + msToFrames(EXPANSION_DELAY_MS)

export const LOGO_TRANSITION_DURATION_FRAMES =
  EXPANSION_START_FRAME + msToFrames(EXPANSION_VISIBLE_MS)

export const LogoTransition = () => {
  const frame = useCurrentFrame()
  const fadeIn = interpolate(
    frame,
    [0, LOGO_TRANSITION_FADE_IN_FRAMES],
    [0, 1],
    {
      easing: FADE_EASING,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  )
  const fadeOut = interpolate(
    frame,
    [
      LOGO_TRANSITION_DURATION_FRAMES - LOGO_TRANSITION_FADE_OUT_FRAMES,
      LOGO_TRANSITION_DURATION_FRAMES,
    ],
    [1, 0],
    {
      easing: FADE_EASING,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  )
  const opacity = fadeIn * fadeOut

  /** Fades the scrambled characters up before the first one resolves. */
  const subtitleOpacity = interpolate(
    frame,
    [SCRAMBLE_START_FRAME, REVEAL_START_FRAME],
    [0, 1],
    {
      easing: FADE_EASING,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  )

  /** The lockup lifts and clears as the aurora takes the frame. */
  const contentExit = interpolate(
    frame,
    [EXPANSION_START_FRAME, EXPANSION_START_FRAME + CONTENT_EXIT_FRAMES],
    [0, 1],
    {
      easing: Easing.inOut(Easing.ease),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  )
  // Runs on the app's full 2.8s curve even though the scene leaves early, so
  // the expansion keeps its velocity instead of being compressed.
  const auroraScale = interpolate(
    frame,
    [EXPANSION_START_FRAME, EXPANSION_START_FRAME + AURORA_EXPANSION_FRAMES],
    [AURORA_RESTING_SCALE, AURORA_EXPANDED_SCALE],
    {
      easing: AURORA_EXPANSION_EASING,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  )
  // Settles before the first character resolves. Running the zoom through the
  // reveal re-rasterises the type every frame, which reads as a wobble.
  const scale = interpolate(
    frame,
    [0, REVEAL_START_FRAME],
    [0.97, 1],
    {
      easing: FADE_EASING,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  )

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        backgroundColor: "#000000",
        justifyContent: "center",
        opacity,
        pointerEvents: "none",
      }}
    >
      <AuroraBackdrop opacity={fadeIn} scale={auroraScale} />

      <div
        style={{
          alignItems: "center",
          display: "flex",
          flexDirection: "column",
          gap: ICON_TO_TEXT_GAP_PX,
          opacity: 1 - contentExit,
          scale,
          transform: `translateY(${
            -LOCKUP_OPTICAL_RISE_PX - contentExit * CONTENT_EXIT_RISE_PX
          }px)`,
        }}
      >
        <Img
          src={BUDDY_APP_ICON}
          style={{
            height: ICON_SIZE_PX,
            objectFit: "contain",
            width: ICON_SIZE_PX,
          }}
        />

        <div
          style={{
            alignItems: "center",
            display: "flex",
            flexDirection: "column",
            gap: BRAND_TO_SUBTITLE_GAP_PX,
            width: LOCKUP_WIDTH_PX,
          }}
        >
          <div
            style={{
              color: "#ffffff",
              fontFamily:
                "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, sans-serif",
              fontSize: BRAND_SIZE_PX,
              fontWeight: 800,
              letterSpacing: "-0.05em",
              lineHeight: 1,
            }}
          >
            {LAUNCH_COPY.opening.brandName}
          </div>

          <div
            style={{
              fontFamily:
                "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, sans-serif",
              fontSize: SUBTITLE_SIZE_PX,
              fontWeight: SUBTITLE_WEIGHT,
              lineHeight: 1.2,
              opacity: subtitleOpacity,
              whiteSpace: "nowrap",
            }}
          >
            <ScrambleReveal
              encryptedStyle={{
                color: "rgba(255,255,255,0.3)",
                fontFamily: "monospace",
                opacity: 0.4,
              }}
              flipFrames={SCRAMBLE_FLIP_FRAMES}
              frame={frame - REVEAL_START_FRAME}
              framesPerCharacter={REVEAL_FRAMES_PER_CHARACTER}
              revealedStyle={{ color: SUBTITLE_INK }}
              text={LAUNCH_COPY.opening.subtitle}
            />
          </div>
        </div>
      </div>
    </AbsoluteFill>
  )
}
