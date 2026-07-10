import type { QueryClient } from "@tanstack/react-query"
import { queryOptions } from "@tanstack/react-query"
import type { GlobalExperimentalFeaturesListResponse } from "@buddy/sdk"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"

const EXPERIMENTAL_FEATURES_QUERY_SCOPE = "experimental-features" as const

export const EXPERIMENTAL_FEATURE_ID = {
  learnerMemory: "learner_memory",
} as const

type ExperimentalFeatureID =
  (typeof EXPERIMENTAL_FEATURE_ID)[keyof typeof EXPERIMENTAL_FEATURE_ID]
type ExperimentalFeatureStatus = GlobalExperimentalFeaturesListResponse["features"][number]
type ExperimentalFeaturesResponse = GlobalExperimentalFeaturesListResponse

export const experimentalFeaturesQueryKeys = {
  all: () => [EXPERIMENTAL_FEATURES_QUERY_SCOPE] as const,
}

export function experimentalFeaturesQueryOptions() {
  return queryOptions({
    queryKey: experimentalFeaturesQueryKeys.all(),
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: async () =>
      requireBuddyData(await getBuddyClient().global.experimentalFeatures.list()),
  })
}

export function experimentalFeatureIsEnabled(
  response: ExperimentalFeaturesResponse | undefined,
  featureID: ExperimentalFeatureID,
): boolean {
  return response?.features.some((feature) => feature.id === featureID && feature.enabled) === true
}

export async function updateExperimentalFeature(input: {
  queryClient: QueryClient
  featureID: ExperimentalFeatureID
  enabled: boolean
}): Promise<ExperimentalFeatureStatus> {
  const status = requireBuddyData(
    await getBuddyClient().global.experimentalFeatures.update({
      featureID: input.featureID,
      enabled: input.enabled,
    }),
  )

  input.queryClient.setQueryData<ExperimentalFeaturesResponse | undefined>(
    experimentalFeaturesQueryKeys.all(),
    (current) => ({
      features: current?.features.map((feature) =>
        feature.id === status.id ? status : feature,
      ) ?? [status],
    }),
  )
  return status
}

export type { ExperimentalFeatureID, ExperimentalFeatureStatus, ExperimentalFeaturesResponse }
