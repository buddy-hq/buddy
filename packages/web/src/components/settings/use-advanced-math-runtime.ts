import { useEffect, useState } from "react"
import { toast } from "@buddy/ui"
import {
  installAdvancedMathRuntime,
  loadAdvancedMathRuntimeStatus,
  removeAdvancedMathRuntime,
  type AdvancedMathRuntimeStatus,
} from "@/state/advanced-math-runtime"

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

export function advancedMathStatusLabel(
  status: AdvancedMathRuntimeStatus | null,
  loading: boolean,
): string {
  if (!status) return loading ? "Loading..." : "Unknown"

  switch (status.state) {
    case "not_installed":
      return "Not installed"
    case "downloading":
      return "Downloading..."
    case "installing":
      return "Installing..."
    case "repairing":
      return "Repairing..."
    case "removing":
      return "Removing..."
    case "ready":
      return "Installed"
    case "error":
      return "Installation failed"
  }
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
  const [advancedMathStatus, setAdvancedMathStatus] = useState<AdvancedMathRuntimeStatus | null>(
    null,
  )
  const [advancedMathLoading, setAdvancedMathLoading] = useState(false)
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false)

  useEffect(() => {
    if (!props.open || props.platform !== "desktop") return

    let cancelled = false
    setAdvancedMathLoading(true)
    void loadAdvancedMathRuntimeStatus()
      .then((status) => {
        if (!cancelled) {
          setAdvancedMathStatus(status)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error(
            error instanceof Error ? error.message : "Failed to load advanced math runtime status",
          )
        }
      })
      .finally(() => {
        if (!cancelled) {
          setAdvancedMathLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [props.open, props.platform])

  useEffect(() => {
    if (!props.open || props.platform !== "desktop") return
    if (!advancedMathLoading && !isAdvancedMathRuntimeOperationInProgress(advancedMathStatus))
      return

    let cancelled = false
    const refresh = async () => {
      try {
        const status = await loadAdvancedMathRuntimeStatus()
        if (!cancelled) {
          setAdvancedMathStatus(status)
        }
      } catch {
        // Ignore transient polling errors while an operation is in flight.
      }
    }

    void refresh()
    const interval = window.setInterval(() => {
      void refresh()
    }, MATH_RUNTIME_POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [advancedMathLoading, advancedMathStatus, props.open, props.platform])

  async function applyMathRuntimeChange(install: boolean) {
    setAdvancedMathLoading(true)
    try {
      const nextStatus = install
        ? await installAdvancedMathRuntime()
        : await removeAdvancedMathRuntime()
      setAdvancedMathStatus(nextStatus)
      toast(install ? "Advanced math runtime installed" : "Advanced math runtime removed")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update advanced math runtime")
      const refreshed = await loadAdvancedMathRuntimeStatus().catch(() => undefined)
      if (refreshed) {
        setAdvancedMathStatus(refreshed)
      }
    } finally {
      setAdvancedMathLoading(false)
    }
  }

  function onToggleAdvancedMathRuntime(nextChecked: boolean) {
    if (!nextChecked) {
      // Show the confirmation dialog instead of window.confirm().
      setRemoveConfirmOpen(true)
      return
    }
    void applyMathRuntimeChange(true)
  }

  function onConfirmRemoveMathRuntime() {
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
