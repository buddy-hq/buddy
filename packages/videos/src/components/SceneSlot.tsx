import { Video } from "@remotion/media"
import {
  AbsoluteFill,
  Easing,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion"

import type { ComponentType } from "react"

import type { BuiltInSceneId, SceneSlotDefinition } from "../timeline/launchTimeline"
import { ARGOS_PROMPT_SCENE_DURATION_FRAMES, ArgosPromptScene } from "./ArgosPromptScene"
import { FEATURES_MONTAGE_DURATION_FRAMES, FeaturesMontage } from "./FeaturesMontage"
import { FIRST_PROMPT_SCENE_DURATION_FRAMES, FirstPromptScene } from "./FirstPromptScene"
import { FINAL_LOGO_DURATION_FRAMES, FinalLogoEnding } from "./FinalLogoEnding"
import { GAME_CLIP_DURATION_FRAMES, GamePeak } from "./GamePeak"
import {
  READER_FADE_OUT_DURATION_FRAMES,
  READER_SCENE_DURATION_FRAMES,
  ReaderScene,
} from "./ReaderScene"
import { PROVIDER_CREDITS_DURATION_FRAMES, ProviderCreditsScene } from "./ProviderCreditsScene"
import {
  PROMPT_TO_RESULT_FADE_IN_FRAMES,
  PROMPT_TO_RESULT_FADE_OUT_FRAMES,
  SceneBoundaryFade,
} from "./SceneBoundaryFade"
import type { SceneFadeOutCurve } from "./SceneBoundaryFade"
import {
  WHITEBOARD_FADE_OUT_DURATION_FRAMES,
  WHITEBOARD_ONE_SCENE_DURATION_FRAMES,
  WhiteboardOneScene,
} from "./WhiteboardOneScene"
import { WORMHOLE_PROMPT_SCENE_DURATION_FRAMES, WormholePromptScene } from "./WormholePromptScene"

const GUIDE_FADE_FRAMES = 12
const FIRST_FRAME = 0
const LAST_FRAME_OFFSET = 1
const GUIDE_EASING = Easing.bezier(0.4, 0, 0.2, 1)

type BuiltInSceneDefinition = {
  readonly component: ComponentType
  readonly durationInFrames: number
  readonly fadeInDurationInFrames?: number
  readonly fadeOutCurve?: SceneFadeOutCurve
  readonly fadeOutDurationInFrames?: number
  readonly label: string
}

const BUILT_IN_SCENES = {
  "argos-prompt": {
    component: ArgosPromptScene,
    durationInFrames: ARGOS_PROMPT_SCENE_DURATION_FRAMES,
    fadeOutDurationInFrames: PROMPT_TO_RESULT_FADE_OUT_FRAMES,
    label: "Argos prompt",
  },
  "first-prompt": {
    component: FirstPromptScene,
    durationInFrames: FIRST_PROMPT_SCENE_DURATION_FRAMES,
    fadeOutDurationInFrames: PROMPT_TO_RESULT_FADE_OUT_FRAMES,
    label: "First prompt",
  },
  "features-montage": {
    component: FeaturesMontage,
    durationInFrames: FEATURES_MONTAGE_DURATION_FRAMES,
    label: "Mass feature frame",
  },
  "final-logo-ending": {
    component: FinalLogoEnding,
    durationInFrames: FINAL_LOGO_DURATION_FRAMES,
    label: "Ending logo",
  },
  "game-peak": {
    component: GamePeak,
    durationInFrames: GAME_CLIP_DURATION_FRAMES,
    fadeInDurationInFrames: PROMPT_TO_RESULT_FADE_IN_FRAMES,
    label: "Interactive game",
  },
  "provider-credits": {
    component: ProviderCreditsScene,
    durationInFrames: PROVIDER_CREDITS_DURATION_FRAMES,
    label: "Provider credits",
  },
  reader: {
    component: ReaderScene,
    durationInFrames: READER_SCENE_DURATION_FRAMES,
    fadeInDurationInFrames: PROMPT_TO_RESULT_FADE_IN_FRAMES,
    fadeOutCurve: "linear",
    fadeOutDurationInFrames: READER_FADE_OUT_DURATION_FRAMES,
    label: "Reader",
  },
  "whiteboard-one": {
    component: WhiteboardOneScene,
    durationInFrames: WHITEBOARD_ONE_SCENE_DURATION_FRAMES,
    fadeInDurationInFrames: PROMPT_TO_RESULT_FADE_IN_FRAMES,
    fadeOutDurationInFrames: WHITEBOARD_FADE_OUT_DURATION_FRAMES,
    label: "AI agent whiteboard",
  },
  "wormhole-prompt": {
    component: WormholePromptScene,
    durationInFrames: WORMHOLE_PROMPT_SCENE_DURATION_FRAMES,
    fadeOutDurationInFrames: PROMPT_TO_RESULT_FADE_OUT_FRAMES,
    label: "Wormhole prompt",
  },
} satisfies Record<BuiltInSceneId, BuiltInSceneDefinition>

type SceneSlotProps = {
  readonly slot: SceneSlotDefinition
}

export const SceneSlot = ({ slot }: SceneSlotProps) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const lastFrame = slot.durationInFrames - LAST_FRAME_OFFSET
  const fadeOutStartFrame = lastFrame - GUIDE_FADE_FRAMES
  const guideOpacity = interpolate(
    frame,
    [FIRST_FRAME, GUIDE_FADE_FRAMES, fadeOutStartFrame, lastFrame],
    [0, 1, 1, 0],
    {
      easing: GUIDE_EASING,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  )
  const durationSeconds = slot.durationInFrames / fps
  const sceneBackgroundColor = (slot.offsetInFrames ?? 0) < 0 ? "transparent" : "#000000"

  if (slot.source) {
    return (
      <AbsoluteFill style={{ backgroundColor: sceneBackgroundColor }}>
        <SceneBoundaryFade durationInFrames={slot.durationInFrames}>
          <Video
            muted={slot.muted}
            objectFit="contain"
            src={staticFile(slot.source)}
            style={{
              height: "100%",
              width: "100%",
            }}
          />
        </SceneBoundaryFade>
      </AbsoluteFill>
    )
  }

  if (slot.builtIn) {
    const builtInScene = BUILT_IN_SCENES[slot.builtIn]
    const BuiltInComponent = builtInScene.component
    const remainingDurationInFrames = slot.durationInFrames - builtInScene.durationInFrames

    if (remainingDurationInFrames !== 0) {
      throw new Error(`${builtInScene.label} duration does not match the ${slot.id} scene.`)
    }

    return (
      <AbsoluteFill style={{ backgroundColor: sceneBackgroundColor }}>
        <Sequence durationInFrames={builtInScene.durationInFrames}>
          <SceneBoundaryFade
            durationInFrames={builtInScene.durationInFrames}
            fadeInDurationInFrames={
              "fadeInDurationInFrames" in builtInScene
                ? builtInScene.fadeInDurationInFrames
                : undefined
            }
            fadeOutCurve={"fadeOutCurve" in builtInScene ? builtInScene.fadeOutCurve : undefined}
            fadeOutDurationInFrames={
              "fadeOutDurationInFrames" in builtInScene
                ? builtInScene.fadeOutDurationInFrames
                : undefined
            }
          >
            <BuiltInComponent />
          </SceneBoundaryFade>
        </Sequence>
      </AbsoluteFill>
    )
  }

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        backgroundColor: "#000000",
        color: "#f5f5f5",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          alignItems: "center",
          display: "flex",
          flexDirection: "column",
          maxWidth: 1320,
          opacity: guideOpacity,
          padding: "100px 120px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            color: "#ff7a1a",
            fontFamily: "monospace",
            fontSize: 30,
            fontWeight: 700,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
          }}
        >
          Scene slot · {slot.id} · {durationSeconds.toFixed(1)}s
        </div>

        <div
          style={{
            fontFamily: "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, sans-serif",
            fontSize: 104,
            fontWeight: 750,
            letterSpacing: "-0.055em",
            lineHeight: 1,
            marginTop: 34,
          }}
        >
          {slot.title}
        </div>

        <div
          style={{
            color: "rgba(255,255,255,0.6)",
            fontFamily: "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, sans-serif",
            fontSize: 42,
            lineHeight: 1.35,
            marginTop: 38,
          }}
        >
          Culmination: {slot.culmination}
        </div>

        <div
          style={{
            color: "rgba(255,255,255,0.28)",
            fontFamily: "monospace",
            fontSize: 28,
            marginTop: 48,
          }}
        >
          Add media to public/scenes, then set this slot&apos;s source in launchTimeline.ts
        </div>
      </div>
    </AbsoluteFill>
  )
}
