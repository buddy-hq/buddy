import { Project as OpenCodeProject } from "@buddy/opencode-adapter/project"
import { isAllowedDirectory, resolveDirectory } from "../../project/directory.js"

const projectUpdateBodySchema = OpenCodeProject.update.schema.omit({ projectID: true })

export const directoryDocumentSchema = {
  type: "object",
  properties: {
    directory: { type: "string" },
  },
  required: ["directory"],
  additionalProperties: false,
}

export function readOpenProjectDirectory(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object" || !("directory" in payload)) {
    return undefined
  }

  const rawDirectory = (payload as { directory?: unknown }).directory
  return typeof rawDirectory === "string" ? rawDirectory : undefined
}

export function parseProjectUpdateBody(payload: unknown) {
  return projectUpdateBodySchema.safeParse(payload)
}

export function projectUpdateErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) return error.message
  if (typeof error === "string") return error
  if (error && typeof error === "object") {
    const directMessage = projectErrorMessage(error)
    if (directMessage) return directMessage
    if ("cause" in error) {
      const causeMessage = projectErrorMessage((error as { cause?: unknown }).cause)
      if (causeMessage) return causeMessage
    }
  }
  return "Invalid project update"
}

function projectErrorMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined
  const value = payload as {
    message?: unknown
    data?: {
      message?: unknown
    }
  }
  if (typeof value.data?.message === "string") return value.data.message
  if (typeof value.message === "string") return value.message
  return undefined
}

/**
 * Handles Error shapes from OpenCode:
 * - Error with `cause` containing `{ data?: { message?: string }, message?: string }`
 * - Error-like payloads with `{ data?: { message?: string }, message?: string }`
 */
function isProjectNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const payload = error as {
    name?: unknown
  }
  if (payload.name === "NotFoundError") return true

  const message = (error instanceof Error ? projectErrorMessage(error.cause) : undefined)
    ?? projectErrorMessage(error)
    ?? ""
  return message.startsWith("Project not found:")
}

export async function openProjectFromPayload(payload: unknown): Promise<
  | {
      ok: true
      directory: string
    }
  | {
      ok: false
      status: 400 | 403
      error: string
    }
> {
  const rawDirectory = readOpenProjectDirectory(payload)
  if (typeof rawDirectory !== "string") {
    return {
      ok: false,
      status: 400,
      error: "Directory is required",
    }
  }

  try {
    const directory = resolveDirectory(rawDirectory)
    if (!isAllowedDirectory(directory)) {
      return {
        ok: false,
        status: 403,
        error: "Directory is outside allowed roots",
      }
    }

    await OpenCodeProject.fromDirectory(directory)
    return {
      ok: true,
      directory,
    }
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error: projectUpdateErrorMessage(error),
    }
  }
}

export async function updateProjectFromPayload(input: {
  projectID: string
  payload: unknown
}): Promise<
  | {
      ok: true
      project: Awaited<ReturnType<typeof OpenCodeProject.update>>
    }
  | {
      ok: false
      status: 400 | 404
      error: string
    }
> {
  const body = parseProjectUpdateBody(input.payload)
  if (!body.success) {
    return {
      ok: false,
      status: 400,
      error: "Invalid project update",
    }
  }

  try {
    const project = await OpenCodeProject.update({
      ...body.data,
      projectID: input.projectID,
    })
    return {
      ok: true,
      project,
    }
  } catch (error) {
    const message = projectUpdateErrorMessage(error)
    return {
      ok: false,
      status: isProjectNotFoundError(error) ? 404 : 400,
      error: message,
    }
  }
}
