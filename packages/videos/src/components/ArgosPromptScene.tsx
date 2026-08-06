import { LAUNCH_COPY } from "../launchCopy"
import {
  getPromptSceneDurationInFrames,
  PromptScene,
} from "./PromptScene"

const ARGOS_PROMPT = LAUNCH_COPY.classicReader.prompt

export const ARGOS_PROMPT_SCENE_DURATION_FRAMES =
  getPromptSceneDurationInFrames(
    ARGOS_PROMPT.text,
    ARGOS_PROMPT.wordsPerMinute,
  )

export const ArgosPromptScene = () => {
  return (
    <PromptScene {...ARGOS_PROMPT} typingSoundTrack="second" />
  )
}
