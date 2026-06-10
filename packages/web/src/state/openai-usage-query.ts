import type {
  ProviderOpenaiModelAvailabilityRefreshResponses,
  ProviderOpenaiUsageGetResponses,
  ProviderOpenaiUsageRefreshResponses,
} from "@buddy/sdk"
import { queryOptions, type QueryClient } from "@tanstack/react-query"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"

const OPENAI_USAGE_QUERY_KEY = "openai-usage" as const
const OPENAI_USAGE_REFRESH_INTERVAL_MS = 60 * 1_000

export type OpenAIUsageSnapshot = ProviderOpenaiUsageGetResponses[200]

export const openAIUsageQueryKeys = {
  current: () => [OPENAI_USAGE_QUERY_KEY] as const,
}

export function clearOpenAIUsageQuery(queryClient: QueryClient) {
  queryClient.removeQueries({
    queryKey: openAIUsageQueryKeys.current(),
    exact: true,
  })
}

export function resetOpenAIUsageQuery(queryClient: QueryClient) {
  return queryClient.resetQueries({
    queryKey: openAIUsageQueryKeys.current(),
    exact: true,
  })
}

export function openAIUsageQueryOptions(enabled: boolean) {
  return queryOptions({
    queryKey: openAIUsageQueryKeys.current(),
    queryFn: async () =>
      requireBuddyData<ProviderOpenaiUsageGetResponses[200]>(
        await getBuddyClient().provider.openai.usage.get(),
      ),
    enabled,
    staleTime: OPENAI_USAGE_REFRESH_INTERVAL_MS,
    refetchInterval: enabled ? OPENAI_USAGE_REFRESH_INTERVAL_MS : false,
  })
}

export async function refreshOpenAIUsage(queryClient: QueryClient) {
  const response = requireBuddyData<ProviderOpenaiUsageRefreshResponses[200]>(
    await getBuddyClient().provider.openai.usage.refresh(),
  )
  queryClient.setQueryData(openAIUsageQueryKeys.current(), response)
  return response
}

export async function refreshOpenAIModelAvailability() {
  return requireBuddyData<ProviderOpenaiModelAvailabilityRefreshResponses[200]>(
    await getBuddyClient().provider.openai.modelAvailability.refresh(),
  )
}
