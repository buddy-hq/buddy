import { createContext, useContext } from "react"

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
