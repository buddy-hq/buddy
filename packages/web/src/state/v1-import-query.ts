import { queryOptions } from "@tanstack/react-query"
import type { RuntimeV1ImportStatusResponse } from "@buddy/sdk"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"

const V1_IMPORT_QUERY_SCOPE = "runtime-v1-import" as const
const V1_IMPORT_ACTIVE_POLL_MS = 1_500
const V1_IMPORT_PENDING_POLL_MS = 5_000

export type V1ImportReport = RuntimeV1ImportStatusResponse

export const v1ImportQueryKeys = {
  all: () => [V1_IMPORT_QUERY_SCOPE] as const,
}

export function v1ImportInProgress(report: V1ImportReport | undefined): boolean {
  if (!report) return false
  if (report.upgrade.state === "copying" || report.upgrade.state === "migrating") return true
  return report.import?.status === "running" || report.import?.status === "required"
}

export function v1ImportMayBeIncomplete(report: V1ImportReport | undefined): boolean {
  if (!report) return true
  if (
    report.upgrade.state === "copying" ||
    report.upgrade.state === "migrating" ||
    report.upgrade.state === "failed"
  ) return true
  return report.import?.status === "running" || report.import?.status === "required" || report.import?.status === "error"
}

export function v1ImportPollInterval(report: V1ImportReport | undefined): number | false {
  if (v1ImportInProgress(report)) return V1_IMPORT_ACTIVE_POLL_MS
  if (!report || report.upgrade.state === "failed" || report.import === null || report.import.status === "error") return V1_IMPORT_PENDING_POLL_MS
  return false
}

export function v1ImportQueryOptions() {
  return queryOptions({
    queryKey: v1ImportQueryKeys.all(),
    queryFn: async () => requireBuddyData(await getBuddyClient().runtime.v1Import.status()),
    refetchInterval: (query) => v1ImportPollInterval(query.state.data),
  })
}
