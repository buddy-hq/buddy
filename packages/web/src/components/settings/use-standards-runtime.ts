import { useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "@buddy/ui"
import {
  installStandardsRuntime,
  removeStandardsRuntime,
  type StandardsRuntimeStatus,
} from "@/state/standards-runtime"
import {
  invalidateStandardsRuntimeStatusQuery,
  localRuntimeQueryKeys,
  standardsRuntimeStatusQueryOptions,
} from "@/state/local-runtime-query"

const STANDARDS_RUNTIME_POLL_INTERVAL_MS = 1000
const STANDARDS_RUNTIME_ENABLED_STATES: ReadonlySet<StandardsRuntimeStatus["state"]> = new Set([
  "ready",
  "downloading",
  "installing",
  "repairing",
])

function isStandardsRuntimeOperationInProgress(status: StandardsRuntimeStatus | null) {
  if (!status) return false

  return (
    status.state === "downloading" ||
    status.state === "installing" ||
    status.state === "repairing" ||
    status.state === "removing"
  )
}

type UseStandardsRuntimeProps = {
  open: boolean
  platform: "desktop" | "web"
}

export function useStandardsRuntime(props: UseStandardsRuntimeProps) {
  const queryClient = useQueryClient()
  const [updatingRuntime, setUpdatingRuntime] = useState(false)
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false)
  const queryEnabled = props.open && props.platform === "desktop"
  const standardsStatusQuery = useQuery({
    ...standardsRuntimeStatusQueryOptions(),
    enabled: queryEnabled,
    refetchInterval: (query) =>
      isStandardsRuntimeOperationInProgress(query.state.data ?? null)
        ? STANDARDS_RUNTIME_POLL_INTERVAL_MS
        : false,
  })
  const standardsStatus = standardsStatusQuery.data ?? null
  const standardsLoading = queryEnabled && (updatingRuntime || standardsStatusQuery.isPending)

  useEffect(() => {
    if (!standardsStatusQuery.error) return
    if (updatingRuntime || isStandardsRuntimeOperationInProgress(standardsStatus)) {
      return
    }

    const message =
      standardsStatusQuery.error instanceof Error
        ? standardsStatusQuery.error.message
        : "Failed to load standards status"
    toast.error(message)
  }, [standardsStatus, standardsStatusQuery.error, updatingRuntime])

  async function applyStandardsRuntimeChange(install: boolean) {
    if (props.platform !== "desktop") {
      return
    }

    setUpdatingRuntime(true)
    try {
      const nextStatus = install ? await installStandardsRuntime() : await removeStandardsRuntime()
      queryClient.setQueryData<StandardsRuntimeStatus>(
        localRuntimeQueryKeys.standardsStatus(),
        nextStatus,
      )
      await invalidateStandardsRuntimeStatusQuery(queryClient)
      toast(install ? "Standards installed" : "Standards removed")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update standards")
      await invalidateStandardsRuntimeStatusQuery(queryClient)
    } finally {
      setUpdatingRuntime(false)
    }
  }

  function onToggleStandardsRuntime(nextChecked: boolean) {
    if (props.platform !== "desktop") {
      return
    }

    if (!nextChecked) {
      setRemoveConfirmOpen(true)
      return
    }

    void applyStandardsRuntimeChange(true)
  }

  function onConfirmRemoveStandardsRuntime() {
    if (props.platform !== "desktop") {
      return
    }

    setRemoveConfirmOpen(false)
    void applyStandardsRuntimeChange(false)
  }

  const standardsBusy = standardsLoading || isStandardsRuntimeOperationInProgress(standardsStatus)
  const standardsEnabled =
    !!standardsStatus &&
    standardsStatus.enabled &&
    STANDARDS_RUNTIME_ENABLED_STATES.has(standardsStatus.state)

  return {
    standardsStatus,
    standardsLoading,
    standardsBusy,
    standardsEnabled,
    removeConfirmOpen,
    setRemoveConfirmOpen,
    onToggleStandardsRuntime,
    onConfirmRemoveStandardsRuntime,
  }
}
