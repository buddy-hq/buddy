import { describe, expect, test } from "bun:test"
import {
  runWithConcurrency,
  selectTestShardItems,
  TEST_CONCURRENCY_ENVIRONMENT_KEY,
  TEST_SHARD_COUNT_ENVIRONMENT_KEY,
  TEST_SHARD_INDEX_ENVIRONMENT_KEY,
  testConcurrency,
  testShard,
  testShardForExplicitSelection,
} from "./test-concurrency"

type Deferred = {
  readonly promise: Promise<void>
  readonly resolve: () => void
}

function deferred(): Deferred {
  let resolvePromise: (() => void) | undefined
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve
  })
  if (resolvePromise === undefined) throw new Error("Deferred resolver was not initialized")
  return { promise, resolve: resolvePromise }
}

describe("test concurrency", () => {
  test("runs no more than the configured number of entries and preserves result order", async () => {
    const releases = [deferred(), deferred(), deferred(), deferred()]
    const starts = [deferred(), deferred(), deferred(), deferred()]
    const started: number[] = []
    let active = 0
    let maximumActive = 0

    const runPromise = runWithConcurrency({
      concurrency: 2,
      items: [0, 1, 2, 3],
      run: async (item) => {
        active += 1
        maximumActive = Math.max(maximumActive, active)
        started.push(item)
        starts[item]?.resolve()
        await releases[item]?.promise
        active -= 1
        return `result-${item}`
      },
    })

    await Promise.all([starts[0]?.promise, starts[1]?.promise])
    expect(started).toEqual([0, 1])

    releases[1]?.resolve()
    await starts[2]?.promise
    releases[2]?.resolve()
    await starts[3]?.promise
    releases[3]?.resolve()
    releases[0]?.resolve()

    expect(await runPromise).toEqual(["result-0", "result-1", "result-2", "result-3"])
    expect(maximumActive).toBe(2)
  })

  test("does not schedule new entries after a stop result", async () => {
    const started: number[] = []
    const results = await runWithConcurrency({
      concurrency: 1,
      items: [0, 1, 2],
      run: async (item) => {
        started.push(item)
        return { item, stop: item === 1 }
      },
      shouldStop: (result) => result.stop,
    })

    expect(started).toEqual([0, 1])
    expect(results).toEqual([
      { item: 0, stop: false },
      { item: 1, stop: true },
    ])
  })

  test("aborts in-flight entries when a concurrent entry requests a stop", async () => {
    const firstStarted = deferred()
    const secondStarted = deferred()
    const releaseStop = deferred()
    const started: number[] = []

    const runPromise = runWithConcurrency({
      concurrency: 2,
      items: [0, 1, 2],
      run: async (item, _index, signal) => {
        started.push(item)
        if (item === 0) {
          firstStarted.resolve()
          await releaseStop.promise
          return { aborted: false, item, stop: true }
        }

        secondStarted.resolve()
        await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve()))
        return { aborted: signal.aborted, item, stop: false }
      },
      shouldStop: (result) => result.stop,
    })

    await Promise.all([firstStarted.promise, secondStarted.promise])
    releaseStop.resolve()

    expect(await runPromise).toEqual([
      { aborted: false, item: 0, stop: true },
      { aborted: true, item: 1, stop: false },
    ])
    expect(started).toEqual([0, 1])
  })

  test("reads and validates an explicit concurrency override", () => {
    expect(testConcurrency({ [TEST_CONCURRENCY_ENVIRONMENT_KEY]: "3" })).toBe(3)
    expect(() => testConcurrency({ [TEST_CONCURRENCY_ENVIRONMENT_KEY]: "0" })).toThrow(
      "must be a positive integer",
    )
    expect(() => testConcurrency({ [TEST_CONCURRENCY_ENVIRONMENT_KEY]: "many" })).toThrow(
      "must be a positive integer",
    )
  })

  test("partitions deterministic test plans across configured shards", () => {
    const items = ["a", "b", "c", "d", "e"]
    const firstShard = testShard({
      [TEST_SHARD_COUNT_ENVIRONMENT_KEY]: "2",
      [TEST_SHARD_INDEX_ENVIRONMENT_KEY]: "0",
    })
    const secondShard = testShard({
      [TEST_SHARD_COUNT_ENVIRONMENT_KEY]: "2",
      [TEST_SHARD_INDEX_ENVIRONMENT_KEY]: "1",
    })

    expect(selectTestShardItems(items, firstShard)).toEqual(["a", "c", "e"])
    expect(selectTestShardItems(items, secondShard)).toEqual(["b", "d"])
  })

  test("validates complete and nonempty test shard configuration", () => {
    expect(testShard({})).toEqual({ count: 1, index: 0 })
    expect(() =>
      testShard({
        [TEST_SHARD_COUNT_ENVIRONMENT_KEY]: "2",
      }),
    ).toThrow("must be configured together")
    expect(() =>
      testShard({
        [TEST_SHARD_COUNT_ENVIRONMENT_KEY]: "2",
        [TEST_SHARD_INDEX_ENVIRONMENT_KEY]: "2",
      }),
    ).toThrow("must be an integer from 0 through 1")
    expect(() => selectTestShardItems(["only"], { count: 2, index: 1 })).toThrow(
      "received no work",
    )
  })

  test("disables sharding for an explicit file selection", () => {
    const configuredShard = { count: 2, index: 1 }

    expect(testShardForExplicitSelection(configuredShard, false)).toBe(configuredShard)
    expect(testShardForExplicitSelection(configuredShard, true)).toEqual({ count: 1, index: 0 })
  })
})
