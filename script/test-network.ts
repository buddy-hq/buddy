const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "[::1]", "localhost"])
const NETWORK_PROTOCOLS = new Set(["http:", "https:"])

type FetchInput = Parameters<typeof globalThis.fetch>[0]

function fetchInputUrl(input: FetchInput): string {
  return new Request(input).url
}

export function isTestNetworkUrlAllowed(value: string): boolean {
  const url = new URL(value)
  return !NETWORK_PROTOCOLS.has(url.protocol) || LOOPBACK_HOSTNAMES.has(url.hostname)
}

export function installTestNetworkGuard(): void {
  const unguardedFetch = globalThis.fetch

  const guardedFetch: typeof globalThis.fetch = Object.assign(
    async (input: FetchInput, init?: Parameters<typeof globalThis.fetch>[1]) => {
      const url = fetchInputUrl(input)
      if (!isTestNetworkUrlAllowed(url)) {
        throw new Error(
          `Live network fetch blocked during tests: ${url}. Stub fetch or use a loopback test server.`,
        )
      }

      if (init?.redirect === "manual" || init?.redirect === "error") {
        return unguardedFetch(input, init)
      }

      let request = new Request(input, { ...init, redirect: "manual" })
      for (let redirects = 0; ; redirects += 1) {
        const response = await unguardedFetch(request.clone(), {
          ...init,
          method: request.method,
          body: undefined,
          redirect: "manual",
        })
        const location = response.headers.get("Location")
        if (![301, 302, 303, 307, 308].includes(response.status) || location === null) {
          return response
        }

        const nextUrl = new URL(location, request.url).href
        if (!isTestNetworkUrlAllowed(nextUrl)) {
          throw new Error(
            `Live network fetch blocked during tests: ${nextUrl}. Stub fetch or use a loopback test server.`,
          )
        }
        if (redirects === 20) throw new TypeError("Too many redirects")

        const useGet = response.status === 301 || response.status === 302 || response.status === 303
        request = new Request(nextUrl, {
          ...init,
          method: useGet ? "GET" : request.method,
          body: useGet ? null : request.body,
          headers: request.headers,
          signal: request.signal,
          redirect: "manual",
        })
      }
    },
    { preconnect: unguardedFetch.preconnect },
  )

  globalThis.fetch = guardedFetch
}
