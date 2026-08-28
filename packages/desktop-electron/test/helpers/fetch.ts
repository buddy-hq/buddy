type TestFetchHandler = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export function createTestFetch(handler: TestFetchHandler): typeof fetch {
  return Object.assign(handler, {
    preconnect: (_url: string | URL): void => undefined,
  })
}
