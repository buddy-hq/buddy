import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
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
  if (payload === undefined) return true

  const sessionDirectory =
    payload.directory !== undefined ? resolveDirectory(payload.directory) : undefined
  const requestedDirectory = resolveDirectory(directory)
  if (sessionDirectory && sessionDirectory === requestedDirectory) {
    return true
  }

  const requestedProjectID = await OpenCodeInstance.provide({
    directory,
    fn: () => OpenCodeInstance.project.id,
  })

  const sessionProjectID =
    payload.projectID !== undefined
      ? payload.projectID
      : payload.directory !== undefined
        ? await OpenCodeInstance.provide({
            directory: payload.directory,
            fn: () => OpenCodeInstance.project.id,
          })
        : undefined

  if (!sessionProjectID) return true
  return sessionProjectID === requestedProjectID
}
