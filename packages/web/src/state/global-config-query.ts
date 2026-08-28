import { queryOptions, type QueryClient } from "@tanstack/react-query"
import { loadGlobalConfig } from "./chat-actions"
import {
  EMPTY_BUDDY_CONFIG,
  parseBuddyConfigObject,
  type TBuddyConfigObject,
} from "./parse-external"

const GLOBAL_CONFIG_QUERY_SCOPE = "global-config" as const
const GLOBAL_CONFIG_QUERY_KEY = "bundle" as const

export const globalConfigQueryKeys = {
  bundle: () => [GLOBAL_CONFIG_QUERY_SCOPE, GLOBAL_CONFIG_QUERY_KEY] as const,
}

export function globalConfigQueryOptions() {
  return queryOptions({
    queryKey: globalConfigQueryKeys.bundle(),
    queryFn: async (): Promise<TBuddyConfigObject> =>
      parseBuddyConfigObject(await loadGlobalConfig()) ?? EMPTY_BUDDY_CONFIG,
  })
}

export function setGlobalConfigQueryData<TConfig>(
  queryClient: QueryClient,
  nextGlobalConfig: TConfig,
) {
  queryClient.setQueryData(
    globalConfigQueryKeys.bundle(),
    parseBuddyConfigObject(nextGlobalConfig) ?? EMPTY_BUDDY_CONFIG,
  )
}
