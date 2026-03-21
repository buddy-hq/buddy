import {
  applyAuthToUrl,
  authorizationHeader,
  createServerFetchTransport,
  resolveServerApiBaseUrl,
  resolveServerEndpoint,
} from "./server-client"

export function directoryHeaderValue(directory: string) {
  const isNonASCII = /[^\x00-\x7F]/.test(directory)
  return isNonASCII ? encodeURIComponent(directory) : directory
}

export function stringifyError(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === "string") {
    return error
  }
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

export function resolveApiUrl(endpoint: string) {
  const resolved = resolveServerEndpoint(endpoint)
  const url = new URL(resolved, window.location.origin)
  applyAuthToUrl(url)
  return url.toString()
}

export function createEventStreamUrl(endpoint: string) {
  return resolveApiUrl(endpoint)
}

export async function apiFetch(
  endpoint: string,
  init?: {
    method?: string
    directory?: string
    body?: unknown
    headers?: HeadersInit
    signal?: AbortSignal
  },
) {
  const headers = new Headers(init?.headers)
  const body = init?.body === undefined ? undefined : JSON.stringify(init.body)

  if (body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json")
  }

  if (init?.directory) {
    headers.set("x-buddy-directory", directoryHeaderValue(init.directory))
  }

  const auth = authorizationHeader()
  if (auth && !headers.has("authorization")) {
    headers.set("authorization", auth)
  }

  const transport = createServerFetchTransport(resolveServerApiBaseUrl())

  return transport(resolveServerEndpoint(endpoint), {
    method: init?.method,
    headers,
    body,
    signal: init?.signal,
  })
}

export async function requestJson<T>(
  directory: string,
  endpoint: string,
  init?: {
    method?: string
    body?: unknown
  },
) {
  const response = await apiFetch(endpoint, {
    method: init?.method,
    directory,
    body: init?.body,
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => undefined)
    const message = readApiErrorMessage(payload, response.status)
    throw new Error(message)
  }

  return (await response.json()) as T
}

function readApiErrorMessage(payload: unknown, status: number) {
  if (typeof payload === "string" && payload.trim().length > 0) {
    return payload
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return `Request failed (${status})`
  }

  const candidate = payload as {
    error?: unknown
    message?: unknown
    issues?: unknown
  }

  if (typeof candidate.error === "string" && candidate.error.trim().length > 0) {
    return candidate.error
  }
  if (typeof candidate.message === "string" && candidate.message.trim().length > 0) {
    return candidate.message
  }

  if (candidate.error && typeof candidate.error === "object" && !Array.isArray(candidate.error)) {
    const nested = candidate.error as { message?: unknown; issues?: unknown }
    if (typeof nested.message === "string" && nested.message.trim().length > 0) {
      return nested.message
    }
    if (Array.isArray(nested.issues) && nested.issues.length > 0) {
      return stringifyError(nested.issues[0])
    }
  }

  if (Array.isArray(candidate.issues) && candidate.issues.length > 0) {
    return stringifyError(candidate.issues[0])
  }

  return stringifyError(payload)
}
