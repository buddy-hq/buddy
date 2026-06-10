import { createOpencodeClient } from "@opencode-ai/sdk/client"
import { createOpencodeClient as createOpencodeV2Client } from "@opencode-ai/sdk/v2/client"
import { createBuddyOpenCodeClient, type BuddyOpenCodeClient } from "./client-adapter"
import { fetchOpenCodeApp, readOpenCodeRequestDirectory } from "./fetch-with-overlay"

let clientPromise: Promise<BuddyOpenCodeClient> | undefined

function openCodeAuthHeaders(): Record<string, string> | undefined {
  if (!process.env.OPENCODE_SERVER_PASSWORD) return undefined

  const username = process.env.OPENCODE_SERVER_USERNAME ?? "opencode"
  const token = Buffer.from(`${username}:${process.env.OPENCODE_SERVER_PASSWORD}`).toString(
    "base64",
  )
  return {
    authorization: `Basic ${token}`,
  }
}

async function createInProcessClient(directory?: string) {
  const runtimeFetch = (async (request: Request) =>
    fetchOpenCodeApp(request, readOpenCodeRequestDirectory(request) ?? directory)) as typeof fetch
  const rawClient = createOpencodeClient({
    baseUrl: "http://localhost:4096",
    ...(directory ? { directory } : {}),
    headers: openCodeAuthHeaders(),
    fetch: runtimeFetch,
  })
  const rawV2Client = createOpencodeV2Client({
    baseUrl: "http://localhost:4096",
    ...(directory ? { directory } : {}),
    headers: openCodeAuthHeaders(),
    fetch: runtimeFetch,
  })

  return createBuddyOpenCodeClient(rawClient, rawV2Client)
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

export type { BuddyOpenCodeClient }
