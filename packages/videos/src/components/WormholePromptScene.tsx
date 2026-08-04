import { LAUNCH_COPY } from "../launchCopy"
import {
  getPromptSceneDurationInFrames,
  PromptScene,
} from "./PromptScene"

const WORMHOLE_PROMPT = LAUNCH_COPY.wormholeGame.prompt

export const WORMHOLE_PROMPT_SCENE_DURATION_FRAMES =
  getPromptSceneDurationInFrames(
    WORMHOLE_PROMPT.text,
    WORMHOLE_PROMPT.wordsPerMinute,
  )

export const WormholePromptScene = () => {
  return (
    <PromptScene {...WORMHOLE_PROMPT} typingSoundTrack="third" />
  )
}
