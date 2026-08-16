import type { Config } from "@buddy/backend/config"
import { AdvancedMathRuntimeService } from "../../local-runtimes/advanced-math/service"
import { StandardsRuntimeService } from "../../local-runtimes/standards/service"
import type { DefinedBuddyFeature } from "../runtime/define-buddy-feature"
import type { BuddyTool } from "../runtime/create-buddy-tool"
import type { Surface } from "../shared/teaching-vocabulary"
import type { ResolvedSessionRuntime, TeachingWorkspaceState } from "./types"

function toolMatchesTeachingWorkspaceConstraints(
  tool: BuddyTool,
  teachingWorkspaceState: TeachingWorkspaceState,
): boolean {
  if (tool.constraints?.teachingWorkspace === "active") {
    return teachingWorkspaceState === "active"
  }
  return true
}

function toolMatchesRuntimeConstraints(tool: BuddyTool): boolean {
  switch (tool.constraints?.runtime) {
    case "advanced-math":
      return AdvancedMathRuntimeService.isReady()
    case "standards":
      return StandardsRuntimeService.isReady()
    default:
      return true
  }
}

function toolIsAllowed(tool: BuddyTool, teachingWorkspaceState: TeachingWorkspaceState): boolean {
  return (
    toolMatchesTeachingWorkspaceConstraints(tool, teachingWorkspaceState) &&
    toolMatchesRuntimeConstraints(tool)
  )
}

function collectFeatureTools(features: readonly DefinedBuddyFeature[]): BuddyTool[] {
  const seen = new Set<string>()
  const tools: BuddyTool[] = []

  for (const feature of features) {
    for (const tool of feature.tools) {
      if (seen.has(tool.id)) continue
      seen.add(tool.id)
      tools.push(tool)
    }
  }

  return tools
}

function buildToolPermissions(
  features: readonly DefinedBuddyFeature[],
  teachingWorkspaceState: TeachingWorkspaceState,
  configuredToolToggles?: Config.Info["tools"],
) {
  const tools = collectFeatureTools(features)
  const permissions: Record<string, "allow" | "deny"> = {}

  for (const tool of tools) {
    if (tool.dynamic) {
      permissions[tool.id] = "deny"
      continue
    }

    if (configuredToolToggles?.[tool.id] === false) {
      permissions[tool.id] = "deny"
      continue
    }
    permissions[tool.id] = toolIsAllowed(tool, teachingWorkspaceState) ? "allow" : "deny"
  }

  return permissions
}

function buildSkillPermissions(
  features: readonly DefinedBuddyFeature[],
) {
  const permissions: Record<string, "allow" | "deny"> = {}
  const seen = new Set<string>()

  for (const feature of features) {
    for (const skill of feature.skills) {
      if (seen.has(skill.name)) continue
      seen.add(skill.name)
      permissions[skill.name] = "allow"
    }
  }

  return permissions
}

function buildSubagentPermissions(
  features: readonly DefinedBuddyFeature[],
) {
  const permissions: Record<string, "allow" | "deny"> = {}
  const seen = new Set<string>()

  for (const feature of features) {
    for (const subagent of feature.subagents) {
      if (!subagent.delegatable) continue
      if (seen.has(subagent.key)) continue
      seen.add(subagent.key)
      permissions[subagent.key] = "allow"
    }
  }

  return permissions
}

function buildVisibleSurfaces(features: readonly DefinedBuddyFeature[]): Surface[] {
  const surfaces = new Set<Surface>()

  for (const feature of features) {
    for (const surface of feature.surfaces) {
      surfaces.add(surface)
    }
  }

  return [...surfaces]
}

function buildResolvedSessionRuntime(input: {
  features: readonly DefinedBuddyFeature[]
  teachingWorkspaceState: TeachingWorkspaceState
  configuredToolToggles?: Config.Info["tools"]
}): ResolvedSessionRuntime["access"] & { visibleSurfaces: Surface[] } {
  return {
    tools: buildToolPermissions(
      input.features,
      input.teachingWorkspaceState,
      input.configuredToolToggles,
    ),
    skills: buildSkillPermissions(input.features),
    subagents: buildSubagentPermissions(input.features),
    visibleSurfaces: buildVisibleSurfaces(input.features),
  }
}

export { buildResolvedSessionRuntime, collectFeatureTools }

export type { ResolvedSessionRuntime }
