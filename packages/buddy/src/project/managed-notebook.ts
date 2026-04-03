import fsp from "node:fs/promises"
import path from "node:path"
import { Config } from "../config"
import { openProjectRegistryEntry } from "./open-project-registry"
import { BuddyHomeError, resolveBuddyHomeState } from "./buddy-home"
import { mapBuddyHomeError } from "./buddy-home"
import { INBOX_NOTEBOOK_NAME } from "./notebook-constants"

export { INBOX_NOTEBOOK_NAME }

export class ManagedNotebookError extends Error {
  readonly status = 400 as const

  constructor(message: string) {
    super(message)
    this.name = "ManagedNotebookError"
  }
}

const WINDOWS_RESERVED_NOTEBOOK_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i
const WINDOWS_INVALID_NOTEBOOK_CHARACTER = /[<>:"/\\|?*]/u
const WINDOWS_TRAILING_NOTEBOOK_CHARACTER = /[. ]$/u

function hasWindowsControlCharacter(value: string) {
  for (const character of value) {
    if (character <= "\u001f") {
      return true
    }
  }

  return false
}

function isManagedNotebookError(error: unknown): error is ManagedNotebookError {
  return error instanceof ManagedNotebookError
}

export function mapManagedNotebookError(error: unknown): Response | undefined {
  const buddyHomeResponse = mapBuddyHomeError(error)
  if (buddyHomeResponse) return buddyHomeResponse

  if (!isManagedNotebookError(error)) return undefined
  return Response.json({ error: error.message }, { status: error.status })
}

function normalizeNotebookName(name: string) {
  const trimmed = name.trim()
  if (!trimmed) {
    throw new ManagedNotebookError("Notebook name is required")
  }

  if (trimmed === "." || trimmed === "..") {
    throw new ManagedNotebookError("Notebook name is invalid")
  }

  if (WINDOWS_INVALID_NOTEBOOK_CHARACTER.test(trimmed)) {
    throw new ManagedNotebookError("Notebook name contains unsupported characters")
  }

  if (hasWindowsControlCharacter(trimmed)) {
    throw new ManagedNotebookError("Notebook name contains unsupported characters")
  }

  if (WINDOWS_TRAILING_NOTEBOOK_CHARACTER.test(trimmed)) {
    throw new ManagedNotebookError("Notebook name cannot end with a period or space")
  }

  if (WINDOWS_RESERVED_NOTEBOOK_NAME.test(trimmed)) {
    throw new ManagedNotebookError("Notebook name is reserved on Windows")
  }

  return trimmed
}

function mapNotebookCreationError(error: unknown) {
  if (error instanceof ManagedNotebookError) return error
  if (error instanceof BuddyHomeError) return error
  if (error instanceof Error && error.message.trim().length > 0) {
    return new ManagedNotebookError(error.message)
  }
  return new ManagedNotebookError("Could not create notebook")
}

export async function createManagedNotebookByName(input: {
  name: string
  buddyHome?: string | null
}) {
  const homeState = resolveBuddyHomeState(input.buddyHome)
  const notebookName = normalizeNotebookName(input.name)
  const notebookDirectory = path.join(homeState.resolvedPath, notebookName)

  try {
    await fsp.mkdir(homeState.resolvedPath, { recursive: true })
    await fsp.mkdir(notebookDirectory, { recursive: true })
  } catch (error) {
    throw mapNotebookCreationError(error)
  }

  return openProjectRegistryEntry(notebookDirectory)
}

export async function createManagedNotebook(name: string) {
  const config = await Config.getGlobal()
  return createManagedNotebookByName({
    name,
    buddyHome: config.notebook_home,
  })
}
