import { ASSESS_INTENT_CAPABILITY_MANIFEST } from "../assess/capabilities"
import { LEARN_INTENT_CAPABILITY_MANIFEST } from "../learn/capabilities"
import { PRACTICE_INTENT_CAPABILITY_MANIFEST } from "../practice/capabilities"
import type { SkillCapabilityKey } from "./skill-capabilities"
import type { IntentCapabilityManifest } from "./types"

type ExplicitIntent = IntentCapabilityManifest["intent"]

export type { IntentCapabilityManifest } from "./types"

export const INTENT_CAPABILITY_MANIFESTS: IntentCapabilityManifest[] = [
  LEARN_INTENT_CAPABILITY_MANIFEST,
  PRACTICE_INTENT_CAPABILITY_MANIFEST,
  ASSESS_INTENT_CAPABILITY_MANIFEST,
]

type ListedIntentCapabilityManifest = {
  intent: ExplicitIntent
  toolCapabilityKeys: string[]
  skillCapabilityKeys: SkillCapabilityKey[]
}

export function listIntentCapabilityManifests(): ListedIntentCapabilityManifest[] {
  return INTENT_CAPABILITY_MANIFESTS.map((manifest) => ({
    intent: manifest.intent,
    toolCapabilityKeys: manifest.toolCapabilities.map((capability) => capability.tool.id),
    skillCapabilityKeys: [...manifest.skillCapabilityKeys],
  }))
}
