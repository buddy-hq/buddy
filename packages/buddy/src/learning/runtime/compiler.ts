import {
  resolveActivityBundles,
  resolveBundledActivityToolPermissions,
  resolveBundledSkillPermissions,
} from "./activity-bundles.js"
import {
  SUBAGENT_IDS,
  TOOL_IDS,
  type PersonaDefinition,
  type RuntimeProfile,
  type TeachingIntentId,
  type ToolId,
  type WorkspaceState,
} from "./types.js"

const INTERACTIVE_ONLY_EDITOR_TOOLS: ToolId[] = [
  "teaching_checkpoint",
  "teaching_add_file",
  "teaching_set_lesson",
  "teaching_restore_checkpoint",
]

const EDITOR_SURFACE_ONLY_TOOLS: ToolId[] = [
  "teaching_start_lesson",
  ...INTERACTIVE_ONLY_EDITOR_TOOLS,
]

const FIGURE_SURFACE_ONLY_TOOLS: ToolId[] = [
  "render_figure",
  "render_freeform_figure",
]

function createDenyToolMap(): Record<ToolId, "allow" | "deny"> {
  const tools = {} as Record<ToolId, "allow" | "deny">
  for (const toolId of TOOL_IDS) {
    tools[toolId] = "deny"
  }
  return tools
}

function createDenySubagentMap(): RuntimeProfile["capabilityEnvelope"]["subagents"] {
  const subagents = {} as RuntimeProfile["capabilityEnvelope"]["subagents"]
  for (const subagentId of SUBAGENT_IDS) {
    subagents[subagentId] = "deny"
  }
  return subagents
}

function denyTools(tools: Record<ToolId, "allow" | "deny">, toolIds: ToolId[]) {
  for (const toolId of toolIds) {
    tools[toolId] = "deny"
  }
}

function applyPersonaDefaultTools(tools: Record<ToolId, "allow" | "deny">, persona: PersonaDefinition) {
  for (const [toolId, access] of Object.entries(persona.toolDefaults) as Array<[ToolId, "inherit" | "allow" | "deny"]>) {
    if (access === "inherit") continue
    tools[toolId] = access
  }
}

function applySurfaceToolConstraints(input: {
  tools: Record<ToolId, "allow" | "deny">
  persona: PersonaDefinition
  workspaceState: WorkspaceState
}) {
  if (input.workspaceState !== "interactive") {
    denyTools(input.tools, INTERACTIVE_ONLY_EDITOR_TOOLS)
  }

  if (!input.persona.surfaces.includes("editor")) {
    denyTools(input.tools, EDITOR_SURFACE_ONLY_TOOLS)
  }

  if (!input.persona.surfaces.includes("figure")) {
    denyTools(input.tools, FIGURE_SURFACE_ONLY_TOOLS)
  }
}

function applyActivityToolOverrides(input: {
  tools: Record<ToolId, "allow" | "deny">
  persona: PersonaDefinition
  workspaceState: WorkspaceState
  intentOverride?: TeachingIntentId
}) {
  const activityTools = resolveBundledActivityToolPermissions({
    persona: input.persona,
    intentOverride: input.intentOverride,
    workspaceState: input.workspaceState,
  })

  for (const [toolId, access] of Object.entries(activityTools) as Array<[ToolId, "allow" | "deny"]>) {
    input.tools[toolId] = access
  }
}

function buildEffectiveTools(input: {
  persona: PersonaDefinition
  workspaceState: WorkspaceState
  intentOverride?: TeachingIntentId
}): Record<ToolId, "allow" | "deny"> {
  const tools = createDenyToolMap()
  applyPersonaDefaultTools(tools, input.persona)
  applySurfaceToolConstraints({
    tools,
    persona: input.persona,
    workspaceState: input.workspaceState,
  })
  applyActivityToolOverrides({
    tools,
    persona: input.persona,
    workspaceState: input.workspaceState,
    intentOverride: input.intentOverride,
  })
  return tools
}

function buildEffectiveSubagents(persona: PersonaDefinition): RuntimeProfile["capabilityEnvelope"]["subagents"] {
  const subagents = createDenySubagentMap()

  for (const [subagentId, access] of Object.entries(persona.subagentDefaults)) {
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
  const subagents = buildEffectiveSubagents(input.persona)

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
