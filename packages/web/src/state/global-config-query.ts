import { queryOptions, type QueryClient } from "@tanstack/react-query"
import { loadGlobalConfig } from "./chat-actions"

const GLOBAL_CONFIG_QUERY_SCOPE = "global-config" as const
const GLOBAL_CONFIG_QUERY_KEY = "bundle" as const

export const globalConfigQueryKeys = {
  bundle: () => [GLOBAL_CONFIG_QUERY_SCOPE, GLOBAL_CONFIG_QUERY_KEY] as const,
}

export function globalConfigQueryOptions() {
  return queryOptions({
    queryKey: globalConfigQueryKeys.bundle(),
    queryFn: () => loadGlobalConfig(),
  })
}

export function setGlobalConfigQueryData(
  queryClient: QueryClient,
  nextGlobalConfig: Record<string, unknown>,
) {
  queryClient.setQueryData(globalConfigQueryKeys.bundle(), nextGlobalConfig)
}
