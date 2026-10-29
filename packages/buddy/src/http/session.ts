import { isNotFound } from "@buddy/agent-runtime/errors"
import { getAgentRuntime } from "../runtime/agent-runtime"
import { resolveDirectory } from "../project"
import { parseTJsonObject, parseTString } from "./parse"

type TSessionProjectScope = {
  projectID?: string
  directory?: string
}

function parseTSessionProjectScope<TValue>(value: TValue): TSessionProjectScope | undefined {
  const record = parseTJsonObject(value)
  if (record === undefined) return undefined
  const projectID = parseTString(record.projectID)
  const directory = parseTString(record.directory)
  return Object.assign(
    {},
    projectID !== undefined ? { projectID } : undefined,
    directory !== undefined ? { directory } : undefined,
  )
}

export async function isSessionInRequestedProject<TSession>(
  directory: string,
  session: TSession,
): Promise<boolean> {
  const payload = parseTSessionProjectScope(session)
  if (payload === undefined) return false

  const sessionDirectory =
    payload.directory !== undefined ? resolveDirectory(payload.directory) : undefined
  const requestedDirectory = resolveDirectory(directory)
  if (sessionDirectory && sessionDirectory === requestedDirectory) {
    return true
  }

  const runtime = await getAgentRuntime()
  if (!sessionDirectory) return false
  const [requestedLocation, owningLocation] = await Promise.all([
    runtime.workspace.location(requestedDirectory),
    runtime.workspace.location(sessionDirectory).catch((cause: unknown) => {
      if (isNotFound(cause, "location")) return undefined
      throw cause
    }),
  ])
  if (!owningLocation) return false
  return (
    resolveDirectory(requestedLocation.project.canonical) ===
    resolveDirectory(owningLocation.project.canonical)
  )
}
