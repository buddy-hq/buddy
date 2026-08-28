import { useEffect, useRef } from "react"

type TDisposalLogDetails = {
  disposalGeneration: number
  currentDisposalGeneration?: number
}

type TStrictModeDeferredDisposalInput<TOwnerKey, TDiagnostics> = {
  ownerKey: TOwnerKey
  dispose: () => void
  eventPrefix?: string
  getDiagnostics?: () => TDiagnostics
  logEvent?: (event: string, details: TDiagnostics & TDisposalLogDetails) => void
}

export function useStrictModeDeferredDisposal<TOwnerKey, TDiagnostics>(
  input: TStrictModeDeferredDisposalInput<TOwnerKey, TDiagnostics>,
): void {
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
    const emitLog = (suffix: string, details: TDisposalLogDetails) => {
      if (!logEvent) return
      logEvent(`${prefix}-${suffix}`, Object.assign({}, getDiagnosticsRef.current?.(), details))
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
