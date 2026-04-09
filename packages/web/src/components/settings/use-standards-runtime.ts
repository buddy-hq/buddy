import { useEffect, useState } from "react"
import { toast } from "@buddy/ui"
import {
  installStandardsRuntime,
  loadStandardsRuntimeStatus,
  removeStandardsRuntime,
  type StandardsRuntimeStatus,
} from "@/state/standards-runtime"

const STANDARDS_RUNTIME_POLL_INTERVAL_MS = 1000
const STANDARDS_RUNTIME_ENABLED_STATES: ReadonlySet<StandardsRuntimeStatus["state"]> = new Set([
  "ready",
  "downloading",
  "installing",
  "repairing",
])

export function standardsStatusLabel(
  status: StandardsRuntimeStatus | null,
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
  const [standardsStatus, setStandardsStatus] = useState<StandardsRuntimeStatus | null>(null)
  const [standardsLoading, setStandardsLoading] = useState(false)
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false)

  useEffect(() => {
    if (!props.open) return

    let cancelled = false
    setStandardsLoading(true)
    void loadStandardsRuntimeStatus()
      .then((status) => {
        if (!cancelled) {
          setStandardsStatus(status)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Failed to load standards status")
        }
      })
      .finally(() => {
        if (!cancelled) {
          setStandardsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [props.open])

  useEffect(() => {
    if (!props.open) return
    if (!standardsLoading && !isStandardsRuntimeOperationInProgress(standardsStatus)) return

    let cancelled = false
    const refresh = async () => {
      try {
        const status = await loadStandardsRuntimeStatus()
        if (!cancelled) {
          setStandardsStatus(status)
        }
      } catch {
        // Ignore transient polling errors while an operation is in flight.
      }
    }

    void refresh()
    const interval = window.setInterval(() => {
      void refresh()
    }, STANDARDS_RUNTIME_POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [props.open, standardsLoading, standardsStatus])

  async function applyStandardsRuntimeChange(install: boolean) {
    if (props.platform !== "desktop") {
      return
    }

    setStandardsLoading(true)
    try {
      const nextStatus = install ? await installStandardsRuntime() : await removeStandardsRuntime()
      setStandardsStatus(nextStatus)
      toast(install ? "Standards installed" : "Standards removed")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update standards")
      const refreshed = await loadStandardsRuntimeStatus().catch(() => undefined)
      if (refreshed) {
        setStandardsStatus(refreshed)
      }
    } finally {
      setStandardsLoading(false)
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
