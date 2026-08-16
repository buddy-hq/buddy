type TRetryOptions = {
  attempts?: number
  delay?: number
  factor?: number
  maxDelay?: number
  retryIf?: (error: Error) => boolean
}

const TRANSIENT_MESSAGES = [
  "load failed",
  "network connection was lost",
  "network request failed",
  "failed to fetch",
  "econnreset",
  "econnrefused",
  "etimedout",
  "socket hang up",
]

function isTransientError(error: Error): boolean {
  const message = error.message.toLowerCase()
  return TRANSIENT_MESSAGES.some((m) => message.includes(m))
}

function toError(error: Error | string | number | boolean | null | undefined): Error {
  if (error instanceof Error) return error
  return new Error(`${error}`)
}

export async function retry<TResult>(
  fn: () => Promise<TResult>,
  options: TRetryOptions = {},
): Promise<TResult> {
  const {
    attempts = 3,
    delay = 500,
    factor = 2,
    maxDelay = 10000,
    retryIf = isTransientError,
  } = options

  let lastError: Error | undefined
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      const failure = toError(error instanceof Error ? error : `${error}`)
      lastError = failure
      if (attempt === attempts - 1 || !retryIf(failure)) throw error
      const wait = Math.min(delay * Math.pow(factor, attempt), maxDelay)
      await new Promise((resolve) => setTimeout(resolve, wait))
    }
  }
  throw lastError
}

export type { TRetryOptions as RetryOptions }
