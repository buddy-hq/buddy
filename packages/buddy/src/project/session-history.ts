import fs from "node:fs/promises"
import path from "node:path"
import { getAgentRuntime } from "../runtime/agent-runtime"

async function canonicalDirectory(directory: string): Promise<string> {
  return fs.realpath(directory).catch(() => path.resolve(directory))
}

export async function readSessionInDirectory(directory: string, sessionID: string) {
  const session = await (await getAgentRuntime()).conversations.get(sessionID)
  const [expected, actual] = await Promise.all([
    canonicalDirectory(directory),
    canonicalDirectory(session.directory),
  ])
  return expected === actual ? session : undefined
}

export async function readSessionMessages(directory: string, sessionID: string) {
  if (!(await readSessionInDirectory(directory, sessionID))) {
    throw new Error("Session does not belong to this notebook")
  }
  return (await (await getAgentRuntime()).conversations.history({ directory, sessionID })).items
}

export async function listDirectorySessions(directory: string) {
  return (await getAgentRuntime()).conversations.list({ directory })
}
