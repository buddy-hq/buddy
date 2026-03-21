import { useEffect, useState } from "react"
import { toast } from "@buddy/ui"
import {
  installAdvancedMathRuntime,
  loadAdvancedMathRuntimeStatus,
  removeAdvancedMathRuntime,
  type AdvancedMathRuntimeStatus,
} from "@/state/advanced-math-runtime"

const MATH_RUNTIME_POLL_INTERVAL_MS = 1000

const MATH_RUNTIME_ENABLED_STATES: ReadonlySet<AdvancedMathRuntimeStatus["state"]> = new Set([
  "ready",
  "downloading",
  "installing",
  "repairing",
])

export function advancedMathStatusLabel(status: AdvancedMathRuntimeStatus | null, loading: boolean) {
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
  const [advancedMathStatus, setAdvancedMathStatus] = useState<AdvancedMathRuntimeStatus | null>(null)
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
          toast.error(error instanceof Error ? error.message : "Failed to load advanced math runtime status")
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
    if (!advancedMathLoading && !isAdvancedMathRuntimeOperationInProgress(advancedMathStatus)) return

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
      const nextStatus = install ? await installAdvancedMathRuntime() : await removeAdvancedMathRuntime()
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

  const advancedMathBusy = advancedMathLoading || isAdvancedMathRuntimeOperationInProgress(advancedMathStatus)
  const advancedMathEnabled =
    !!advancedMathStatus && advancedMathStatus.enabled && MATH_RUNTIME_ENABLED_STATES.has(advancedMathStatus.state)

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
