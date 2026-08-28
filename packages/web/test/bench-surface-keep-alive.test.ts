import { describe, expect, test } from "bun:test"
import { benchTargetKey, type BenchObjectKind, type BenchTarget } from "../src/lib/bench-navigation"
import {
  BENCH_SURFACE_COST_HEAVY,
  BENCH_SURFACE_COST_LIGHT,
  BENCH_SURFACE_COST_READER,
  BENCH_SURFACE_COST_BROWSER,
  benchSurfaceCostClass,
  releaseBenchSurfaceInstances,
  retainBenchSurfaceInstance,
  type BenchSurfaceInstance,
} from "../src/lib/bench-surface-keep-alive"

function fileTarget(path: string): BenchTarget {
  return { type: "workspace-file", path, viewer: "markdown" }
}

function objectTarget(kind: BenchObjectKind): BenchTarget {
  return {
    type: "object",
    ref: { kind, objectID: `${kind}-object`, revisionID: null, itemID: null },
    viewID: "canvas",
  }
}

function whiteboardTarget(objectID: string): BenchTarget {
  return {
    type: "object",
    ref: { kind: "whiteboard", objectID, revisionID: null, itemID: null },
    viewID: "canvas",
  }
}

function browserTarget(tabID: string): BenchTarget {
  return { type: "browser", tabID, url: `https://example.com/${tabID}` }
}

function retainAll(targets: BenchTarget[]): BenchSurfaceInstance[] {
  return targets.reduce<BenchSurfaceInstance[]>(
    (instances, target) => retainBenchSurfaceInstance({ instances, target }),
    [],
  )
}

describe("bench surface keep-alive", () => {
  test("classifies readers separately from bounded heavy and light surfaces", () => {
    expect(benchSurfaceCostClass(whiteboardTarget("board-1"))).toBe(BENCH_SURFACE_COST_HEAVY)
    expect(benchSurfaceCostClass(objectTarget("html-widget"))).toBe(BENCH_SURFACE_COST_HEAVY)
    expect(benchSurfaceCostClass(objectTarget("resource"))).toBe(BENCH_SURFACE_COST_READER)
    expect(benchSurfaceCostClass(fileTarget("docs/intro.md"))).toBe(BENCH_SURFACE_COST_LIGHT)
    expect(benchSurfaceCostClass(objectTarget("question-set"))).toBe(BENCH_SURFACE_COST_LIGHT)
    expect(benchSurfaceCostClass(browserTarget("browser-1"))).toBe(BENCH_SURFACE_COST_BROWSER)
  })

  test("moves a re-activated surface to most-recently-used without remounting it", () => {
    const first = fileTarget("docs/a.md")
    const second = fileTarget("docs/b.md")
    const instances = retainAll([first, second, first])

    expect(instances.map((instance) => instance.key)).toEqual([
      benchTargetKey(second),
      benchTargetKey(first),
    ])
  })

  test("preserves cache identity when the active target is already most recent", () => {
    const target = fileTarget("docs/a.md")
    const instances = retainAll([target])

    expect(retainBenchSurfaceInstance({ instances, target })).toBe(instances)
  })

  test("bounds each cost class independently and never evicts the active surface", () => {
    const boards = ["b1", "b2", "b3", "b4", "b5"].map(whiteboardTarget)
    const instances = retainAll(boards)

    expect(instances).toHaveLength(4)
    expect(instances.at(-1)?.key).toBe(benchTargetKey(boards[4] ?? boards[0]))
    expect(
      instances.every((instance) => instance.costClass === BENCH_SURFACE_COST_HEAVY),
    ).toBeTrue()
  })

  test("a run of cheap surfaces does not evict a kept heavy surface", () => {
    const board = whiteboardTarget("board-1")
    const instances = retainAll([
      board,
      fileTarget("docs/a.md"),
      fileTarget("docs/b.md"),
      fileTarget("docs/c.md"),
      fileTarget("docs/d.md"),
    ])

    expect(instances.some((instance) => instance.key === benchTargetKey(board))).toBeTrue()
  })

  test("keeps every open reader mounted until its tab is released", () => {
    const readers = ["book-1", "book-2", "book-3", "book-4", "book-5"].map(
      (objectID): BenchTarget => ({
        type: "object",
        ref: { kind: "resource", objectID, revisionID: null, itemID: null },
        viewID: "reader",
      }),
    )
    const instances = retainAll(readers)

    expect(instances.map((instance) => instance.key)).toEqual(readers.map(benchTargetKey))
    expect(
      instances.every((instance) => instance.costClass === BENCH_SURFACE_COST_READER),
    ).toBeTrue()
  })

  test("keeps every open Browser tab mounted beyond the light-surface budget", () => {
    const browsers = Array.from({ length: 12 }, (_, index) => browserTarget(`browser-${index}`))
    const instances = retainAll(browsers)

    expect(instances.map((instance) => instance.key)).toEqual(browsers.map(benchTargetKey))
    expect(
      instances.every((instance) => instance.costClass === BENCH_SURFACE_COST_BROWSER),
    ).toBeTrue()
  })

  test("a closed workspace keeps its instances so reopening reveals them", () => {
    const target = fileTarget("docs/a.md")
    const instances = retainBenchSurfaceInstance({ instances: retainAll([target]), target: null })

    expect(instances.map((instance) => instance.key)).toEqual([benchTargetKey(target)])
  })

  test("releases named instances", () => {
    const first = fileTarget("docs/a.md")
    const second = fileTarget("docs/b.md")
    const instances = releaseBenchSurfaceInstances({
      instances: retainAll([first, second]),
      releasedKeys: [benchTargetKey(first)],
    })

    expect(instances.map((instance) => instance.key)).toEqual([benchTargetKey(second)])
  })
})
