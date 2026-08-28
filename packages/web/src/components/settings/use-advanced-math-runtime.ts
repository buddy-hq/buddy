import { useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "@buddy/ui"
import {
  installAdvancedMathRuntime,
  removeAdvancedMathRuntime,
  type AdvancedMathRuntimeStatus,
} from "@/state/advanced-math-runtime"
import {
  advancedMathRuntimeStatusQueryOptions,
  invalidateAdvancedMathRuntimeStatusQuery,
  localRuntimeQueryKeys,
} from "@/state/local-runtime-query"

const MATH_RUNTIME_POLL_INTERVAL_MS = 1000
const LEGACY_TIMESTAMP_VERSION_PATTERN = /^(\d{12})\.([a-f0-9]+)$/
const SEMVER_HASH_VERSION_PATTERN = /^(\d+\.\d+\.\d+)-([a-f0-9]+)$/
const RUNTIME_HASH_DISPLAY_LENGTH = 8

const MATH_RUNTIME_ENABLED_STATES: ReadonlySet<AdvancedMathRuntimeStatus["state"]> = new Set([
  "ready",
  "downloading",
  "installing",
  "repairing",
])

export function formatRuntimeVersion(version: string | undefined): string {
  if (!version) return "Unknown"

  const semverHashMatch = version.match(SEMVER_HASH_VERSION_PATTERN)
  if (semverHashMatch) {
    const [, semver, hash] = semverHashMatch
    const shortHash = hash.slice(0, RUNTIME_HASH_DISPLAY_LENGTH)
    return `v${semver} • ${shortHash}`
  }

  const timestampMatch = version.match(LEGACY_TIMESTAMP_VERSION_PATTERN)
  if (!timestampMatch) return version

  const [, timestamp, hash] = timestampMatch

  const year = timestamp.slice(0, 4)
  const month = parseInt(timestamp.slice(4, 6), 10) - 1
  const day = timestamp.slice(6, 8)
  const hour = parseInt(timestamp.slice(8, 10), 10)
  const minute = timestamp.slice(10, 12)

  const date = new Date(parseInt(year), month, parseInt(day), hour, parseInt(minute))
  const dateStr = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
  const timeStr = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })

  return `${dateStr}, ${timeStr} • ${hash}`
}

function isAdvancedMathRuntimeOperationInProgress(status: AdvancedMathRuntimeStatus | null) {
  if (!status) return false

  return (
    status.state === "downloading" ||
    status.state === "installing" ||
    status.state === "repairing" ||
    status.state === "removing"
  )
}

type UseAdvancedMathRuntimeProps = {
  open: boolean
  platform: "desktop" | "web"
}

export function useAdvancedMathRuntime(props: UseAdvancedMathRuntimeProps) {
  const queryClient = useQueryClient()
  const [updatingRuntime, setUpdatingRuntime] = useState(false)
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false)
  const queryEnabled = props.open && props.platform === "desktop"
  const advancedMathStatusQuery = useQuery({
    ...advancedMathRuntimeStatusQueryOptions(),
    enabled: queryEnabled,
    refetchInterval: (query) =>
      isAdvancedMathRuntimeOperationInProgress(query.state.data ?? null)
        ? MATH_RUNTIME_POLL_INTERVAL_MS
        : false,
  })
  const advancedMathStatus = advancedMathStatusQuery.data ?? null
  const advancedMathLoading = queryEnabled && (updatingRuntime || advancedMathStatusQuery.isPending)

  useEffect(() => {
    if (!advancedMathStatusQuery.error) return
    if (updatingRuntime || isAdvancedMathRuntimeOperationInProgress(advancedMathStatus)) {
      return
    }

    const message =
      advancedMathStatusQuery.error instanceof Error
        ? advancedMathStatusQuery.error.message
        : "Failed to load advanced math runtime status"
    toast.error(message)
  }, [advancedMathStatus, advancedMathStatusQuery.error, updatingRuntime])

  async function applyMathRuntimeChange(install: boolean) {
    if (props.platform !== "desktop") {
      return
    }

    setUpdatingRuntime(true)
    try {
      const nextStatus = install
        ? await installAdvancedMathRuntime()
        : await removeAdvancedMathRuntime()
      queryClient.setQueryData<AdvancedMathRuntimeStatus>(
        localRuntimeQueryKeys.advancedMathStatus(),
        nextStatus,
      )
      await invalidateAdvancedMathRuntimeStatusQuery(queryClient)
      toast(install ? "Advanced math runtime installed" : "Advanced math runtime removed")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update advanced math runtime")
      await invalidateAdvancedMathRuntimeStatusQuery(queryClient)
    } finally {
      setUpdatingRuntime(false)
    }
  }

  function onToggleAdvancedMathRuntime(nextChecked: boolean) {
    if (props.platform !== "desktop") {
      return
    }

    if (!nextChecked) {
      // Show the confirmation dialog instead of window.confirm().
      setRemoveConfirmOpen(true)
      return
    }
    void applyMathRuntimeChange(true)
  }

  function onConfirmRemoveMathRuntime() {
    if (props.platform !== "desktop") {
      return
    }

    setRemoveConfirmOpen(false)
    void applyMathRuntimeChange(false)
  }

  const advancedMathBusy =
    advancedMathLoading || isAdvancedMathRuntimeOperationInProgress(advancedMathStatus)
  const advancedMathEnabled =
    !!advancedMathStatus &&
    advancedMathStatus.enabled &&
    MATH_RUNTIME_ENABLED_STATES.has(advancedMathStatus.state)

  return {
    advancedMathStatus,
    advancedMathLoading,
    advancedMathBusy,
    advancedMathEnabled,
    onToggleAdvancedMathRuntime,
    removeConfirmOpen,
    setRemoveConfirmOpen,
    onConfirmRemoveMathRuntime,
  }
}
