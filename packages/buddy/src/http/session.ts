import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { resolveDirectory } from "../project"

export async function isSessionInRequestedProject(
  directory: string,
  session: unknown,
): Promise<boolean> {
  if (!session || typeof session !== "object") return true
  const payload = session as {
    projectID?: unknown
    directory?: unknown
  }

  const sessionDirectory =
    typeof payload.directory === "string" ? resolveDirectory(payload.directory) : undefined
  const requestedDirectory = resolveDirectory(directory)
  if (sessionDirectory && sessionDirectory === requestedDirectory) {
    return true
  }

  const requestedProjectID = await OpenCodeInstance.provide({
    directory,
    fn: () => OpenCodeInstance.project.id,
  })

  const sessionProjectID =
    typeof payload.projectID === "string"
      ? payload.projectID
      : typeof payload.directory === "string"
        ? await OpenCodeInstance.provide({
            directory: payload.directory,
            fn: () => OpenCodeInstance.project.id,
          })
        : undefined

  if (!sessionProjectID) return true
  return sessionProjectID === requestedProjectID
}
