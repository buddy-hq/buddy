import { useEffect, useRef } from "react"

type StrictModeDeferredDisposalInput = {
  ownerKey: unknown
  dispose: () => void
  eventPrefix?: string
  getDiagnostics?: () => Record<string, unknown>
  logEvent?: (event: string, details: Record<string, unknown>) => void
}

export function useStrictModeDeferredDisposal(input: StrictModeDeferredDisposalInput): void {
  const { eventPrefix, logEvent, ownerKey } = input
  const disposalGenerationRef = useRef(0)
  const disposeRef = useRef(input.dispose)
  const getDiagnosticsRef = useRef(input.getDiagnostics)

  disposeRef.current = input.dispose
  getDiagnosticsRef.current = input.getDiagnostics

  useEffect(() => {
    disposalGenerationRef.current += 1
    const disposalGeneration = disposalGenerationRef.current
    const prefix = eventPrefix ?? "strict-mode-deferred-disposal"
    const emitLog = (suffix: string, details: Record<string, unknown>) => {
      if (!logEvent) return

      const diagnostics = getDiagnosticsRef.current?.()
      logEvent(`${prefix}-${suffix}`, diagnostics ? { ...diagnostics, ...details } : details)
    }

    emitLog("effect-mount", { disposalGeneration })

    return () => {
      emitLog("effect-unmount", { disposalGeneration })
      queueMicrotask(() => {
        const currentDisposalGeneration = disposalGenerationRef.current
        if (currentDisposalGeneration !== disposalGeneration) {
          emitLog("dispose-skipped", {
            disposalGeneration,
            currentDisposalGeneration,
          })
          return
        }

        emitLog("dispose-commit", { disposalGeneration })
        disposeRef.current()
      })
    }
  }, [eventPrefix, logEvent, ownerKey])
}
