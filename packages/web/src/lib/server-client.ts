import { getPlatform } from '../context/platform'
import { getServerConnection } from '../context/server'

type FetchInput = Parameters<typeof fetch>[0]
type FetchInit = Parameters<typeof fetch>[1]

export function resolveServerApiBaseUrl() {
  const server = getServerConnection()
  if (server.url) {
    return `${server.url.replace(/\/+$/, '')}/api`
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  if (origin && origin !== 'null') {
    return `${origin.replace(/\/+$/, '')}/api`
  }

  return 'http://localhost/api'
}

export function resolveServerEndpoint(endpoint: string) {
  if (/^https?:\/\//.test(endpoint)) return endpoint

  const baseUrl = getServerConnection().url
  if (!baseUrl) return endpoint
  return `${baseUrl}${endpoint}`
}

export function authorizationHeader() {
  const server = getServerConnection()
  if (!server.username || !server.password) return undefined
  return `Basic ${btoa(`${server.username}:${server.password}`)}`
}

export function applyAuthToUrl(url: URL) {
  const server = getServerConnection()
  if (!server.username || !server.password) return
  url.username = server.username
  url.password = server.password
}

function toRelativeUrl(url: string, useRelativeTransportUrls: boolean) {
  if (!useRelativeTransportUrls) return url
  try {
    const parsed = new URL(url)
    if (parsed.origin === 'http://localhost') {
      return `${parsed.pathname}${parsed.search}`
    }
  } catch {
    return url
  }
  return url
}

export function createServerFetchTransport(baseUrl: string) {
  const transport = getPlatform().fetch ?? fetch
  const useRelativeTransportUrls =
    baseUrl === 'http://localhost/api' &&
    typeof window !== 'undefined' &&
    window.location.origin === 'null'

  return async (input: FetchInput, init?: FetchInit) => {
    if (typeof input === 'string') {
      return transport(toRelativeUrl(input, useRelativeTransportUrls), init)
    }
    if (input instanceof URL) {
      return transport(toRelativeUrl(input.toString(), useRelativeTransportUrls), init)
    }
    if (input instanceof Request && useRelativeTransportUrls) {
      const method = input.method.toUpperCase()
      const body = method === 'GET' || method === 'HEAD' ? undefined : await input.clone().text()

      return transport(toRelativeUrl(input.url, true), {
        method,
        headers: input.headers,
        body,
        cache: input.cache,
        credentials: input.credentials,
        integrity: input.integrity,
        keepalive: input.keepalive,
        mode: input.mode,
        redirect: input.redirect,
        referrer: input.referrer,
        referrerPolicy: input.referrerPolicy,
        signal: input.signal,
        ...init,
      })
    }
    return transport(input, init)
  }
}
