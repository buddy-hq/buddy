import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion"

/**
 * The onboarding aurora, ported for video.
 *
 * Source of truth: packages/web/src/components/onboarding/cinematic/aurora.tsx
 * (the `nebula-orion` space in that folder's constants.ts). Three magenta
 * radial gradients are warped by a turbulence displacement, then the whole
 * plate is hue-rotated into Buddy's amber — same as the app, which is why the
 * gradients are authored pink and never read pink.
 *
 * The app drifts the plate with a CSS animation; a video has to be a pure
 * function of the frame, so the same 24s keyframe loop is driven off a cosine
 * here instead.
 */

const NEBULA_A = "rgba(255, 0, 85, 0.35)"
const NEBULA_B = "rgba(186, 104, 200, 0.25)"
const NEBULA_C = "rgba(236, 72, 153, 0.15)"
const NEBULA_OPACITY = 0.55

/** `getBgFilter()` in the onboarding constants. */
const AURORA_FILTER = "hue-rotate(295deg) saturate(1.3)"

const DISPLACEMENT_FILTER_ID = "aurora-backdrop-nebula"
const TURBULENCE_BASE_FREQUENCY = 0.007
const TURBULENCE_OCTAVES = 4
const DISPLACEMENT_SCALE = 110

/**
 * A filter region defaults to the element's box plus 10%, and displacement then
 * drags transparent pixels in from outside it, fringing the frame edges. The
 * region is widened so the warped edge lands outside the frame. The plate
 * itself stays full-frame — bleeding it outward moves the gradient centres off
 * screen and collapses the nebula into a corner wash.
 */
const FILTER_REGION_INSET_PERCENT = "-25%"
const FILTER_REGION_SIZE_PERCENT = "150%"

/** The space's own base fill, from `SPACES["nebula-orion"].bg`. */
const NEBULA_BASE = "#010102"

/** `@keyframes ob-drift`: a 24s there-and-back, peaking at the halfway point. */
const DRIFT_SECONDS = 24
const DRIFT_X_PERCENT = -3
const DRIFT_Y_PERCENT = -2
const DRIFT_ROTATION_DEG = 5

const VIGNETTE = "radial-gradient(130% 120% at 50% -10%, transparent 44%, rgba(0,0,0,0.66) 100%)"

const AURORA_GRAIN_IMAGE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E")`
const AURORA_GRAIN_OPACITY = 0.05

const HALF = 0.5
const FULL_TURN_RADIANS = Math.PI * 2

export type AuroraBackdropProps = {
  /** Lets a scene fade the whole plate in or out. */
  readonly opacity: number
  /** Lets a scene push through the plate with its content. */
  readonly scale: number
}

export const AuroraBackdrop = ({ opacity, scale }: AuroraBackdropProps) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const driftPhase = frame / (DRIFT_SECONDS * fps)
  const drift = (1 - Math.cos(driftPhase * FULL_TURN_RADIANS)) * HALF

  return (
    <AbsoluteFill style={{ filter: AURORA_FILTER, opacity, overflow: "hidden" }}>
      <svg style={{ height: 0, position: "absolute", width: 0 }}>
        <defs>
          <filter
            height={FILTER_REGION_SIZE_PERCENT}
            id={DISPLACEMENT_FILTER_ID}
            width={FILTER_REGION_SIZE_PERCENT}
            x={FILTER_REGION_INSET_PERCENT}
            y={FILTER_REGION_INSET_PERCENT}
          >
            <feTurbulence
              baseFrequency={TURBULENCE_BASE_FREQUENCY}
              numOctaves={TURBULENCE_OCTAVES}
              result="noise"
              type="fractalNoise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale={DISPLACEMENT_SCALE}
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>

      <AbsoluteFill
        style={{
          backgroundColor: NEBULA_BASE,
          overflow: "hidden",
          transform: `scale(${scale})`,
          transformOrigin: "center",
        }}
      >
        <AbsoluteFill
          style={{
            backgroundImage: [
              `radial-gradient(55% 55% at 15% 15%, ${NEBULA_A}, transparent 70%)`,
              `radial-gradient(65% 65% at 85% 85%, ${NEBULA_B}, transparent 70%)`,
              `radial-gradient(45% 45% at 80% 15%, ${NEBULA_C}, transparent 65%)`,
            ].join(", "),
            filter: `url(#${DISPLACEMENT_FILTER_ID})`,
            opacity: NEBULA_OPACITY,
            transform: `translate(${drift * DRIFT_X_PERCENT}%, ${
              drift * DRIFT_Y_PERCENT
            }%) rotate(${drift * DRIFT_ROTATION_DEG}deg)`,
          }}
        />
      </AbsoluteFill>

      <AbsoluteFill style={{ background: VIGNETTE }} />

      <AbsoluteFill
        style={{
          backgroundImage: AURORA_GRAIN_IMAGE,
          mixBlendMode: "soft-light",
          opacity: AURORA_GRAIN_OPACITY,
        }}
      />
    </AbsoluteFill>
  )
}
