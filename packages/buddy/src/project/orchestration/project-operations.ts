import { Project as OpenCodeProject } from "@buddy/opencode-adapter/project"
import { ProjectID } from "@buddy/opencode-adapter/id"
import { safeDecodeSchema } from "../../http/effect-schema"
import { isAllowedDirectory, resolveDirectory } from "../directory"
import {
  parseOpenProjectDirectory,
  parseProjectErrorPayload,
  parseProjectString,
} from "../parse-values"

const projectUpdateBodySchema = OpenCodeProject.UpdatePayload
const PROJECT_NOT_FOUND_ERROR_PREFIX = "Project not found:"
const INVALID_PROJECT_UPDATE_ERROR = "Invalid project update"
const DIRECTORY_REQUIRED_ERROR = "Directory is required"
const DIRECTORY_OUTSIDE_ALLOWED_ROOTS_ERROR = "Directory is outside allowed roots"
const NOT_FOUND_ERROR_NAME = "NotFoundError"
const PROJECT_ERROR_CAUSE_MAX_DEPTH = 10

export type TOpenProjectFromPayloadResult =
  | {
      ok: true
      directory: string
    }
  | {
      ok: false
      status: 400 | 403
      error: string
    }

export type TUpdateProjectFromPayloadResult =
  | {
      ok: true
      project: Awaited<ReturnType<typeof OpenCodeProject.update>>
    }
  | {
      ok: false
      status: 400 | 404
      error: string
    }

export function readOpenProjectDirectory<TValue>(payload: TValue): string | undefined {
  return parseOpenProjectDirectory(payload)
}

export function parseProjectUpdateBody<TValue>(payload: TValue) {
  return safeDecodeSchema(projectUpdateBodySchema, payload)
}

export function projectUpdateErrorMessage<TValue>(error: TValue) {
  const directMessage = projectErrorMessage(error)
  if (directMessage) return directMessage
  const text = parseProjectString(error)
  if (text !== undefined) return text
  if (error instanceof Error && error.message.trim().length > 0) return error.message
  return INVALID_PROJECT_UPDATE_ERROR
}

function projectErrorMessage<TValue>(payload: TValue, depth = 0): string | undefined {
  const value = parseProjectErrorPayload(payload)
  if (value === undefined) return undefined
  if (value.data?.message !== undefined) return value.data.message
  if (depth < PROJECT_ERROR_CAUSE_MAX_DEPTH) {
    const causeMessage = projectErrorMessage(value.cause, depth + 1)
    if (causeMessage) return causeMessage
  }
  return value.message
}

/**
 * Handles Error shapes from OpenCode:
 * - Error with `cause` containing `{ data?: { message?: string }, message?: string }`
 * - Error-like payloads with `{ data?: { message?: string }, message?: string }`
 */
function isProjectNotFoundError<TValue>(error: TValue): boolean {
  const payload = parseProjectErrorPayload(error)
  if (payload?.name === NOT_FOUND_ERROR_NAME) return true

  const message =
    (error instanceof Error ? projectErrorMessage(error.cause) : undefined) ??
    projectErrorMessage(error) ??
    ""
  return message.startsWith(PROJECT_NOT_FOUND_ERROR_PREFIX)
}

export async function openProjectFromPayload<TValue>(
  payload: TValue,
): Promise<TOpenProjectFromPayloadResult> {
  const rawDirectory = readOpenProjectDirectory(payload)
  if (rawDirectory === undefined) {
    return {
      ok: false,
      status: 400,
      error: DIRECTORY_REQUIRED_ERROR,
    }
  }

  try {
    const directory = resolveDirectory(rawDirectory)
    if (!isAllowedDirectory(directory)) {
      return {
        ok: false,
        status: 403,
        error: DIRECTORY_OUTSIDE_ALLOWED_ROOTS_ERROR,
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

export async function updateProjectFromPayload<TPayload>(input: {
  projectID: string
  payload: TPayload
}): Promise<TUpdateProjectFromPayloadResult> {
  const body = parseProjectUpdateBody(input.payload)
  if (!body.success) {
    return {
      ok: false,
      status: 400,
      error: INVALID_PROJECT_UPDATE_ERROR,
    }
  }

  try {
    const project = await OpenCodeProject.update({
      ...body.data,
      projectID: ProjectID.make(input.projectID),
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
