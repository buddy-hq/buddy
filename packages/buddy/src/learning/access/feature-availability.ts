import type { Config } from "@buddy/backend/config"
import type { DefinedBuddyFeature } from "../runtime/define-buddy-feature"

export function buddyFeatureIsEnabled(feature: DefinedBuddyFeature, config: Config.Info): boolean {
  if (
    feature.release?.channel === "experimental" &&
    config.experimental_features?.[feature.release.experimentalFeatureID] !== true
  ) {
    return false
  }

  return feature.enabledWhen?.(config) ?? true
}

export function enabledBuddyFeatures(
  features: readonly DefinedBuddyFeature[],
  config: Config.Info,
): DefinedBuddyFeature[] {
  return features.filter((feature) => buddyFeatureIsEnabled(feature, config))
}
