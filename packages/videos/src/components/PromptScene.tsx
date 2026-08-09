import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion"

import type { PromptComposerCopy } from "../launchCopy"
import { BUDDY_LAUNCH_FPS } from "../videoConfig"
import { getPromptTypingDurationInFrames, PromptComposerMock } from "./PromptComposerMock"
import { PromptTypingSounds, type PromptTypingSoundTrack } from "./PromptTypingSounds"

const SCENE_BACKGROUND = "#12131b"
/**
 * Just enough to land the composer without a cut. The scene's job is the
 * typing, so the entrance gets out of its way.
 */
const PROMPT_ENTRANCE_DURATION_SECONDS = 0.25
const TYPING_START_FRAME = Math.round(PROMPT_ENTRANCE_DURATION_SECONDS * BUDDY_LAUNCH_FPS)
const SUBMIT_HOLD_FRAMES = 8
const SUBMIT_AND_DISSOLVE_FRAMES = 22
const ENTRANCE_START_FRAME = 0
const ENTRANCE_END_FRAME = TYPING_START_FRAME
const ENTRANCE_EASING = Easing.bezier(0.16, 1, 0.3, 1)
const COMPOSER_SCALE = 1.7

const getSubmitFrame = (text: string, wordsPerMinute: number): number => {
  return (
    TYPING_START_FRAME +
    getPromptTypingDurationInFrames({
      fps: BUDDY_LAUNCH_FPS,
      text,
      wordsPerMinute,
    }) +
    SUBMIT_HOLD_FRAMES
  )
}

export const getPromptSceneDurationInFrames = (text: string, wordsPerMinute: number): number => {
  return getSubmitFrame(text, wordsPerMinute) + SUBMIT_AND_DISSOLVE_FRAMES
}

type PromptSceneProps = {
  readonly composer: PromptComposerCopy
  readonly text: string
  readonly typingSoundTrack?: PromptTypingSoundTrack
  readonly wordsPerMinute: number
}

export const PromptScene = ({
  composer,
  text,
  typingSoundTrack,
  wordsPerMinute,
}: PromptSceneProps) => {
  const frame = useCurrentFrame()
  const submitFrame = getSubmitFrame(text, wordsPerMinute)

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        backgroundColor: SCENE_BACKGROUND,
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          opacity: interpolate(frame, [ENTRANCE_START_FRAME, ENTRANCE_END_FRAME], [0, 1], {
            easing: ENTRANCE_EASING,
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          scale: interpolate(
            frame,
            [ENTRANCE_START_FRAME, ENTRANCE_END_FRAME],
            [COMPOSER_SCALE * 0.98, COMPOSER_SCALE],
            {
              easing: ENTRANCE_EASING,
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            },
          ),
          translate: interpolate(
            frame,
            [ENTRANCE_START_FRAME, ENTRANCE_END_FRAME],
            ["0px 20px", "0px 0px"],
            {
              easing: ENTRANCE_EASING,
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            },
          ),
        }}
      >
        <PromptComposerMock
          modelLabel={composer.modelLabel}
          placeholder={composer.placeholder}
          submitFrame={submitFrame}
          text={text}
          thinkingLabel={composer.thinkingLabel}
          typingStartFrame={TYPING_START_FRAME}
          wordsPerMinute={wordsPerMinute}
        />
      </div>
      {typingSoundTrack ? (
        <PromptTypingSounds track={typingSoundTrack} typingStartFrame={TYPING_START_FRAME} />
      ) : null}
    </AbsoluteFill>
  )
}
