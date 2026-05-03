import type { BuddyTool } from "./create-buddy-tool"
import type { DefinedBuddySubagent } from "./define-buddy-subagent"
import type { BuddySkill } from "./define-buddy-skill"
import type { Surface } from "../shared/teaching-vocabulary"

type BuddyFeatureDefinition<Id extends string = string> = {
  id: Id
  tools: readonly BuddyTool[]
  skills: readonly BuddySkill[]
  subagents: readonly DefinedBuddySubagent[]
  surfaces: readonly Surface[]
}

type DefinedBuddyFeature<Id extends string = string> = BuddyFeatureDefinition<Id>

function defineBuddyFeature<const Id extends string>(
  input: BuddyFeatureDefinition<Id>,
): DefinedBuddyFeature<Id> {
  return {
    ...input,
    tools: [...input.tools],
    skills: [...input.skills],
    subagents: [...input.subagents],
    surfaces: [...input.surfaces],
  }
}

export { defineBuddyFeature }

export type { BuddyFeatureDefinition, DefinedBuddyFeature }
