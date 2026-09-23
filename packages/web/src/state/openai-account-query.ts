import type { ProviderOpenaiAccountGetResponses } from "@buddy/sdk"
import { queryOptions, type QueryClient } from "@tanstack/react-query"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"

const OPENAI_ACCOUNT_QUERY_KEY = "openai-account" as const
const OPENAI_ACCOUNT_STALE_TIME_MS = 5 * 60 * 1_000

export type OpenAIAccountIdentity = ProviderOpenaiAccountGetResponses[200]

export const openAIAccountQueryKeys = {
  current: () => [OPENAI_ACCOUNT_QUERY_KEY] as const,
}

export function resetOpenAIAccountQuery(queryClient: QueryClient) {
  return queryClient.resetQueries({
    queryKey: openAIAccountQueryKeys.current(),
    exact: true,
  })
}

export function openAIAccountQueryOptions(enabled: boolean) {
  return queryOptions({
    queryKey: openAIAccountQueryKeys.current(),
    queryFn: async () =>
      requireBuddyData<OpenAIAccountIdentity>(await getBuddyClient().provider.openai.account.get()),
    enabled,
    staleTime: OPENAI_ACCOUNT_STALE_TIME_MS,
  })
}
