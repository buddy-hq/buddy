import type { MetadataPatch } from "@buddy/agent-runtime/conversations"
import { upstreamJson } from "./gateway/session"
import type { OpenCodeHost } from "./host"

const metadataUpdates = new Map<string, Promise<void>>()

export async function withSessionMetadataLock<T>(
  sessionID: string,
  run: () => Promise<T>,
): Promise<T> {
  const previous = metadataUpdates.get(sessionID)
  const done = Promise.withResolvers<void>()
  metadataUpdates.set(sessionID, done.promise)
  await previous
  try {
    return await run()
  } finally {
    done.resolve()
    if (metadataUpdates.get(sessionID) === done.promise) metadataUpdates.delete(sessionID)
  }
}

export function patchSessionMetadata(
  session: Pick<OpenCodeHost["session"], "get" | "update">,
  sessionID: string,
  patch: MetadataPatch,
): Promise<void> {
  return withSessionMetadataLock(sessionID, async () => {
    const current = await session.get({ sessionID })
    const metadata = new Map(Object.entries(current.metadata ?? {}))
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) metadata.delete(key)
      else metadata.set(key, upstreamJson(value))
    }
    await session.update({ sessionID, metadata: Object.fromEntries(metadata) })
  })
}
