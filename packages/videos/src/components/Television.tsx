import { Audio, Video } from "@remotion/media"
import {
  AbsoluteFill,
  Easing,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion"

import { BUDDY_LAUNCH_FPS } from "../videoConfig"

const SOURCE_START_SECONDS = 1
const SOURCE_END_SECONDS = 22
const SOURCE_PLAYBACK_RATE = 1.1
const CLIP_DURATION_SECONDS = (SOURCE_END_SECONDS - SOURCE_START_SECONDS) / SOURCE_PLAYBACK_RATE
const STATIC_DURATION_SECONDS = 1
const FIRST_FRAME = 0
const FPS = BUDDY_LAUNCH_FPS
const FINDING_THING_OUT_SOURCE_SECONDS = 13.08
const FINDING_THING_OUT_CLIP_FRAME = Math.round(
  ((FINDING_THING_OUT_SOURCE_SECONDS - SOURCE_START_SECONDS) / SOURCE_PLAYBACK_RATE) * FPS,
)
const VOICE_INITIAL_VOLUME = 0.5
const VOICE_MAX_VOLUME = 0.5
const VOICE_FINAL_VOLUME = 0
const STATIC_AUDIO_FULL_VOLUME = 1
const STATIC_AUDIO_SILENCE_VOLUME = 0

const STATIC_DURATION_FRAMES = STATIC_DURATION_SECONDS * FPS
const STATIC_AUDIO_DURATION_SECONDS = 2
const STATIC_AUDIO_DURATION_FRAMES = STATIC_AUDIO_DURATION_SECONDS * FPS
const STATIC_AUDIO_FADE_START_FRAME = STATIC_DURATION_FRAMES
export const TELEVISION_CLIP_DURATION_FRAMES = Math.round(CLIP_DURATION_SECONDS * FPS)
export const TELEVISION_TOTAL_FRAMES = STATIC_DURATION_FRAMES + TELEVISION_CLIP_DURATION_FRAMES
export const TELEVISION_FADE_OUT_START_FRAME = STATIC_DURATION_FRAMES + FINDING_THING_OUT_CLIP_FRAME
export const TELEVISION_FADE_OUT_DURATION_FRAMES =
  TELEVISION_TOTAL_FRAMES - TELEVISION_FADE_OUT_START_FRAME

export const televisionSourceSecondsToFrame = (sourceSeconds: number): number => {
  return (
    STATIC_DURATION_FRAMES +
    Math.round(((sourceSeconds - SOURCE_START_SECONDS) / SOURCE_PLAYBACK_RATE) * FPS)
  )
}

const SOURCE_CLIP = staticFile("references/feynman-pleasure-of-finding-things-out.mp4")
const SOURCE_VOICE = staticFile("audio/feynman-voice-1.1x.wav")
const STATIC_AUDIO = staticFile("audio/tv-static-2s-loop.wav")

const SCREEN_WIDTH = 1152
const SCREEN_HEIGHT = 648
const BEZEL_INSET = 26
const CABINET_SIDE_PADDING = 30
const CABINET_TOP_PADDING = 26
const CABINET_BOTTOM_PADDING = 44
const BEZEL_WIDTH = SCREEN_WIDTH + BEZEL_INSET * 2
const BEZEL_HEIGHT = SCREEN_HEIGHT + BEZEL_INSET * 2
const TELEVISION_WIDTH = BEZEL_WIDTH + CABINET_SIDE_PADDING * 2
export const TELEVISION_HEIGHT_PX = BEZEL_HEIGHT + CABINET_TOP_PADDING + CABINET_BOTTOM_PADDING
const CABINET_RADIUS = 40
const BEZEL_RADIUS = 30
const SCREEN_RADIUS = "7% / 12%"

const FADE_IN_EASING = Easing.bezier(0.16, 1, 0.3, 1)
const FADE_OUT_EASING = Easing.bezier(0.4, 0, 0.2, 1)

export const getTelevisionCameraScale = (frame: number): number => {
  return interpolate(frame, [FIRST_FRAME, TELEVISION_TOTAL_FRAMES], [0.94, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: FADE_IN_EASING,
  })
}

const Broadcast = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const volume = (audioFrame: number) => {
    const fadeIn = interpolate(
      audioFrame,
      [FIRST_FRAME, 6],
      [VOICE_INITIAL_VOLUME, VOICE_MAX_VOLUME],
      {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      },
    )
    const fadeOut = interpolate(
      audioFrame,
      [FINDING_THING_OUT_CLIP_FRAME, TELEVISION_CLIP_DURATION_FRAMES - 1],
      [1, VOICE_FINAL_VOLUME],
      {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      },
    )

    return fadeIn * fadeOut
  }
  const flicker = 0.985 + Math.sin(frame * 0.91) * 0.008
  const pictureOpacity = interpolate(frame, [FIRST_FRAME, 6], [0.35, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: FADE_IN_EASING,
  })

  return (
    <>
      <Video
        muted
        objectFit="cover"
        playbackRate={SOURCE_PLAYBACK_RATE}
        src={SOURCE_CLIP}
        trimBefore={Math.round(SOURCE_START_SECONDS * fps)}
        trimAfter={Math.round(SOURCE_END_SECONDS * fps)}
        style={{
          filter: "grayscale(1) contrast(1.1) brightness(0.92)",
          height: "100%",
          opacity: flicker * pictureOpacity,
          scale: 1.02,
          width: "100%",
        }}
      />
      <Audio src={SOURCE_VOICE} volume={volume} />
    </>
  )
}

const StaticSignal = () => {
  const frame = useCurrentFrame()
  const noiseSeed = (Math.floor(frame / 2) % 12) + 1
  const staticOpacity = interpolate(
    frame,
    [FIRST_FRAME, 22, STATIC_DURATION_FRAMES, STATIC_DURATION_FRAMES + 10],
    [1, 1, 0.72, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: FADE_OUT_EASING,
    },
  )
  const flashOpacity = interpolate(frame, [23, 27, 31, 36], [0, 0.8, 0.3, 0], {
    easing: FADE_OUT_EASING,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })
  const rollY = (frame * 31) % SCREEN_HEIGHT

  return (
    <AbsoluteFill style={{ opacity: staticOpacity, pointerEvents: "none" }}>
      <svg aria-hidden="true" height="100%" preserveAspectRatio="none" width="100%">
        <filter id="crt-static">
          <feTurbulence
            baseFrequency="0.72"
            numOctaves={3}
            seed={noiseSeed}
            stitchTiles="stitch"
            type="fractalNoise"
          />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncR intercept="-0.75" slope="2.6" type="linear" />
            <feFuncG intercept="-0.75" slope="2.6" type="linear" />
            <feFuncB intercept="-0.75" slope="2.6" type="linear" />
          </feComponentTransfer>
        </filter>
        <rect fill="#bcbcbc" filter="url(#crt-static)" height="100%" width="100%" />
      </svg>

      <div
        style={{
          background: "linear-gradient(180deg, transparent, rgba(255,255,255,0.34), transparent)",
          filter: "blur(3px)",
          height: 46,
          left: 0,
          position: "absolute",
          top: rollY - 23,
          width: "100%",
        }}
      />

      <AbsoluteFill
        style={{
          backgroundColor: "#ffffff",
          opacity: flashOpacity,
        }}
      />
    </AbsoluteFill>
  )
}

const Screen = () => {
  return (
    <div
      style={{
        backgroundColor: "#080807",
        borderRadius: SCREEN_RADIUS,
        boxShadow: [
          "inset 0 0 70px rgba(0,0,0,0.8)",
          "inset 0 0 0 2px rgba(0,0,0,0.9)",
          "0 0 0 3px rgba(12,10,9,0.9)",
          "0 0 26px rgba(200,225,255,0.05)",
        ].join(", "),
        height: SCREEN_HEIGHT,
        overflow: "hidden",
        position: "relative",
        width: SCREEN_WIDTH,
      }}
    >
      <Sequence durationInFrames={STATIC_AUDIO_DURATION_FRAMES}>
        <Audio
          src={STATIC_AUDIO}
          volume={(frame) =>
            interpolate(
              frame,
              [STATIC_AUDIO_FADE_START_FRAME, STATIC_AUDIO_DURATION_FRAMES],
              [STATIC_AUDIO_FULL_VOLUME, STATIC_AUDIO_SILENCE_VOLUME],
              {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              },
            )
          }
        />
      </Sequence>

      <Sequence durationInFrames={TELEVISION_CLIP_DURATION_FRAMES} from={STATIC_DURATION_FRAMES}>
        <Broadcast />
      </Sequence>

      <StaticSignal />

      <AbsoluteFill
        style={{
          background:
            "repeating-linear-gradient(180deg, transparent 0, transparent 3px, rgba(0,0,0,0.12) 4px)",
          pointerEvents: "none",
        }}
      />

      <AbsoluteFill
        style={{
          background: "radial-gradient(ellipse at center, transparent 58%, rgba(0,0,0,0.62) 100%)",
          pointerEvents: "none",
        }}
      />

      <AbsoluteFill
        style={{
          background:
            "linear-gradient(122deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.03) 22%, transparent 44%)",
          pointerEvents: "none",
        }}
      />
    </div>
  )
}

export const Television = () => {
  const frame = useCurrentFrame()
  const cameraScale = getTelevisionCameraScale(frame)

  const televisionFadeIn = interpolate(frame, [FIRST_FRAME, 30], [0, 1], {
    easing: FADE_IN_EASING,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })
  const televisionFadeOut = interpolate(
    frame,
    [TELEVISION_FADE_OUT_START_FRAME, TELEVISION_TOTAL_FRAMES],
    [1, 0],
    {
      easing: FADE_OUT_EASING,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  )
  const opacity = televisionFadeIn * televisionFadeOut

  return (
    <div
      style={{
        alignItems: "center",
        display: "flex",
        height: TELEVISION_HEIGHT_PX,
        justifyContent: "center",
        opacity,
        position: "relative",
        scale: cameraScale,
        width: TELEVISION_WIDTH,
      }}
    >
      <div
        style={{
          alignItems: "center",
          background: [
            "linear-gradient(180deg, rgba(255,240,214,0.12) 0%, rgba(255,240,214,0) 12%)",
            "repeating-linear-gradient(91deg, rgba(0,0,0,0.02) 0 17px, rgba(255,226,180,0.012) 17px 38px)",
            "radial-gradient(120% 90% at 22% 0%, rgba(255,214,160,0.16) 0%, transparent 62%)",
            "linear-gradient(162deg, #7a5735 0%, #573a22 40%, #3a2415 72%, #241408 100%)",
          ].join(", "),
          borderRadius: CABINET_RADIUS,
          boxShadow: [
            "inset 0 3px rgba(255,240,214,0.26)",
            "inset 0 -4px rgba(0,0,0,0.6)",
            "inset 3px 0 rgba(255,230,195,0.08)",
            "inset -3px 0 rgba(0,0,0,0.4)",
            "0 0 0 2px rgba(20,12,6,0.9)",
            "0 40px 110px rgba(0,0,0,0.65)",
          ].join(", "),
          boxSizing: "border-box",
          display: "flex",
          height: TELEVISION_HEIGHT_PX,
          justifyContent: "center",
          left: 0,
          padding: `${CABINET_TOP_PADDING}px ${CABINET_SIDE_PADDING}px ${CABINET_BOTTOM_PADDING}px`,
          position: "absolute",
          top: 0,
          width: TELEVISION_WIDTH,
        }}
      >
        <div
          style={{
            alignItems: "center",
            background: "linear-gradient(170deg, #1b1815 0%, #121010 55%, #191614 100%)",
            borderRadius: BEZEL_RADIUS,
            boxShadow: [
              "inset 0 3px 6px rgba(0,0,0,0.85)",
              "inset 0 -2px rgba(255,230,195,0.07)",
              "0 1px rgba(255,238,210,0.10)",
            ].join(", "),
            boxSizing: "border-box",
            display: "flex",
            height: BEZEL_HEIGHT,
            justifyContent: "center",
            padding: BEZEL_INSET,
            width: BEZEL_WIDTH,
          }}
        >
          <Screen />
        </div>
      </div>
    </div>
  )
}
