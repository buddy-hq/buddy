export * from "./gen/types.gen.js"

import { createClient } from "./gen/client/index.js"
import type { Config } from "./gen/client/types.gen.js"
import { BuddyClient } from "./gen/sdk.gen.js"

export { BuddyClient }
export type { Config as BuddyClientConfig }

export function createBuddyClient(config?: Config & { directory?: string }): BuddyClient {
  const { directory, ...rest } = config ?? {}
  const customFetch: typeof fetch = ((request: RequestInfo | URL, init?: RequestInit) =>
    fetch(request, init)) as typeof fetch

  let headers = rest.headers
  if (directory) {
    const isNonASCII = /[^\x00-\x7F]/.test(directory)
    const encodedDirectory = isNonASCII ? encodeURIComponent(directory) : directory
    headers = {
      ...headers,
      "x-buddy-directory": encodedDirectory,
    }
  }

  const client = createClient({
    baseUrl: "/api",
    ...rest,
    headers,
    fetch: rest.fetch ?? customFetch,
  })
  return new BuddyClient({ client })
}
