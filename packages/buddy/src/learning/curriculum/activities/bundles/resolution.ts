import type {
  SubagentId,
  Intent,
  WorkspaceState,
} from "@buddy/backend/learning/shared/teaching-vocabulary"
import type {
  ActivityBundleCapability,
  ActivityBundleDefinition,
  PersonaDefinition,
  SubagentAccess,
  ToolId,
} from "../../../shared/runtime-types"
import {
  BUNDLED_ACTIVITY_SKILL_NAMES,
  BUNDLED_ACTIVITY_TOOL_NAMES,
} from "./data"
import { resolveMatchingBundles } from "./matching"

function resolveBundleTools(input: {
  bundle: ActivityBundleDefinition
  tools: Record<ToolId, "allow" | "deny">
}) {
  return (input.bundle.tools ?? []).filter((toolId) => input.tools[toolId] === "allow")
}

function resolveBundleSubagents(input: {
  bundle: ActivityBundleDefinition
  subagents: Record<SubagentId, SubagentAccess>
}) {
  return (input.bundle.subagents ?? []).filter((subagentId) => input.subagents[subagentId] && input.subagents[subagentId] !== "deny")
}

function resolveBundleCapabilities(input: {
  bundle: ActivityBundleDefinition
  tools: Record<ToolId, "allow" | "deny">
  subagents: Record<SubagentId, SubagentAccess>
}): ActivityBundleCapability {
  const {
    personas: _personas,
    workspaceStates: _workspaceStates,
    outputs,
    skills,
    tools: _bundleTools,
    subagents: _bundleSubagents,
    ...metadata
  } = input.bundle

  return {
    ...metadata,
    whenToUse: [...metadata.whenToUse],
    outputs: [...(outputs ?? [])],
    skills: [...(skills ?? [])],
    tools: resolveBundleTools({
      bundle: input.bundle,
      tools: input.tools,
    }),
    subagents: resolveBundleSubagents({
      bundle: input.bundle,
      subagents: input.subagents,
    }),
  }
}

export function resolveActivityBundles(input: {
  persona: PersonaDefinition
  intent: Intent
  workspaceState: WorkspaceState
  tools: Record<ToolId, "allow" | "deny">
  subagents: Record<SubagentId, SubagentAccess>
}): ActivityBundleCapability[] {
  return resolveMatchingBundles({
    persona: input.persona,
    intent: input.intent,
    workspaceState: input.workspaceState,
  }).map((bundle) => resolveBundleCapabilities({
    bundle,
    tools: input.tools,
    subagents: input.subagents,
  }))
}

export function resolveBundledSkillPermissions(input: {
  persona: PersonaDefinition
  intent: Intent
  workspaceState: WorkspaceState
}): Record<string, "allow" | "deny"> {
  const allowedSkillNames = new Set(resolveMatchingBundles(input).flatMap((bundle) => bundle.skills ?? []))

  return Object.fromEntries(
    BUNDLED_ACTIVITY_SKILL_NAMES.map((skillName) => [skillName, allowedSkillNames.has(skillName) ? "allow" : "deny"]),
  )
}

export function resolveBundledActivityToolPermissions(input: {
  persona: PersonaDefinition
  intent: Intent
  workspaceState: WorkspaceState
}): Partial<Record<ToolId, "allow" | "deny">> {
  const allowedToolNames = new Set(
    resolveMatchingBundles(input).flatMap((bundle) =>
      (bundle.tools ?? []).filter((toolId) => toolId.startsWith("activity_")),
    ),
  )

  return Object.fromEntries(
    BUNDLED_ACTIVITY_TOOL_NAMES.map((toolName) => [toolName, allowedToolNames.has(toolName) ? "allow" : "deny"]),
  ) as Partial<Record<ToolId, "allow" | "deny">>
}

export function bundledActivitySkillNames() {
  return [...BUNDLED_ACTIVITY_SKILL_NAMES]
}
