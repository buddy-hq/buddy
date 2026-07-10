import type { ReferenceListResponses } from "@buddy/sdk"
import { queryOptions, type QueryClient } from "@tanstack/react-query"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"

const REFERENCE_QUERY_SCOPE = "opencode-references" as const

export type OpenCodeReference = ReferenceListResponses[200]["data"][number]

export const referenceQueryKeys = {
  list: (directory: string) => [REFERENCE_QUERY_SCOPE, directory] as const,
}

export function referenceListQueryOptions(directory: string) {
  return queryOptions({
    queryKey: referenceQueryKeys.list(directory),
    queryFn: async () => {
      const result = await getBuddyClient(directory).reference.list()
      return requireBuddyData<ReferenceListResponses[200]>(result)
    },
    staleTime: Number.POSITIVE_INFINITY,
  })
}

export async function invalidateReferenceList(queryClient: QueryClient, directory: string) {
  await queryClient.invalidateQueries({ queryKey: referenceQueryKeys.list(directory) })
}
