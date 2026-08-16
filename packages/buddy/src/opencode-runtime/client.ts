import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk/v2/client"
import { OPENCODE_ENV } from "../storage"
import { fetchOpenCodeApp, readOpenCodeRequestDirectory } from "./fetch-with-overlay"

let clientPromise: Promise<OpencodeClient> | undefined

function openCodeAuthHeaders(): Record<string, string> | undefined {
  const password = process.env[OPENCODE_ENV.SERVER_PASSWORD]
  if (!password) return undefined

  const username = process.env[OPENCODE_ENV.SERVER_USERNAME] ?? "opencode"
  const token = Buffer.from(`${username}:${password}`).toString("base64")
  return {
    authorization: `Basic ${token}`,
  }
}

async function createInProcessClient(directory?: string) {
  const runtimeFetch = Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init)
      return fetchOpenCodeApp(request, readOpenCodeRequestDirectory(request) ?? directory)
    },
    { preconnect: fetch.preconnect },
  )
  return createOpencodeClient(
    Object.assign(
      {
        baseUrl: "http://localhost:4096" as const,
        headers: openCodeAuthHeaders(),
        fetch: runtimeFetch,
      },
      directory ? { directory } : undefined,
    ),
  )
}

export async function getOpenCodeClient(directory?: string) {
  if (directory) {
    return getOpenCodeClientForDirectory(directory)
  }

  if (!clientPromise) {
    clientPromise = createInProcessClient()
  }
  return clientPromise
}

/**
 * Get a one-off client scoped to a specific directory.
 * Use for per-request clients where directory changes between calls.
 */
export async function getOpenCodeClientForDirectory(directory: string) {
  return createInProcessClient(directory)
}

export type { OpencodeClient }
