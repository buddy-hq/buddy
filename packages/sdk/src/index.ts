export * from "./gen/types.gen.js"

import { createClient } from "./gen/client/index.js"
import type { Config } from "./gen/client/types.gen.js"
import { BuddyClient } from "./gen/sdk.gen.js"

export { BuddyClient }
export type { Config as BuddyClientConfig }

function hasNonAscii(value: string) {
  return Array.from(value).some((character) => (character.codePointAt(0) ?? 0) > 0x7f)
}

export function createBuddyClient(config?: Config & { directory?: string }): BuddyClient {
  const { directory, ...rest } = config ?? {}

  let headers = rest.headers
  if (directory) {
    const isNonASCII = hasNonAscii(directory)
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
    fetch: rest.fetch ?? ((request, init) => globalThis.fetch(request, init)),
  })
  return new BuddyClient({ client })
}
