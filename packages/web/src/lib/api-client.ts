import { getPlatform } from "../context/platform"
import { getServerConnection } from "../context/server"

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

function getBaseUrl() {
  return getServerConnection().url
}

function resolveEndpoint(endpoint: string) {
  if (/^https?:\/\//.test(endpoint)) return endpoint

  const baseUrl = getBaseUrl()
  if (!baseUrl) return endpoint
  return `${baseUrl}${endpoint}`
}

function applyAuth(url: URL) {
  const server = getServerConnection()
  if (!server.username || !server.password) return
  url.username = server.username
  url.password = server.password
}

export function resolveApiUrl(endpoint: string) {
  const resolved = resolveEndpoint(endpoint)
  const url = new URL(resolved, window.location.origin)
  applyAuth(url)
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

  const server = getServerConnection()
  if (server.username && server.password && !headers.has("authorization")) {
    headers.set("authorization", `Basic ${btoa(`${server.username}:${server.password}`)}`)
  }

  const transport = getPlatform().fetch ?? fetch

  return transport(resolveEndpoint(endpoint), {
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
