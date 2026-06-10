import { useEffect, useRef, useState } from "react"

import { createFileToolIcon } from "../file-tool-icon"
import type { ToolIconRenderer } from "../tool-registry-types"

const THROTTLE_MS = 600

export type TUseFileToolHeaderDisplayInput = {
  label?: string
  icon?: ToolIconRenderer
  throttleFileTools?: boolean
  fileName?: string
  verb?: string
  isBusy: boolean
}

export type THeaderDisplayState = {
  label?: string
  icon?: ToolIconRenderer
}

function buildFileToolLabel(
  verb: string | undefined,
  fileName: string | undefined,
): string | undefined {
  if (!verb) return undefined
  return fileName ? `${verb} ${fileName}` : verb
}

function buildDisplayState(input: TUseFileToolHeaderDisplayInput): THeaderDisplayState {
  if (input.throttleFileTools) {
    const label = input.label ?? buildFileToolLabel(input.verb, input.fileName)
    return {
      label,
      icon: input.icon ?? (input.fileName ? createFileToolIcon(input.fileName) : undefined),
    }
  }

  return { label: input.label, icon: input.icon }
}

export function useFileToolHeaderDisplay(
  input: TUseFileToolHeaderDisplayInput,
): THeaderDisplayState {
  const [displayState, setDisplayState] = useState<THeaderDisplayState>(() =>
    buildDisplayState(input),
  )

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastUpdateRef = useRef(0)
  const prevIsBusyRef = useRef(input.isBusy)
  const prevThrottleRef = useRef(input.throttleFileTools)
  const prevFileNameRef = useRef(input.fileName)
  const latestRef = useRef(input)
  latestRef.current = input

  const { label, icon, throttleFileTools, fileName, verb, isBusy } = input

  useEffect(() => {
    const clearPending = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }

    const applyImmediate = (next: TUseFileToolHeaderDisplayInput) => {
      setDisplayState(buildDisplayState(next))
      lastUpdateRef.current = Date.now()
      prevFileNameRef.current = next.fileName
    }

    const prevIsBusy = prevIsBusyRef.current
    const prevThrottle = prevThrottleRef.current
    const prevFileName = prevFileNameRef.current

    const isBusyTransition = prevIsBusy !== isBusy
    const throttleEnabled = isBusy && Boolean(throttleFileTools)
    const throttleTurnedOn = !prevThrottle && Boolean(throttleFileTools) && isBusy
    const throttleTurnedOff = Boolean(prevThrottle) && !throttleFileTools
    const firstFileName = !prevFileName && Boolean(fileName)
    const midBurstFileChange =
      Boolean(prevFileName) &&
      Boolean(fileName) &&
      prevFileName !== fileName &&
      throttleEnabled &&
      !isBusyTransition &&
      !throttleTurnedOn &&
      !throttleTurnedOff &&
      !firstFileName

    if (
      !throttleEnabled ||
      isBusyTransition ||
      throttleTurnedOn ||
      throttleTurnedOff ||
      firstFileName ||
      !midBurstFileChange
    ) {
      clearPending()
      applyImmediate({ label, icon, throttleFileTools, fileName, verb, isBusy })
      prevIsBusyRef.current = isBusy
      prevThrottleRef.current = throttleFileTools
      return clearPending
    }

    const elapsed = Date.now() - lastUpdateRef.current
    if (elapsed >= THROTTLE_MS) {
      clearPending()
      applyImmediate({ label, icon, throttleFileTools, fileName, verb, isBusy })
    } else if (!timeoutRef.current) {
      timeoutRef.current = setTimeout(() => {
        applyImmediate(latestRef.current)
        timeoutRef.current = null
      }, THROTTLE_MS - elapsed)
    }

    prevIsBusyRef.current = isBusy
    prevThrottleRef.current = throttleFileTools
    return clearPending
  }, [label, icon, throttleFileTools, fileName, verb, isBusy])

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return displayState
}
