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

      return unguardedFetch(input, init)
    },
    { preconnect: unguardedFetch.preconnect },
  )

  globalThis.fetch = guardedFetch
}
