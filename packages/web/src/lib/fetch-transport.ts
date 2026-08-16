export type FetchPreconnectOptions = {
  dns?: boolean
  tcp?: boolean
  http?: boolean
  https?: boolean
}

export type FetchPreconnect = (url: string | URL, options?: FetchPreconnectOptions) => void

export type FetchTransport = typeof fetch & {
  preconnect: FetchPreconnect
}

export type FetchTransportInput = Parameters<typeof fetch>[0]
export type FetchTransportInit = Parameters<typeof fetch>[1]
export type FetchImplementation = (
  input: FetchTransportInput,
  init?: FetchTransportInit,
) => Promise<Response>

type TFetchWithOptionalPreconnect = typeof fetch & {
  preconnect?: FetchPreconnect
}

function getFetchPreconnect(transport: typeof fetch): FetchPreconnect | undefined {
  const source: TFetchWithOptionalPreconnect = transport
  const preconnect = source.preconnect
  if (!preconnect) {
    return undefined
  }

  return (url, options) => {
    preconnect.call(transport, url, options)
  }
}

export function withFetchPreconnect(
  implementation: FetchImplementation,
  source: typeof fetch,
): FetchTransport {
  const preconnect = getFetchPreconnect(source) ?? (() => undefined)
  return Object.assign(implementation, { preconnect })
}
