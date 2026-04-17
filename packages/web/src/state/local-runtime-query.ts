import { queryOptions, type QueryClient } from "@tanstack/react-query"
import { loadAdvancedMathRuntimeStatus } from "./advanced-math-runtime"
import { loadStandardsRuntimeStatus } from "./standards-runtime"

const LOCAL_RUNTIME_QUERY_SCOPE = "local-runtime" as const
const STANDARDS_RUNTIME_STATUS_QUERY_KEY = "standards-status" as const
const ADVANCED_MATH_RUNTIME_STATUS_QUERY_KEY = "advanced-math-status" as const
const RUNTIME_STATUS_QUERY_STALE_TIME_MS = 0

export const localRuntimeQueryKeys = {
  standardsStatus: () => [LOCAL_RUNTIME_QUERY_SCOPE, STANDARDS_RUNTIME_STATUS_QUERY_KEY] as const,
  advancedMathStatus: () =>
    [LOCAL_RUNTIME_QUERY_SCOPE, ADVANCED_MATH_RUNTIME_STATUS_QUERY_KEY] as const,
}

export function standardsRuntimeStatusQueryOptions() {
  return queryOptions({
    queryKey: localRuntimeQueryKeys.standardsStatus(),
    queryFn: () => loadStandardsRuntimeStatus(),
    staleTime: RUNTIME_STATUS_QUERY_STALE_TIME_MS,
  })
}

export function advancedMathRuntimeStatusQueryOptions() {
  return queryOptions({
    queryKey: localRuntimeQueryKeys.advancedMathStatus(),
    queryFn: () => loadAdvancedMathRuntimeStatus(),
    staleTime: RUNTIME_STATUS_QUERY_STALE_TIME_MS,
  })
}

export function invalidateStandardsRuntimeStatusQuery(queryClient: QueryClient) {
  return queryClient.invalidateQueries({
    queryKey: localRuntimeQueryKeys.standardsStatus(),
  })
}

export function invalidateAdvancedMathRuntimeStatusQuery(queryClient: QueryClient) {
  return queryClient.invalidateQueries({
    queryKey: localRuntimeQueryKeys.advancedMathStatus(),
  })
}
