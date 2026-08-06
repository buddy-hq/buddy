import { ARGOS_PROMPT_SCENE_DURATION_FRAMES } from "../components/ArgosPromptScene"
import { LAUNCH_COPY } from "../launchCopy"
import { OPENING_HOOK_DURATION_FRAMES } from "../components/OpeningHook"
import { FIRST_PROMPT_SCENE_DURATION_FRAMES } from "../components/FirstPromptScene"
import {
  FEATURES_MONTAGE_DURATION_FRAMES,
  FEATURES_MONTAGE_PUSH_START_FRAME,
} from "../components/FeaturesMontage"
import {
  FINAL_LOGO_DURATION_FRAMES,
  FINAL_LOGO_WEBSITE_START_FRAME,
} from "../components/FinalLogoEnding"
import { GAME_CLIP_DURATION_FRAMES } from "../components/GamePeak"
import { PROVIDER_CREDITS_DURATION_FRAMES } from "../components/ProviderCreditsScene"
import { READER_SCENE_DURATION_FRAMES } from "../components/ReaderScene"
import {
  PROMPT_TO_RESULT_FADE_IN_FRAMES,
} from "../components/SceneBoundaryFade"
import {
  WHITEBOARD_FADE_OUT_DURATION_FRAMES,
  WHITEBOARD_ONE_SCENE_DURATION_FRAMES,
} from "../components/WhiteboardOneScene"
import { WORMHOLE_PROMPT_SCENE_DURATION_FRAMES } from "../components/WormholePromptScene"
import { BUDDY_LAUNCH_FPS } from "../videoConfig"

export type SceneSlotId =
  | "command"
  | "creation"
  | "reader-prompt"
  | "reader"
  | "native-obsidian"
  | "providers-skills"
  | "subagents"
  | "interactive-prompt"
  | "interactive-game"
  | "mass-feature"
  | "canvas-ending"

export type BuiltInSceneId =
  | "argos-prompt"
  | "first-prompt"
  | "game-peak"
  | "reader"
  | "features-montage"
  | "final-logo-ending"
  | "provider-credits"
  | "whiteboard-one"
  | "wormhole-prompt"

export type SceneSlotDefinition = {
  readonly arcPoint: string
  readonly builtIn: BuiltInSceneId | null
  readonly culmination: string
  readonly durationInFrames: number
  readonly id: SceneSlotId
  readonly kind: "scene"
  readonly muted: boolean
  readonly offsetInFrames?: number
  readonly source: string | null
  readonly title: string
}

export type TransitionDefinition = {
  readonly copy: string | null
  readonly durationInFrames: number
  readonly id: string
  readonly kind: "transition"
  readonly offsetInFrames?: number
  readonly overlayPrevious?: boolean
  readonly style: "fade" | "text"
}

export type LaunchTimelineEntry =
  | SceneSlotDefinition
  | TransitionDefinition

const EMPTY_TIMELINE_DURATION_FRAMES = 0
const secondsToFrames = (seconds: number): number => {
  return Math.round(seconds * BUDDY_LAUNCH_FPS)
}

/**
 * Empty frames between the montage landing on black and the ending starting to
 * rise. Enough to feel like a breath, short enough not to read as dead air —
 * the ending's own fade-in does the rest of the work.
 */
const ENDING_BLACK_HOLD_FRAMES = secondsToFrames(0.4)

const OBSIDIAN_CLIP_DURATION_SECONDS = 10.35
const OBSIDIAN_CLIP_DURATION_FRAMES = secondsToFrames(
  OBSIDIAN_CLIP_DURATION_SECONDS,
)
const SUBAGENTS_CLIP_DURATION_SECONDS = 9.466667
const SUBAGENTS_CLIP_DURATION_FRAMES = secondsToFrames(
  SUBAGENTS_CLIP_DURATION_SECONDS,
)

const sumDuration = (entries: readonly LaunchTimelineEntry[]): number => {
  return entries.reduce(
    (total, entry) =>
      total + entry.durationInFrames + (entry.offsetInFrames ?? 0),
    EMPTY_TIMELINE_DURATION_FRAMES,
  )
}

const timelineBeforeEnding = [
  {
    arcPoint: "Intent",
    builtIn: "first-prompt",
    culmination: "One ambitious prompt has landed; Bench remains closed.",
    durationInFrames: FIRST_PROMPT_SCENE_DURATION_FRAMES,
    id: "command",
    kind: "scene",
    muted: true,
    source: null,
    title: "Command",
  },
  {
    arcPoint: "Creation",
    builtIn: "whiteboard-one",
    culmination: "A polished visual explanation fills docked Bench.",
    durationInFrames: WHITEBOARD_ONE_SCENE_DURATION_FRAMES,
    id: "creation",
    kind: "scene",
    muted: true,
    offsetInFrames: -PROMPT_TO_RESULT_FADE_IN_FRAMES,
    source: null,
    title: "Creation",
  },
  {
    copy: LAUNCH_COPY.transitionToClassicReader.copy,
    durationInFrames: secondsToFrames(2),
    id: "transition-reader",
    kind: "transition",
    offsetInFrames: -WHITEBOARD_FADE_OUT_DURATION_FRAMES,
    overlayPrevious: true,
    style: "text",
  },
  {
    arcPoint: "Invitation",
    builtIn: "argos-prompt",
    culmination: "A literary question is sent to Buddy.",
    durationInFrames: ARGOS_PROMPT_SCENE_DURATION_FRAMES,
    id: "reader-prompt",
    kind: "scene",
    muted: true,
    source: null,
    title: "Argos prompt",
  },
  {
    arcPoint: "Reading",
    builtIn: "reader",
    culmination: "The source opens into a focused native reading experience.",
    durationInFrames: READER_SCENE_DURATION_FRAMES,
    id: "reader",
    kind: "scene",
    muted: true,
    offsetInFrames: -PROMPT_TO_RESULT_FADE_IN_FRAMES,
    source: null,
    title: "Reader",
  },
  {
    copy: LAUNCH_COPY.transitionToObsidian.copy,
    durationInFrames: secondsToFrames(2),
    id: "transition-obsidian",
    kind: "transition",
    style: "text",
  },
  {
    arcPoint: "Native knowledge",
    builtIn: null,
    culmination: "A wikilink opens its destination note inside the vault.",
    durationInFrames: OBSIDIAN_CLIP_DURATION_FRAMES,
    id: "native-obsidian",
    kind: "scene",
    muted: true,
    source: "captures/obsidian.mp4",
    title: "Native Obsidian",
  },
  {
    copy: LAUNCH_COPY.transitionToWormholeGame.copy,
    durationInFrames: secondsToFrames(2),
    id: "transition-game",
    kind: "transition",
    style: "text",
  },
  {
    arcPoint: "Provocation",
    builtIn: "wormhole-prompt",
    culmination: "An imaginative question launches the interactive experience.",
    durationInFrames: WORMHOLE_PROMPT_SCENE_DURATION_FRAMES,
    id: "interactive-prompt",
    kind: "scene",
    muted: true,
    source: null,
    title: "Wormhole prompt",
  },
  {
    arcPoint: "Immersion",
    builtIn: "game-peak",
    culmination: "A decisive interaction pushes the game into its peak state.",
    durationInFrames: GAME_CLIP_DURATION_FRAMES,
    id: "interactive-game",
    kind: "scene",
    muted: true,
    offsetInFrames: -PROMPT_TO_RESULT_FADE_IN_FRAMES,
    source: null,
    title: "Interactive artifact / game",
  },
  {
    copy: LAUNCH_COPY.transitionToResearch.copy,
    durationInFrames: secondsToFrames(2),
    id: "transition-research",
    kind: "transition",
    style: "text",
  },
  {
    arcPoint: "Delegation",
    builtIn: null,
    culmination: "Specialized subagents become part of Buddy's working system.",
    durationInFrames: SUBAGENTS_CLIP_DURATION_FRAMES,
    id: "subagents",
    kind: "scene",
    muted: true,
    source: "captures/subagents.mp4",
    title: "Subagents",
  },
  {
    copy: LAUNCH_COPY.transitionToBringYourOwnAi.copy,
    durationInFrames: secondsToFrames(2),
    id: "transition-bring-your-own-ai",
    kind: "transition",
    style: "text",
  },
  {
    arcPoint: "Open ecosystem",
    builtIn: "provider-credits",
    culmination: "The provider list runs past the frame and lands on its own count.",
    durationInFrames: PROVIDER_CREDITS_DURATION_FRAMES,
    id: "providers-skills",
    kind: "scene",
    muted: true,
    source: null,
    title: "Providers",
  },
  /**
   * No card between the provider count and the montage. Both are a white line
   * centred on black, so a fade from one to the other reads as a flicker in a
   * single card rather than a cut. The contrast in motion does the work a title
   * would have: a line that has stopped, then a wall that starts building.
   */
  {
    arcPoint: "Aftershock",
    builtIn: "features-montage",
    culmination: "Capability elements accumulate, then erupt beyond the frame.",
    durationInFrames: FEATURES_MONTAGE_DURATION_FRAMES,
    id: "mass-feature",
    kind: "scene",
    muted: true,
    source: null,
    title: "Mass feature frame",
  },
] satisfies readonly LaunchTimelineEntry[]

export const LAUNCH_TIMELINE = [
  ...timelineBeforeEnding,
  {
    arcPoint: "Resolution",
    builtIn: "final-logo-ending",
    culmination:
      "The mascot completes the world, dissolves, and leaves the living canvas behind.",
    durationInFrames: FINAL_LOGO_DURATION_FRAMES,
    id: "canvas-ending",
    kind: "scene",
    muted: true,
    offsetInFrames: ENDING_BLACK_HOLD_FRAMES,
    source: null,
    title: "Canvas ending",
  },
] satisfies readonly LaunchTimelineEntry[]

export const SLOT_CANVAS_DURATION_FRAMES = sumDuration(LAUNCH_TIMELINE)
export const BUDDY_LAUNCH_CANVAS_DURATION_FRAMES =
  OPENING_HOOK_DURATION_FRAMES + SLOT_CANVAS_DURATION_FRAMES

/** The frame the final Buddy logo begins appearing. */
export const BUDDY_LAUNCH_ENDING_FRAME =
  BUDDY_LAUNCH_CANVAS_DURATION_FRAMES - FINAL_LOGO_DURATION_FRAMES

/** The frame the feature wall begins its final camera push. */
export const BUDDY_LAUNCH_FEATURES_PUSH_FRAME =
  BUDDY_LAUNCH_ENDING_FRAME -
  ENDING_BLACK_HOLD_FRAMES -
  FEATURES_MONTAGE_DURATION_FRAMES +
  FEATURES_MONTAGE_PUSH_START_FRAME

/**
 * The frame `hibuddy.in` takes the screen, in composition time. The ending is
 * the last entry, so its own start is the canvas end minus its duration.
 */
export const BUDDY_LAUNCH_WEBSITE_FRAME =
  BUDDY_LAUNCH_ENDING_FRAME + FINAL_LOGO_WEBSITE_START_FRAME

export const BUDDY_LAUNCH_DURATION_FRAMES =
  BUDDY_LAUNCH_CANVAS_DURATION_FRAMES
