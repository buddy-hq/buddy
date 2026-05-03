import { AdvancedMathRuntimeService } from "../../local-runtimes/advanced-math/service"
import { StandardsRuntimeService } from "../../local-runtimes/standards/service"
import { allBuddyFeatureIds } from "../runtime/feature-registry"

type FeatureId = string

function runtimeDependencyReady(featureId: FeatureId): boolean {
  switch (featureId) {
    case "calculator":
      return AdvancedMathRuntimeService.isReady()
    case "standards":
      return StandardsRuntimeService.isReady()
    default:
      return true
  }
}

export function resolveFeatureRegistrationFlags(input?: {
  overrides?: Partial<Record<FeatureId, boolean>>
}): Record<FeatureId, boolean> {
  const flags: Record<FeatureId, boolean> = {}

  for (const featureId of allBuddyFeatureIds()) {
    const explicitOverride = input?.overrides?.[featureId]
    if (typeof explicitOverride === "boolean") {
      flags[featureId] = explicitOverride
    } else {
      flags[featureId] = runtimeDependencyReady(featureId)
    }
  }

  return flags
}
