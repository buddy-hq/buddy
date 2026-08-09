import { Audio } from "@remotion/media"
import { Sequence, staticFile } from "remotion"

const FIRST_PROMPT_KEYBOARD_TRACK = staticFile("audio/first-prompt-keyboard.wav")
const FIRST_PROMPT_KEYBOARD_TRACK_DURATION_FRAMES = 52
const SECOND_PROMPT_KEYBOARD_TRACK = staticFile("audio/second-prompt-keyboard.wav")
const SECOND_PROMPT_KEYBOARD_TRACK_DURATION_FRAMES = 47
const THIRD_PROMPT_KEYBOARD_TRACK = staticFile("audio/third-prompt-keyboard.wav")
const THIRD_PROMPT_KEYBOARD_TRACK_DURATION_FRAMES = 68

export type PromptTypingSoundTrack = "first" | "second" | "third"

const KEYBOARD_TRACKS: Record<
  PromptTypingSoundTrack,
  { readonly durationInFrames: number; readonly source: string }
> = {
  first: {
    durationInFrames: FIRST_PROMPT_KEYBOARD_TRACK_DURATION_FRAMES,
    source: FIRST_PROMPT_KEYBOARD_TRACK,
  },
  second: {
    durationInFrames: SECOND_PROMPT_KEYBOARD_TRACK_DURATION_FRAMES,
    source: SECOND_PROMPT_KEYBOARD_TRACK,
  },
  third: {
    durationInFrames: THIRD_PROMPT_KEYBOARD_TRACK_DURATION_FRAMES,
    source: THIRD_PROMPT_KEYBOARD_TRACK,
  },
}

type PromptTypingSoundsProps = {
  readonly track: PromptTypingSoundTrack
  readonly typingStartFrame: number
}

export const PromptTypingSounds = ({ track, typingStartFrame }: PromptTypingSoundsProps) => {
  const keyboardTrack = KEYBOARD_TRACKS[track]

  return (
    <Sequence durationInFrames={keyboardTrack.durationInFrames} from={typingStartFrame}>
      <Audio src={keyboardTrack.source} />
    </Sequence>
  )
}
