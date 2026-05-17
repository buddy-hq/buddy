import { QueryClient } from "@tanstack/react-query"

const DEFAULT_QUERY_STALE_TIME_MS = 15_000
const DEFAULT_QUERY_GC_TIME_MS = 30 * 60 * 1000
const DEFAULT_QUERY_RETRY_COUNT = 1

export const appQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: DEFAULT_QUERY_STALE_TIME_MS,
      gcTime: DEFAULT_QUERY_GC_TIME_MS,
      retry: DEFAULT_QUERY_RETRY_COUNT,
    },
  },
})
