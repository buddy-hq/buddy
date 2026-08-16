import { benchTargetKey, isSameBenchTarget, type BenchTabTarget } from "@/lib/bench-navigation"

/**
 * Bounded keep-alive policy for mounted Bench surfaces.
 *
 * A mounted surface is not free: whiteboards hold a canvas, HTML widgets hold a live browsing
 * context, and readers hold a rendered document. Whiteboards/widgets and light surfaces are
 * bounded independently. Readers are different: every open reader tab stays mounted because an
 * eviction visibly reopens the document. Closing a reader tab releases its instance.
 *
 * The instance list is intentionally ordered by recency for eviction. It must not be used as the
 * render order: reordering a mounted iframe moves its DOM node and resets its browsing context.
 * `retainBenchSurfaceRenderOrder` keeps those two responsibilities separate.
 *
 * Eviction is safe only because evicted surfaces restore their meaningful state from durable
 * per-target UI state; keep-alive is the fast path, not the correctness guarantee.
 */

export const BENCH_SURFACE_COST_HEAVY = "heavy"
export const BENCH_SURFACE_COST_LIGHT = "light"
export const BENCH_SURFACE_COST_READER = "reader"

export type BenchSurfaceCostClass =
  | typeof BENCH_SURFACE_COST_HEAVY
  | typeof BENCH_SURFACE_COST_LIGHT
  | typeof BENCH_SURFACE_COST_READER

/** Desktop-sized residency budgets; readers are governed by their open tabs instead. */
export const BENCH_SURFACE_KEEP_ALIVE_LIMIT = {
  [BENCH_SURFACE_COST_HEAVY]: 4,
  [BENCH_SURFACE_COST_LIGHT]: 8,
  [BENCH_SURFACE_COST_READER]: Number.POSITIVE_INFINITY,
} satisfies Record<BenchSurfaceCostClass, number>

const HEAVY_OBJECT_KINDS = new Set(["whiteboard", "html-widget", "media-presentation"])
const BENCH_SURFACE_COST_CLASSES = [
  BENCH_SURFACE_COST_HEAVY,
  BENCH_SURFACE_COST_LIGHT,
  BENCH_SURFACE_COST_READER,
] as const

export type BenchSurfaceInstance = {
  key: string
  target: BenchTabTarget
  costClass: BenchSurfaceCostClass
}

export function benchSurfaceCostClass(target: BenchTabTarget): BenchSurfaceCostClass {
  if (target.type === "object") {
    if (target.ref.kind === "resource") return BENCH_SURFACE_COST_READER
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
  target: BenchTabTarget | null
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
  const withinLimits = BENCH_SURFACE_COST_CLASSES.every(
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

/**
 * Reconciles retained keys without reordering an instance that is already mounted.
 *
 * Keep-alive instances are stored in least-to-most-recently-used order. Rendering that array
 * directly would make React move an existing surface every time it becomes active. That is merely
 * cosmetic for ordinary elements, but moving a custom element that owns an iframe can reset the
 * iframe's browsing context. Existing keys therefore retain their first-mounted DOM position,
 * released keys disappear, and genuinely new keys append.
 */
export function retainBenchSurfaceRenderOrder(input: {
  renderOrder: readonly string[]
  instances: readonly BenchSurfaceInstance[]
}): readonly string[] {
  const retainedKeys = new Set(input.instances.map((instance) => instance.key))
  const nextOrder = input.renderOrder.filter((key) => retainedKeys.has(key))
  const knownKeys = new Set(nextOrder)

  for (const instance of input.instances) {
    if (knownKeys.has(instance.key)) continue
    nextOrder.push(instance.key)
    knownKeys.add(instance.key)
  }

  const unchanged =
    nextOrder.length === input.renderOrder.length &&
    nextOrder.every((key, index) => input.renderOrder[index] === key)
  return unchanged ? input.renderOrder : nextOrder
}

function evictBenchSurfaceInstances(input: {
  instances: BenchSurfaceInstance[]
  activeKey: string
  limits: Record<BenchSurfaceCostClass, number>
}): BenchSurfaceInstance[] {
  const evicted = new Set<string>()
  for (const costClass of BENCH_SURFACE_COST_CLASSES) {
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
