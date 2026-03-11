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
    const payload = (await response.json().catch(() => undefined)) as
      | { error?: string; message?: string }
      | undefined
    const message = payload?.error ?? payload?.message ?? `Request failed (${response.status})`
    throw new Error(message)
  }

  return (await response.json()) as T
}
