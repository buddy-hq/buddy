import type { Config } from "@buddy/backend/config"
import type { ExperimentalFeatureId } from "../../experimental-features/catalog"
import type { BuddyTool } from "./create-buddy-tool"
import type { DefinedBuddySubagent } from "./define-buddy-subagent"
import type { BuddySkill } from "./define-buddy-skill"
import type { Surface } from "../shared/teaching-vocabulary"

type BuddyFeatureRelease = {
  channel: "experimental"
  experimentalFeatureID: ExperimentalFeatureId
}

type BuddyFeaturePrompt = {
  instructions: string
}

type BuddyFeatureDefinition<Id extends string = string> = {
  id: Id
  release?: BuddyFeatureRelease
  enabledWhen?: (config: Config.Info) => boolean
  prompt?: BuddyFeaturePrompt
  tools: readonly BuddyTool[]
  skills: readonly BuddySkill[]
  subagents: readonly DefinedBuddySubagent[]
  surfaces: readonly Surface[]
}

type DefinedBuddyFeature<Id extends string = string> = BuddyFeatureDefinition<Id>

function defineBuddyFeature<const Id extends string>(
  input: BuddyFeatureDefinition<Id>,
): DefinedBuddyFeature<Id> {
  return Object.assign(
    {
      ...input,
      tools: [...input.tools],
      skills: [...input.skills],
      subagents: [...input.subagents],
      surfaces: [...input.surfaces],
    },
    input.release ? { release: { ...input.release } } : undefined,
    input.prompt ? { prompt: { ...input.prompt } } : undefined,
  )
}

export { defineBuddyFeature }

export type { BuddyFeatureDefinition, BuddyFeaturePrompt, BuddyFeatureRelease, DefinedBuddyFeature }
