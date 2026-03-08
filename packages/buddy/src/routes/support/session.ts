import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { safeReadJson } from "../shared/http.js"
import { fetchOpenCode } from "./proxy.js"

export type SessionStatus = {
  type?: "busy" | "idle" | "retry"
}

export type SessionStatusMap = Record<string, SessionStatus>

async function resolveOpenCodeProjectID(directory: string): Promise<string> {
  return OpenCodeInstance.provide({
    directory,
    fn: () => OpenCodeInstance.project.id,
  })
}

export async function loadSessionStatus(
  directory: string,
  request: Request,
): Promise<SessionStatusMap | undefined> {
  const response = await fetchOpenCode({
    directory,
    method: "GET",
    path: "/session/status",
    headers: new Headers(request.headers),
  })

  if (!response.ok) return undefined
  const payload = await safeReadJson(response)
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined
  return payload as SessionStatusMap
}

export async function isSessionInRequestedProject(directory: string, session: unknown): Promise<boolean> {
  if (!session || typeof session !== "object") return true
  const payload = session as {
    projectID?: unknown
    directory?: unknown
  }

  const requestedProjectID = await resolveOpenCodeProjectID(directory)

  const sessionProjectID =
    typeof payload.projectID === "string"
      ? payload.projectID
      : typeof payload.directory === "string"
        ? await resolveOpenCodeProjectID(payload.directory)
        : undefined

  if (!sessionProjectID) return true
  return sessionProjectID === requestedProjectID
}
