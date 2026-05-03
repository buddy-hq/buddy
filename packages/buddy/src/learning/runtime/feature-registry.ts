import { ALL_BUDDY_FEATURES } from "../features"
import type { DefinedBuddyFeature } from "./define-buddy-feature"
import type { BuddyTool } from "./create-buddy-tool"

let cachedFeatures: DefinedBuddyFeature[] | undefined

function validateFeatureSet(features: readonly DefinedBuddyFeature[]): void {
  const featureIDs = new Set<string>()
  const toolIDs = new Set<string>()
  const subagentIDs = new Set<string>()

  for (const feature of features) {
    if (featureIDs.has(feature.id)) {
      throw new Error(`Duplicate Buddy feature id "${feature.id}"`)
    }
    featureIDs.add(feature.id)

    for (const tool of feature.tools) {
      if (toolIDs.has(tool.id)) {
        throw new Error(`Duplicate Buddy tool id "${tool.id}"`)
      }
      toolIDs.add(tool.id)
    }

    for (const subagent of feature.subagents) {
      if (subagentIDs.has(subagent.key)) {
        throw new Error(`Duplicate Buddy subagent id "${subagent.key}"`)
      }
      subagentIDs.add(subagent.key)
    }
  }
}

function validatedFeatures(): DefinedBuddyFeature[] {
  if (cachedFeatures) {
    return cachedFeatures
  }

  const features = [...ALL_BUDDY_FEATURES]
  validateFeatureSet(features)
  cachedFeatures = features
  return features
}

function allBuddyFeatures(): DefinedBuddyFeature[] {
  return [...validatedFeatures()]
}

function getBuddyFeature(id: string): DefinedBuddyFeature | undefined {
  return validatedFeatures().find((feature) => feature.id === id)
}

function allFeatureTools(): string[] {
  return allBuddyTools().map((tool) => tool.id)
}

function collectFeatureTools(feature: DefinedBuddyFeature): BuddyTool[] {
  const seen = new Set<string>()
  const tools: BuddyTool[] = []

  for (const tool of feature.tools) {
    if (seen.has(tool.id)) continue
    seen.add(tool.id)
    tools.push(tool)
  }

  for (const subagent of feature.subagents) {
    for (const tool of subagent.tools ?? []) {
      if (seen.has(tool.id)) continue
      seen.add(tool.id)
      tools.push(tool)
    }
  }

  return tools
}

function allBuddyTools(): BuddyTool[] {
  const seen = new Set<string>()
  const tools: BuddyTool[] = []

  for (const feature of validatedFeatures()) {
    for (const tool of collectFeatureTools(feature)) {
      if (seen.has(tool.id)) continue
      seen.add(tool.id)
      tools.push(tool)
    }
  }

  return tools
}

function allBuddyFeatureIds(): string[] {
  return validatedFeatures().map((feature) => feature.id)
}

export { allBuddyFeatureIds, allBuddyFeatures, allBuddyTools, allFeatureTools, getBuddyFeature }

export type { DefinedBuddyFeature }
