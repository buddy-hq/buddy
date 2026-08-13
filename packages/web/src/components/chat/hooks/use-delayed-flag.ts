import { useEffect, useState } from "react"

type DelayedFlagSubject = {
  delayMs: number
  resetKey: string | undefined
}

/**
 * True only once `active` has held continuously for `delayMs`. Resets the moment
 * `active` goes false, so a condition that flickers below the delay never
 * reports true.
 *
 * `resetKey` identifies *what* is being waited on. A caller whose subject can be
 * replaced while the boolean stays true must pass it, or the successor inherits
 * the elapsed time and reveals early.
 */
export function useDelayedFlag(active: boolean, delayMs: number, resetKey?: string): boolean {
  const [elapsedSubject, setElapsedSubject] = useState<DelayedFlagSubject>()

  useEffect(() => {
    if (!active) {
      setElapsedSubject(undefined)
      return
    }

    const timer = setTimeout(() => setElapsedSubject({ delayMs, resetKey }), delayMs)
    return () => clearTimeout(timer)
  }, [active, delayMs, resetKey])

  return (
    active &&
    elapsedSubject !== undefined &&
    elapsedSubject.delayMs === delayMs &&
    elapsedSubject.resetKey === resetKey
  )
}
