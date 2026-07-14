import { Config } from "../config"
import { EXPERIMENTAL_FEATURE_IDS, type ExperimentalFeatureId } from "./catalog"

export type ExperimentalFeatureStatus = {
  id: ExperimentalFeatureId
  enabled: boolean
}

export function experimentalFeatureIsEnabled(
  config: Config.Info,
  featureID: ExperimentalFeatureId,
): boolean {
  return config.experimental_features?.[featureID] === true
}

export function listExperimentalFeatureStatuses(config: Config.Info): ExperimentalFeatureStatus[] {
  return EXPERIMENTAL_FEATURE_IDS.map((featureID) => ({
    id: featureID,
    enabled: experimentalFeatureIsEnabled(config, featureID),
  }))
}

export async function readExperimentalFeatureStatuses(): Promise<ExperimentalFeatureStatus[]> {
  return listExperimentalFeatureStatuses(await Config.getGlobal())
}

export async function setExperimentalFeatureEnabled(input: {
  featureID: ExperimentalFeatureId
  enabled: boolean
}): Promise<ExperimentalFeatureStatus> {
  const config = await Config.mutateGlobal((current) => {
    const experimentalFeatures = { ...current.experimental_features }
    if (input.enabled) {
      experimentalFeatures[input.featureID] = true
    } else {
      delete experimentalFeatures[input.featureID]
    }

    return Config.Info.parse({
      ...current,
      experimental_features:
        Object.keys(experimentalFeatures).length > 0 ? experimentalFeatures : undefined,
    })
  })

  return {
    id: input.featureID,
    enabled: experimentalFeatureIsEnabled(config, input.featureID),
  }
}
