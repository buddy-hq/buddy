import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion"

import { LAUNCH_COPY } from "../launchCopy"
import { PlatformMark } from "./PlatformMark"
import type { PlatformMarkKind } from "./PlatformMark"

const BUDDY_APP_ICON = staticFile("brand/buddy-app-icon.png")

const SANS = "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, sans-serif"

const EASE_IN = Easing.bezier(0.4, 0, 0.2, 1)
const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1)
const BALANCED_FADE = Easing.bezier(0.42, 0, 0.58, 1)

/**
 * The ending plays as two cards, both staged centre-frame like the opening.
 *
 * The first is the lockup plus where to get it: the same icon and wordmark the
 * video opened on, the line that says it is free and it is a desktop app, and
 * the two platform marks from the site's download buttons. The second drops
 * everything and gives the address the whole frame, since that is the one
 * thing the viewer has to leave with.
 */

/**
 * The whole plate rises on this curve — the inner choreography is gated behind
 * it, so this is what sets how fast the ending arrives. A short one reads as a
 * cut; the ending should emerge from the black rather than snap onto it.
 */
export const FINAL_LOGO_FADE_IN_FRAMES = 45
const CARD_HOLD_FRAMES = 78
const CARD_EXIT_FRAMES = 24
const WEBSITE_ENTRY_FRAMES = 24
const WEBSITE_HOLD_FRAMES = 60
export const FINAL_LOGO_FADE_OUT_FRAMES = 60

const CARD_EXIT_START_FRAME = FINAL_LOGO_FADE_IN_FRAMES + CARD_HOLD_FRAMES

/**
 * The frame the address takes the screen, relative to the ending's own start.
 * The score rides out from here, so the last thing the viewer hears ends on the
 * one thing they have to leave with.
 */
export const FINAL_LOGO_WEBSITE_START_FRAME = CARD_EXIT_START_FRAME + CARD_EXIT_FRAMES

const WEBSITE_START_FRAME = FINAL_LOGO_WEBSITE_START_FRAME
const WEBSITE_LANDED_FRAME = WEBSITE_START_FRAME + WEBSITE_ENTRY_FRAMES
const FADE_OUT_START_FRAME = WEBSITE_LANDED_FRAME + WEBSITE_HOLD_FRAMES

export const FINAL_LOGO_DURATION_FRAMES = FADE_OUT_START_FRAME + FINAL_LOGO_FADE_OUT_FRAMES

/**
 * Four tiers that step down by roughly the same ratio each time — 200 / 112 /
 * 68 / 44 — so the stack reads as a pyramid. A wordmark sized for a two-tier
 * lockup towers over the three tiers underneath it and the card stops being a
 * shape.
 */
const ICON_SIZE_PX = 200
const ICON_TO_BRAND_GAP_PX = 32
const BRAND_SIZE_PX = 112
const BRAND_TO_AVAILABILITY_GAP_PX = 26
const AVAILABILITY_SIZE_PX = 68
const AVAILABILITY_INK = "rgba(255,255,255,0.62)"
const AVAILABILITY_TO_PLATFORMS_GAP_PX = 46

const PLATFORM_MARK_SIZE_PX = 42
const PLATFORM_MARK_INK = "rgba(255,255,255,0.8)"
const PLATFORM_LABEL_SIZE_PX = 44
const PLATFORM_LABEL_INK = "rgba(255,255,255,0.8)"
const PLATFORM_MARK_TO_LABEL_GAP_PX = 18
const PLATFORM_GAP_PX = 46
const PLATFORM_DIVIDER_HEIGHT_PX = 44
const PLATFORM_DIVIDER_INK = "rgba(255,255,255,0.16)"

const CARD_EXIT_RISE_PX = 30
/** Dead centre sits low to the eye; a title card wants the optical centre. */
const LOCKUP_OPTICAL_RISE_PX = 40

/**
 * The address lands quietly and then keeps moving — a drift slow enough to
 * read as breathing rather than as an animation, so the last thing on screen
 * is alive while the viewer reads it.
 */
const WEBSITE_SIZE_PX = 132
const WEBSITE_ENTRY_RISE_PX = 18
const WEBSITE_ENTRY_TRACKING_EM = 0.06
const WEBSITE_RESTING_TRACKING_EM = -0.02
const WEBSITE_DRIFT_SCALE = 1.04

const ICON_SPRING = { damping: 14, mass: 0.8, stiffness: 160 }
const BRAND_SPRING = { damping: 16, mass: 0.6, stiffness: 180 }
const BRAND_DELAY_FRAMES = 8
const BRAND_RISE_PX = 24
const AVAILABILITY_DELAY_FRAMES = 16
const AVAILABILITY_RISE_PX = 12
const PLATFORMS_DELAY_FRAMES = 26
const PLATFORMS_RISE_PX = 14
const ELEMENT_FADE_FRAMES = 14
const ICON_FADE_FRAMES = 10
const ICON_ENTRY_SCALE = 0.6

const PLATFORMS: readonly {
  readonly kind: PlatformMarkKind
  readonly label: string
}[] = [
  { kind: "mac", label: LAUNCH_COPY.ending.platforms.mac },
  { kind: "windows", label: LAUNCH_COPY.ending.platforms.windows },
]

export const FinalLogoEnding = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const plateFadeIn = interpolate(frame, [0, FINAL_LOGO_FADE_IN_FRAMES], [0, 1], {
    easing: EASE_IN,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })
  const plateFadeOut = interpolate(
    frame,
    [FADE_OUT_START_FRAME, FINAL_LOGO_DURATION_FRAMES],
    [1, 0],
    {
      easing: BALANCED_FADE,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  )

  const cardExit = interpolate(
    frame,
    [CARD_EXIT_START_FRAME, CARD_EXIT_START_FRAME + CARD_EXIT_FRAMES],
    [0, 1],
    {
      easing: Easing.inOut(Easing.ease),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  )

  const websiteEntry = interpolate(frame, [WEBSITE_START_FRAME, WEBSITE_LANDED_FRAME], [0, 1], {
    easing: EASE_OUT,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })
  const websiteDrift = interpolate(
    frame,
    [WEBSITE_LANDED_FRAME, FINAL_LOGO_DURATION_FRAMES],
    [1, WEBSITE_DRIFT_SCALE],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  )
  const websiteTracking = interpolate(
    websiteEntry,
    [0, 1],
    [WEBSITE_ENTRY_TRACKING_EM, WEBSITE_RESTING_TRACKING_EM],
  )

  const iconSpring = spring({ config: ICON_SPRING, fps, frame })
  const iconOpacity = interpolate(frame, [0, ICON_FADE_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })

  const brandSpring = spring({
    config: BRAND_SPRING,
    fps,
    frame: frame - BRAND_DELAY_FRAMES,
  })
  const brandOpacity = interpolate(frame - BRAND_DELAY_FRAMES, [0, ICON_FADE_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })

  const availabilityEntry = interpolate(
    frame - AVAILABILITY_DELAY_FRAMES,
    [0, ELEMENT_FADE_FRAMES],
    [0, 1],
    {
      easing: EASE_OUT,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  )
  const platformsEntry = interpolate(
    frame - PLATFORMS_DELAY_FRAMES,
    [0, ELEMENT_FADE_FRAMES],
    [0, 1],
    {
      easing: EASE_OUT,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  )

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#000000",
        opacity: Math.min(plateFadeIn, plateFadeOut),
        pointerEvents: "none",
      }}
    >
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          opacity: 1 - cardExit,
          transform: `translateY(${-LOCKUP_OPTICAL_RISE_PX - cardExit * CARD_EXIT_RISE_PX}px)`,
        }}
      >
        <div
          style={{
            alignItems: "center",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Img
            src={BUDDY_APP_ICON}
            style={{
              height: ICON_SIZE_PX,
              marginBottom: ICON_TO_BRAND_GAP_PX,
              objectFit: "contain",
              opacity: iconOpacity,
              transform: `scale(${interpolate(iconSpring, [0, 1], [ICON_ENTRY_SCALE, 1])})`,
              width: ICON_SIZE_PX,
            }}
          />

          <div
            style={{
              color: "#ffffff",
              fontFamily: SANS,
              fontSize: BRAND_SIZE_PX,
              fontWeight: 800,
              letterSpacing: "-0.05em",
              lineHeight: 1,
              marginBottom: BRAND_TO_AVAILABILITY_GAP_PX,
              opacity: brandOpacity,
              transform: `translateY(${interpolate(brandSpring, [0, 1], [BRAND_RISE_PX, 0])}px)`,
            }}
          >
            {LAUNCH_COPY.ending.brandName}
          </div>

          <div
            style={{
              color: AVAILABILITY_INK,
              fontFamily: SANS,
              fontSize: AVAILABILITY_SIZE_PX,
              fontWeight: 400,
              lineHeight: 1.2,
              marginBottom: AVAILABILITY_TO_PLATFORMS_GAP_PX,
              opacity: availabilityEntry,
              transform: `translateY(${(1 - availabilityEntry) * AVAILABILITY_RISE_PX}px)`,
            }}
          >
            {LAUNCH_COPY.ending.availability}
          </div>

          <div
            style={{
              alignItems: "center",
              display: "flex",
              gap: PLATFORM_GAP_PX,
              opacity: platformsEntry,
              transform: `translateY(${(1 - platformsEntry) * PLATFORMS_RISE_PX}px)`,
            }}
          >
            {PLATFORMS.map((platform, index) => (
              <div
                key={platform.kind}
                style={{
                  alignItems: "center",
                  display: "flex",
                  gap: PLATFORM_GAP_PX,
                }}
              >
                {index > 0 ? (
                  <div
                    style={{
                      backgroundColor: PLATFORM_DIVIDER_INK,
                      height: PLATFORM_DIVIDER_HEIGHT_PX,
                      width: 1,
                    }}
                  />
                ) : null}

                <div
                  style={{
                    alignItems: "center",
                    display: "flex",
                    gap: PLATFORM_MARK_TO_LABEL_GAP_PX,
                  }}
                >
                  <PlatformMark
                    ink={PLATFORM_MARK_INK}
                    kind={platform.kind}
                    size={PLATFORM_MARK_SIZE_PX}
                  />

                  <div
                    style={{
                      color: PLATFORM_LABEL_INK,
                      fontFamily: SANS,
                      fontSize: PLATFORM_LABEL_SIZE_PX,
                      fontWeight: 500,
                      letterSpacing: "-0.01em",
                      lineHeight: 1,
                    }}
                  >
                    {platform.label}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          opacity: websiteEntry,
        }}
      >
        <div
          style={{
            color: "#ffffff",
            fontFamily: SANS,
            fontSize: WEBSITE_SIZE_PX,
            fontWeight: 500,
            letterSpacing: `${websiteTracking}em`,
            lineHeight: 1,
            transform: `translateY(${
              (1 - websiteEntry) * WEBSITE_ENTRY_RISE_PX
            }px) scale(${websiteDrift})`,
            whiteSpace: "nowrap",
          }}
        >
          {LAUNCH_COPY.ending.website}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
