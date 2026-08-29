import { availableParallelism } from "node:os"

export const TEST_CONCURRENCY_ENVIRONMENT_KEY = "BUDDY_TEST_CONCURRENCY"
export const TEST_SHARD_COUNT_ENVIRONMENT_KEY = "BUDDY_TEST_SHARD_COUNT"
export const TEST_SHARD_INDEX_ENVIRONMENT_KEY = "BUDDY_TEST_SHARD_INDEX"

const DEFAULT_MAXIMUM_TEST_CONCURRENCY = 4
const DEFAULT_TEST_SHARD_COUNT = 1
const DEFAULT_TEST_SHARD_INDEX = 0
const MINIMUM_TEST_CONCURRENCY = 1
const MINIMUM_TEST_SHARD_COUNT = 1

export type TestShard = {
  readonly count: number
  readonly index: number
}

export type ConcurrentRunOptions<TItem, TResult> = {
  readonly concurrency: number
  readonly items: readonly TItem[]
  readonly run: (item: TItem, index: number, signal: AbortSignal) => Promise<TResult>
  readonly shouldStop?: (result: TResult) => boolean
}

export function testConcurrency(environment: Readonly<NodeJS.ProcessEnv> = process.env): number {
  const configuredValue = environment[TEST_CONCURRENCY_ENVIRONMENT_KEY]?.trim()
  if (configuredValue === undefined || configuredValue.length === 0) {
    return Math.max(
      MINIMUM_TEST_CONCURRENCY,
      Math.min(availableParallelism(), DEFAULT_MAXIMUM_TEST_CONCURRENCY),
    )
  }

  const configuredConcurrency = Number(configuredValue)
  if (
    !Number.isSafeInteger(configuredConcurrency) ||
    configuredConcurrency < MINIMUM_TEST_CONCURRENCY
  ) {
    throw new Error(
      `${TEST_CONCURRENCY_ENVIRONMENT_KEY} must be a positive integer; received ${configuredValue}`,
    )
  }
  return configuredConcurrency
}

export function testShard(environment: Readonly<NodeJS.ProcessEnv> = process.env): TestShard {
  const configuredCount = environment[TEST_SHARD_COUNT_ENVIRONMENT_KEY]?.trim()
  const configuredIndex = environment[TEST_SHARD_INDEX_ENVIRONMENT_KEY]?.trim()
  if (configuredCount === undefined && configuredIndex === undefined) {
    return { count: DEFAULT_TEST_SHARD_COUNT, index: DEFAULT_TEST_SHARD_INDEX }
  }
  if (!configuredCount || !configuredIndex) {
    throw new Error(
      `${TEST_SHARD_COUNT_ENVIRONMENT_KEY} and ${TEST_SHARD_INDEX_ENVIRONMENT_KEY} must be configured together`,
    )
  }

  const count = Number(configuredCount)
  const index = Number(configuredIndex)
  if (!Number.isSafeInteger(count) || count < MINIMUM_TEST_SHARD_COUNT) {
    throw new Error(
      `${TEST_SHARD_COUNT_ENVIRONMENT_KEY} must be a positive integer; received ${configuredCount}`,
    )
  }
  if (!Number.isSafeInteger(index) || index < DEFAULT_TEST_SHARD_INDEX || index >= count) {
    throw new Error(
      `${TEST_SHARD_INDEX_ENVIRONMENT_KEY} must be an integer from 0 through ${count - 1}; received ${configuredIndex}`,
    )
  }
  return { count, index }
}

export function selectTestShardItems<TItem>(
  items: readonly TItem[],
  shard: TestShard,
): readonly TItem[] {
  const selected = items.filter((_item, index) => index % shard.count === shard.index)
  if (selected.length === 0) {
    throw new Error(`Test shard ${shard.index + 1} of ${shard.count} received no work`)
  }
  return selected
}

export function testShardForExplicitSelection(
  configuredShard: TestShard,
  hasExplicitSelection: boolean,
): TestShard {
  if (!hasExplicitSelection) return configuredShard
  return { count: DEFAULT_TEST_SHARD_COUNT, index: DEFAULT_TEST_SHARD_INDEX }
}

export async function runWithConcurrency<TItem, TResult>(
  options: ConcurrentRunOptions<TItem, TResult>,
): Promise<readonly TResult[]> {
  if (!Number.isSafeInteger(options.concurrency) || options.concurrency < MINIMUM_TEST_CONCURRENCY) {
    throw new Error(`Test concurrency must be a positive integer; received ${options.concurrency}`)
  }
  if (options.items.length === 0) return []

  const results: Array<{ readonly value: TResult } | undefined> = Array.from({
    length: options.items.length,
  })
  const errors: unknown[] = []
  const workerCount = Math.min(options.concurrency, options.items.length)
  const abortController = new AbortController()
  let nextIndex = 0
  let stopped = false

  async function runWorker(): Promise<void> {
    while (!stopped) {
      const index = nextIndex
      if (index >= options.items.length) return
      nextIndex += 1

      const item = options.items[index]
      if (item === undefined) throw new Error(`Concurrent test item disappeared at index ${index}`)

      try {
        const result = await options.run(item, index, abortController.signal)
        results[index] = { value: result }
        if (options.shouldStop?.(result) === true) {
          stopped = true
          abortController.abort()
        }
      } catch (error) {
        errors.push(error)
        stopped = true
        abortController.abort()
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, runWorker))
  if (errors.length > 0) throw errors[0]

  return results.flatMap((result) => (result === undefined ? [] : [result.value]))
}
