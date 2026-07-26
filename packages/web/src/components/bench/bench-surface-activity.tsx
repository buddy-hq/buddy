import { createContext, useContext, useEffect, useRef } from "react"

/**
 * Tells a Bench surface whether it is the one the user is looking at.
 *
 * A kept-alive surface stays mounted while another chat's target is active, so "mounted" no longer
 * implies "running". Surfaces that own continuously running work — media playback, timers, polling,
 * animation frames, resize observers — must suspend it while parked. Surfaces that only render
 * static content can ignore this.
 */
const BenchSurfaceActivityContext = createContext<boolean>(true)

export const BenchSurfaceActivityProvider = BenchSurfaceActivityContext.Provider

export function useBenchSurfaceActive(): boolean {
  return useContext(BenchSurfaceActivityContext)
}

/**
 * Runs boundary synchronization when a kept-alive surface becomes visible again or is rebound to
 * another identity while remaining visible. It intentionally skips the initial mount because a
 * newly constructed surface has already loaded its authoritative data.
 */
export function useOnBenchSurfaceActivated(
  onActivated: () => void,
  identity: string | undefined,
): void {
  const active = useBenchSurfaceActive()
  const onActivatedRef = useRef(onActivated)
  const previousRef = useRef({ active, identity })
  onActivatedRef.current = onActivated

  useEffect(() => {
    const previous = previousRef.current
    previousRef.current = { active, identity }

    if (active && (!previous.active || previous.identity !== identity)) {
      onActivatedRef.current()
    }
  }, [active, identity])
}
