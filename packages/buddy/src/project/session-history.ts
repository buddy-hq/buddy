import fs from "node:fs/promises"
import path from "node:path"
import type { OpenCodeHost, OpenCodeTypes, SessionMessageInfo } from "@buddy/opencode-adapter/host"

async function canonicalDirectory(directory: string): Promise<string> {
  return fs.realpath(directory).catch(() => path.resolve(directory))
}

export async function readSessionInDirectory(client: OpenCodeHost, directory: string, sessionID: string) {
  const session = await client.session.get({ sessionID })
  const [expected, actual] = await Promise.all([
    canonicalDirectory(directory),
    canonicalDirectory(session.location.directory),
  ])
  return expected === actual ? session : undefined
}

export async function readSessionMessages(client: OpenCodeHost, directory: string, sessionID: string): Promise<SessionMessageInfo[]> {
  if (!(await readSessionInDirectory(client, directory, sessionID))) {
    throw new Error("Session does not belong to this notebook")
  }
  const messages: SessionMessageInfo[] = []
  let cursor: string | undefined
  do {
    const page = await client.message.list({ sessionID, limit: 200, ...(cursor ? { cursor } : { order: "asc" }) })
    messages.push(...page.data)
    cursor = page.cursor.next ?? undefined
  } while (cursor)
  return messages
}

export async function listDirectorySessions(client: OpenCodeHost, directory: string): Promise<OpenCodeTypes.SessionInfo[]> {
  const sessions: OpenCodeTypes.SessionInfo[] = []
  let cursor: string | undefined
  do {
    const page = await client.session.list({ directory, limit: 200, ...(cursor ? { cursor } : { order: "desc" }) })
    sessions.push(...page.data)
    cursor = page.cursor.next ?? undefined
  } while (cursor)
  return sessions
}
