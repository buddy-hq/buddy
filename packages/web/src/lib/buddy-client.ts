import { createBuddyClient } from '@buddy/sdk'
import {
  authorizationHeader,
  createServerFetchTransport,
  resolveServerApiBaseUrl,
} from './server-client'

export function getBuddyClient(directory?: string) {
  const auth = authorizationHeader()
  const baseUrl = resolveServerApiBaseUrl()
  const transport = createServerFetchTransport(baseUrl)

  return createBuddyClient({
    baseUrl,
    directory,
    headers: auth
      ? {
          authorization: auth,
        }
      : undefined,
    fetch: transport,
  })
}

type BuddyResult<T> = {
  data: T | undefined
  error: unknown
  response: Response
}

function hasMessage(value: unknown): value is { message?: unknown } {
  return Boolean(value && typeof value === 'object')
}

function hasError(value: unknown): value is { error?: unknown } {
  return Boolean(value && typeof value === 'object')
}

function errorMessage(value: unknown): string | undefined {
  if (typeof value === 'string' && value) return value
  if (hasError(value)) {
    const nested = errorMessage(value.error)
    if (nested) return nested
  }
  if (hasMessage(value) && typeof value.message === 'string' && value.message) {
    return value.message
  }
  return undefined
}

export function requireBuddyData<T>(result: BuddyResult<T>): T {
  if (!result.response.ok || result.error !== undefined) {
    throw new Error(errorMessage(result.error) ?? `Request failed (${result.response.status})`)
  }
  if (result.data === undefined) {
    throw new Error(`Request failed (${result.response.status})`)
  }
  return result.data
}

export function buddyResultMessage(result: { error: unknown; response: Response }) {
  return errorMessage(result.error) ?? `Request failed (${result.response.status})`
}
