import { LAUNCH_COPY } from "../launchCopy"
import { getPromptSceneDurationInFrames, PromptScene } from "./PromptScene"

const FIRST_PROMPT = LAUNCH_COPY.agentWhiteboard.prompt

export const FIRST_PROMPT_SCENE_DURATION_FRAMES = getPromptSceneDurationInFrames(
  FIRST_PROMPT.text,
  FIRST_PROMPT.wordsPerMinute,
)

export const FirstPromptScene = () => {
  return <PromptScene {...FIRST_PROMPT} typingSoundTrack="first" />
}
