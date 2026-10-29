import { isNotFound } from "@buddy/agent-runtime/errors"
import type { ProjectInfo } from "@buddy/agent-runtime/workspace"
import { projectUpdateSchema } from "../contract"
import { getAgentRuntime } from "../../runtime/agent-runtime"
import { isAllowedDirectory, resolveDirectory } from "../directory"
import {
  parseOpenProjectDirectory,
  parseProjectErrorPayload,
  parseProjectString,
} from "../parse-values"

const INVALID_PROJECT_UPDATE_ERROR = "Invalid project update"
const DIRECTORY_REQUIRED_ERROR = "Directory is required"
const DIRECTORY_OUTSIDE_ALLOWED_ROOTS_ERROR = "Directory is outside allowed roots"
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
      project: ProjectInfo
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
  return projectUpdateSchema.safeParse(payload)
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

    await (await getAgentRuntime()).workspace.location(directory)
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
    const project = await (
      await getAgentRuntime()
    ).workspace.updateProject(input.projectID, body.data)
    return {
      ok: true,
      project,
    }
  } catch (error) {
    const missing = isNotFound(error, "project")
    return {
      ok: false,
      status: missing ? 404 : 400,
      error: missing ? `Project not found: ${input.projectID}` : projectUpdateErrorMessage(error),
    }
  }
}
