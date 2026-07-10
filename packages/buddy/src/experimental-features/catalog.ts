export const EXPERIMENTAL_FEATURE_ID = {
  learnerMemory: "learner_memory",
} as const

export const EXPERIMENTAL_FEATURE_IDS = [EXPERIMENTAL_FEATURE_ID.learnerMemory] as const

export type ExperimentalFeatureId = (typeof EXPERIMENTAL_FEATURE_IDS)[number]

export function isExperimentalFeatureId(value: string): value is ExperimentalFeatureId {
  return EXPERIMENTAL_FEATURE_IDS.some((featureID) => featureID === value)
}
