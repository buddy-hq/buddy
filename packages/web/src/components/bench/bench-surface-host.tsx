import { useState, type ReactNode } from "react"
import type { BenchRuntimeState } from "@/components/bench/bench-route-context"
import { BenchSurfaceActivityProvider } from "@/components/bench/bench-surface-activity"
import {
  releaseBenchSurfaceInstances,
  retainBenchSurfaceInstance,
  retainBenchSurfaceRenderOrder,
  type BenchSurfaceInstance,
} from "@/lib/bench-surface-keep-alive"
import { benchTargetKey, type BenchTabTarget } from "@/lib/bench-navigation"

type BenchSurfaceHostRuntimeState = Omit<BenchRuntimeState, "target"> & {
  target: BenchTabTarget
}

/**
 * Renders every kept-alive Bench surface, with exactly one visible.
 *
 * This replaces rendering the router `Outlet` directly. The router matches a single route at a
 * time, so an outlet-rendered surface is destroyed the moment another target becomes active — that
 * is what made every chat switch rebuild Monaco, Excalidraw, iframes, and media elements. Here the
 * target, not the route match, owns instance identity, so returning to a chat reveals the surface
 * that is already mounted instead of constructing a new one.
 */
export function BenchSurfaceHost(props: {
  directory: string
  activeTarget: BenchTabTarget | null
  retainedTargetKeys: readonly string[]
  /**
   * Whether the Bench is actually on screen. Separate from the active target on purpose: a docked
   * Bench that the user collapsed keeps its target — and its agent-facing registration — but is not
   * visible, and a surface nobody can see must not keep playing media or polling.
   */
  benchVisible: boolean
  activeRuntimeState: BenchSurfaceHostRuntimeState | undefined
  /**
   * Wraps every instance with the *same* provider component. It must not vary by activity: a
   * different component type at this position makes React rebuild the surface on every switch.
   */
  renderContext: (input: {
    active: boolean
    state: BenchSurfaceHostRuntimeState
    children: ReactNode
  }) => ReactNode
  /** Resolves a target to its surface. The host owns instance lifecycle, not surface resolution. */
  renderSurface: (target: BenchTabTarget) => ReactNode
}) {
  const activeKey = props.activeTarget ? benchTargetKey(props.activeTarget) : null
  // Retention is derived during render rather than in an effect: computing it after commit would
  // render one frame in which the newly active target has no instance yet — an empty flash on the
  // exact switch this host exists to make seamless. It is held in state, not a ref, so a render
  // that React discards (a superseded transition) discards its eviction too. Mutating a shared ref
  // here could evict an instance the committed UI still needs.
  const [cache, setCache] = useState<{
    directory: string
    instances: BenchSurfaceInstance[]
    renderOrder: readonly string[]
  }>(() => ({ directory: props.directory, instances: [], renderOrder: [] }))

  const retainedTargetKeys = new Set(props.retainedTargetKeys)
  // The route becomes observable before the controller commits its matching tab list. Treat the
  // selected route as retained during that gap so render-time cache reconciliation cannot release
  // and immediately recreate the same instance forever.
  if (activeKey) retainedTargetKeys.add(activeKey)
  const releasedKeys = cache.instances
    .filter(
      (instance) => cache.directory !== props.directory || !retainedTargetKeys.has(instance.key),
    )
    .map((instance) => instance.key)
  const releasedForDirectory = releaseBenchSurfaceInstances({
    instances: cache.instances,
    releasedKeys,
  })
  const instances = retainBenchSurfaceInstance({
    instances: releasedForDirectory,
    target: props.activeTarget,
  })
  const renderOrder = retainBenchSurfaceRenderOrder({
    renderOrder: cache.directory === props.directory ? cache.renderOrder : [],
    instances,
  })
  if (
    instances !== cache.instances ||
    renderOrder !== cache.renderOrder ||
    cache.directory !== props.directory
  ) {
    setCache({ directory: props.directory, instances, renderOrder })
  }
  const activeInstance = instances.find((instance) => instance.key === activeKey)
  const instancesByKey = new Map(instances.map((instance) => [instance.key, instance]))

  return (
    <div
      data-component="bench-surface-host"
      data-active-target-key={activeKey ?? "none"}
      data-instance-count={instances.length}
      className="relative h-full min-h-0 w-full min-w-0"
    >
      {renderOrder.map((key) => {
        const instance = instancesByKey.get(key)
        if (!instance) return null
        const active = instance.key === activeKey
        const surface = (
          <BenchSurfaceActivityProvider value={active && props.benchVisible}>
            {props.renderSurface(instance.target)}
          </BenchSurfaceActivityProvider>
        )
        return (
          <div
            key={instance.key}
            data-component="bench-surface-instance"
            data-target-key={instance.key}
            data-surface-active={active ? "true" : "false"}
            aria-hidden={active ? undefined : true}
            {...(active ? {} : { inert: "" })}
            className={
              active
                ? "h-full min-h-0 w-full min-w-0"
                : "pointer-events-none invisible absolute inset-0 h-full w-full"
            }
          >
            {props.renderContext({
              active,
              state:
                active && props.activeRuntimeState
                  ? props.activeRuntimeState
                  : parkedRuntimeState({
                      directory: props.directory,
                      target: instance.target,
                      activeRuntimeState: props.activeRuntimeState,
                    }),
              children: surface,
            })}
          </div>
        )
      })}
      {activeInstance ? null : <div className="h-full min-h-0 w-full min-w-0" />}
    </div>
  )
}

/**
 * A parked surface has no route of its own, so it gets the active layout values with its own
 * target. Nothing it reports can reach the agent — its provider registers nothing.
 */
function parkedRuntimeState(input: {
  directory: string
  target: BenchTabTarget
  activeRuntimeState: BenchSurfaceHostRuntimeState | undefined
}): BenchSurfaceHostRuntimeState {
  const active = input.activeRuntimeState
  return {
    directory: input.directory,
    target: input.target,
    route: "",
    mode: active?.mode ?? "docked",
    layoutProfile: active?.layoutProfile ?? "document",
    floatingRect: active?.floatingRect ?? { x: 0, y: 0, width: 0, height: 0 },
    floatingChatState: active?.floatingChatState ?? "open",
  }
}
