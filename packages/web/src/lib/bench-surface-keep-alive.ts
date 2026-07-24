import {
  benchTargetKey,
  isSameBenchTarget,
  type BenchTarget,
} from "@/lib/bench-navigation"

/**
 * Bounded keep-alive policy for mounted Bench surfaces.
 *
 * A mounted surface is not free: whiteboards hold a canvas, HTML widgets hold a live browsing
 * context, readers hold a rendered document. The cache is therefore bounded per cost class rather
 * than by a single global count, so one expensive surface cannot evict every cheap one and a run of
 * cheap surfaces cannot accumulate expensive ones.
 *
 * Eviction is safe only because evicted surfaces restore their meaningful state from durable
 * per-target UI state; keep-alive is the fast path, not the correctness guarantee.
 */

export const BENCH_SURFACE_COST_HEAVY = "heavy"
export const BENCH_SURFACE_COST_LIGHT = "light"

export type BenchSurfaceCostClass =
  | typeof BENCH_SURFACE_COST_HEAVY
  | typeof BENCH_SURFACE_COST_LIGHT

/** One whiteboard or widget beyond the active one is enough to make a return feel instant. */
export const BENCH_SURFACE_KEEP_ALIVE_LIMIT: Record<BenchSurfaceCostClass, number> = {
  [BENCH_SURFACE_COST_HEAVY]: 2,
  [BENCH_SURFACE_COST_LIGHT]: 4,
}

const HEAVY_OBJECT_KINDS = new Set([
  "whiteboard",
  "html-widget",
  "media-presentation",
  "resource",
])

export type BenchSurfaceInstance = {
  key: string
  target: BenchTarget
  costClass: BenchSurfaceCostClass
}

export function benchSurfaceCostClass(target: BenchTarget): BenchSurfaceCostClass {
  if (target.type === "object") {
    return HEAVY_OBJECT_KINDS.has(target.ref.kind)
      ? BENCH_SURFACE_COST_HEAVY
      : BENCH_SURFACE_COST_LIGHT
  }
  return BENCH_SURFACE_COST_LIGHT
}

/**
 * Returns the next instance list with `target` active and most-recently-used last. The active
 * instance is never evicted, and eviction only ever drops the least recently used entry of the
 * same cost class.
 */
export function retainBenchSurfaceInstance(input: {
  instances: BenchSurfaceInstance[]
  target: BenchTarget | null
  limits?: Record<BenchSurfaceCostClass, number>
}): BenchSurfaceInstance[] {
  const limits = input.limits ?? BENCH_SURFACE_KEEP_ALIVE_LIMIT
  if (!input.target) return input.instances

  const key = benchTargetKey(input.target)
  const costClass = benchSurfaceCostClass(input.target)
  const existingIndex = input.instances.findIndex((instance) => instance.key === key)
  const existing = input.instances[existingIndex]
  const alreadyMostRecent =
    existingIndex === input.instances.length - 1 &&
    existing?.costClass === costClass &&
    isSameBenchTarget(existing.target, input.target)
  const withinLimits = (
    [BENCH_SURFACE_COST_HEAVY, BENCH_SURFACE_COST_LIGHT] as const
  ).every(
    (candidateCostClass) =>
      input.instances.filter((instance) => instance.costClass === candidateCostClass).length <=
      limits[candidateCostClass],
  )
  if (alreadyMostRecent && withinLimits) return input.instances

  const withoutTarget = input.instances.filter((instance) => instance.key !== key)
  const retained = [...withoutTarget, { key, target: input.target, costClass }]

  return evictBenchSurfaceInstances({ instances: retained, activeKey: key, limits })
}

export function releaseBenchSurfaceInstances(input: {
  instances: BenchSurfaceInstance[]
  releasedKeys: readonly string[]
}): BenchSurfaceInstance[] {
  if (input.releasedKeys.length === 0) return input.instances
  const released = new Set(input.releasedKeys)
  return input.instances.filter((instance) => !released.has(instance.key))
}

function evictBenchSurfaceInstances(input: {
  instances: BenchSurfaceInstance[]
  activeKey: string
  limits: Record<BenchSurfaceCostClass, number>
}): BenchSurfaceInstance[] {
  const evicted = new Set<string>()
  for (const costClass of [BENCH_SURFACE_COST_HEAVY, BENCH_SURFACE_COST_LIGHT] as const) {
    const ofClass = input.instances.filter((instance) => instance.costClass === costClass)
    const excess = ofClass.length - input.limits[costClass]
    if (excess <= 0) continue
    let remaining = excess
    for (const instance of ofClass) {
      if (remaining === 0) break
      if (instance.key === input.activeKey) continue
      evicted.add(instance.key)
      remaining -= 1
    }
  }
  if (evicted.size === 0) return input.instances
  return input.instances.filter((instance) => !evicted.has(instance.key))
}
