import {
  resolveActivityBundles,
  resolveBundledActivityToolPermissions,
  resolveBundledSkillPermissions,
} from "./activity-bundles.js"
import type { PersonaDefinition, RuntimeProfile, TeachingIntentId, ToolId, WorkspaceState } from "./types.js"
import { SUBAGENT_IDS, TOOL_IDS } from "./types.js"

function defaultToolPermissions() {
  return Object.fromEntries(TOOL_IDS.map((toolId) => [toolId, "deny"])) as Record<ToolId, "allow" | "deny">
}

function buildEffectiveTools(input: {
  persona: PersonaDefinition
  workspaceState: WorkspaceState
  intentOverride?: TeachingIntentId
}) {
  const tools = defaultToolPermissions()

  for (const [toolId, access] of Object.entries(input.persona.toolDefaults) as Array<[ToolId, "inherit" | "allow" | "deny"]>) {
    tools[toolId] = access === "deny" ? "deny" : "allow"
  }

  if (input.workspaceState !== "interactive") {
    tools.teaching_checkpoint = "deny"
    tools.teaching_add_file = "deny"
    tools.teaching_set_lesson = "deny"
    tools.teaching_restore_checkpoint = "deny"
  }

  if (!input.persona.surfaces.includes("figure")) {
    tools.render_figure = "deny"
    tools.render_freeform_figure = "deny"
  }

  if (!input.persona.surfaces.includes("editor")) {
    tools.teaching_start_lesson = "deny"
    tools.teaching_checkpoint = "deny"
    tools.teaching_add_file = "deny"
    tools.teaching_set_lesson = "deny"
    tools.teaching_restore_checkpoint = "deny"
  }

  const activityTools = resolveBundledActivityToolPermissions({
    persona: input.persona,
    intentOverride: input.intentOverride,
    workspaceState: input.workspaceState,
  })
  for (const [toolId, access] of Object.entries(activityTools) as Array<[ToolId, "allow" | "deny"]>) {
    tools[toolId] = access
  }

  return tools
}

function buildEffectiveSubagents(input: { persona: PersonaDefinition }) {
  const subagents = Object.fromEntries(
    SUBAGENT_IDS.map((subagentId) => [subagentId, "deny"]),
  ) as RuntimeProfile["capabilityEnvelope"]["subagents"]

  for (const [subagentId, access] of Object.entries(input.persona.subagentDefaults)) {
    if (!access || access === "inherit") continue
    subagents[subagentId as keyof typeof subagents] = access
  }

  return subagents
}

export function compileRuntimeProfile(input: {
  persona: PersonaDefinition
  workspaceState: WorkspaceState
  intentOverride?: TeachingIntentId
}): RuntimeProfile {
  const tools = buildEffectiveTools(input)
  const subagents = buildEffectiveSubagents({ persona: input.persona })

  return {
    key: input.persona.id,
    persona: input.persona.id,
    runtimeAgent: input.persona.runtimeAgent,
    capabilityEnvelope: {
      visibleSurfaces: [...input.persona.surfaces],
      defaultSurface: input.persona.defaultSurface,
      tools,
      subagents,
      skills: resolveBundledSkillPermissions({
        persona: input.persona,
        intentOverride: input.intentOverride,
        workspaceState: input.workspaceState,
      }),
      activityBundles: resolveActivityBundles({
        persona: input.persona,
        intentOverride: input.intentOverride,
        workspaceState: input.workspaceState,
        tools,
        subagents,
      }),
    },
  }
}
