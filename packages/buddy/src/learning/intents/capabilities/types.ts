import type { Intent } from '@buddy/backend/learning/shared/teaching-vocabulary'
import type { SkillCapabilityKey } from './skill-capabilities'
import { createToolCapability } from './tool-capabilities'
import type { ToolCapability, ToolCapabilityInput } from './tool-capabilities'

type ExplicitIntent = Exclude<Intent, 'auto'>

export type IntentCapabilityManifest = {
  intent: ExplicitIntent
  toolCapabilities: ToolCapability[]
  skillCapabilityKeys: SkillCapabilityKey[]
}

export function createIntentCapabilities(input: {
  intent: ExplicitIntent
  tools?: ToolCapabilityInput[]
  skills?: SkillCapabilityKey[]
}): IntentCapabilityManifest {
  return {
    intent: input.intent,
    toolCapabilities: (input.tools ?? []).map((tool) => createToolCapability(tool)),
    skillCapabilityKeys: [...(input.skills ?? [])],
  }
}
