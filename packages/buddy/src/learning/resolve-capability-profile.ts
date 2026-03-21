import {
  SUBAGENT_IDS,
  type Intent,
  type WorkspaceState,
} from '@buddy/backend/learning/shared/teaching-vocabulary'
import { AdvancedMathRuntimeService } from '../local-runtimes/advanced-math/service'
import { resolveIntentPermissions } from './intents/capabilities'
import type { PersonaDefinition, RuntimeProfile, ToolId } from './shared/runtime-types'

const INTERACTIVE_ONLY_EDITOR_TOOLS: ToolId[] = [
  'teaching_checkpoint',
  'teaching_add_file',
  'teaching_set_lesson',
  'teaching_restore_checkpoint',
]

const EDITOR_SURFACE_ONLY_TOOLS: ToolId[] = [
  'teaching_start_lesson',
  ...INTERACTIVE_ONLY_EDITOR_TOOLS,
]

const FIGURE_SURFACE_ONLY_TOOLS: ToolId[] = ['render_figure', 'render_freeform_figure']

function createDenyToolMap(): Record<ToolId, 'allow' | 'deny'> {
  return {} as Record<ToolId, 'allow' | 'deny'>
}

function createDenySubagentMap(): RuntimeProfile['capabilityEnvelope']['subagents'] {
  const subagents = {} as RuntimeProfile['capabilityEnvelope']['subagents']
  for (const subagentId of SUBAGENT_IDS) {
    subagents[subagentId] = 'deny'
  }
  return subagents
}

function denyTools(tools: Record<ToolId, 'allow' | 'deny'>, toolIds: ToolId[]) {
  for (const toolId of toolIds) {
    tools[toolId] = 'deny'
  }
}

function applyPersonaDefaultTools(
  tools: Record<ToolId, 'allow' | 'deny'>,
  persona: PersonaDefinition,
) {
  for (const [toolId, access] of Object.entries(persona.toolDefaults) as Array<
    [ToolId, 'inherit' | 'allow' | 'deny']
  >) {
    if (access === 'inherit') continue
    tools[toolId] = access
  }
}

function applySurfaceToolConstraints(input: {
  tools: Record<ToolId, 'allow' | 'deny'>
  persona: PersonaDefinition
  workspaceState: WorkspaceState
}) {
  if (input.workspaceState !== 'interactive') {
    denyTools(input.tools, INTERACTIVE_ONLY_EDITOR_TOOLS)
  }

  if (!input.persona.surfaces.includes('editor')) {
    denyTools(input.tools, EDITOR_SURFACE_ONLY_TOOLS)
  }

  if (!input.persona.surfaces.includes('figure')) {
    denyTools(input.tools, FIGURE_SURFACE_ONLY_TOOLS)
  }
}

function applyIntentToolOverrides(input: {
  tools: Record<ToolId, 'allow' | 'deny'>
  intentToolPermissions: Partial<Record<ToolId, 'allow' | 'deny'>>
}) {
  for (const [toolId, access] of Object.entries(input.intentToolPermissions) as Array<
    [ToolId, 'allow' | 'deny']
  >) {
    input.tools[toolId] = access
  }
}

function applyRuntimeToolConstraints(tools: Record<ToolId, 'allow' | 'deny'>) {
  if (!AdvancedMathRuntimeService.isReady()) {
    tools.python_calculator = 'deny'
  }
}

function buildEffectiveTools(input: {
  persona: PersonaDefinition
  workspaceState: WorkspaceState
  intentToolPermissions: Partial<Record<ToolId, 'allow' | 'deny'>>
}): Record<ToolId, 'allow' | 'deny'> {
  const tools = createDenyToolMap()
  applyPersonaDefaultTools(tools, input.persona)
  applySurfaceToolConstraints({
    tools,
    persona: input.persona,
    workspaceState: input.workspaceState,
  })
  applyIntentToolOverrides({
    tools,
    intentToolPermissions: input.intentToolPermissions,
  })
  applyRuntimeToolConstraints(tools)
  return tools
}

function buildEffectiveSubagents(
  persona: PersonaDefinition,
): RuntimeProfile['capabilityEnvelope']['subagents'] {
  const subagents = createDenySubagentMap()

  for (const [subagentId, access] of Object.entries(persona.subagentDefaults)) {
    if (!access || access === 'inherit') continue
    subagents[subagentId as keyof typeof subagents] = access
  }

  return subagents
}

export function resolveCapabilityProfile(input: {
  persona: PersonaDefinition
  workspaceState: WorkspaceState
  intent: Intent
}): RuntimeProfile {
  const intentPermissions = resolveIntentPermissions({
    persona: input.persona,
    intent: input.intent,
    workspaceState: input.workspaceState,
  })

  const tools = buildEffectiveTools({
    persona: input.persona,
    workspaceState: input.workspaceState,
    intentToolPermissions: intentPermissions.tools,
  })
  const subagents = buildEffectiveSubagents(input.persona)

  return {
    persona: input.persona.id,
    capabilityEnvelope: {
      visibleSurfaces: [...input.persona.surfaces],
      defaultSurface: input.persona.defaultSurface,
      tools,
      subagents,
      skills: intentPermissions.skills,
    },
  }
}
