import { availableParallelism } from "node:os"

export const TEST_CONCURRENCY_ENVIRONMENT_KEY = "BUDDY_TEST_CONCURRENCY"

const DEFAULT_MAXIMUM_TEST_CONCURRENCY = 4
const MINIMUM_TEST_CONCURRENCY = 1

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
