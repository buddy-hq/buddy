import type {
  ActivityBundleCapability,
  ActivityBundleDefinition,
  PersonaDefinition,
} from "../../../core/runtime/types-model"
import type { SubagentAccess } from "../../../core/runtime/types"
import type { SubagentId, TeachingIntentId, WorkspaceState } from "@buddy/backend/learning/shared/teaching-vocabulary"
import type { ToolId } from "../../../core/runtime/tool-id"
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
  return {
    id: input.bundle.id,
    activity: input.bundle.activity,
    label: input.bundle.label,
    intent: input.bundle.intent,
    mode: input.bundle.mode,
    description: input.bundle.description,
    autoEligible: input.bundle.autoEligible,
    whenToUse: [...input.bundle.whenToUse],
    outputs: [...(input.bundle.outputs ?? [])],
    skills: [...(input.bundle.skills ?? [])],
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
  intentOverride?: TeachingIntentId
  workspaceState: WorkspaceState
  tools: Record<ToolId, "allow" | "deny">
  subagents: Record<SubagentId, SubagentAccess>
}): ActivityBundleCapability[] {
  return resolveMatchingBundles({
    persona: input.persona,
    intentOverride: input.intentOverride,
    workspaceState: input.workspaceState,
  }).map((bundle) => resolveBundleCapabilities({
    bundle,
    tools: input.tools,
    subagents: input.subagents,
  }))
}

export function resolveBundledSkillPermissions(input: {
  persona: PersonaDefinition
  intentOverride?: TeachingIntentId
  workspaceState: WorkspaceState
}): Record<string, "allow" | "deny"> {
  const allowedSkillNames = new Set(resolveMatchingBundles(input).flatMap((bundle) => bundle.skills ?? []))

  return Object.fromEntries(
    BUNDLED_ACTIVITY_SKILL_NAMES.map((skillName) => [skillName, allowedSkillNames.has(skillName) ? "allow" : "deny"]),
  )
}

export function resolveBundledActivityToolPermissions(input: {
  persona: PersonaDefinition
  intentOverride?: TeachingIntentId
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
