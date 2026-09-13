import path from "node:path"
import { Config } from "../config"
import { readNotebookHomeState } from "../project/buddy-home"
import { resolveDirectory } from "../project/directory"
import { resolveNotesLibraryDirectory } from "./paths"

export type NotesDirectoryState = {
  configuredDirectory?: string
  defaultDirectory: string
  resolvedDirectory: string
}

export class NotesDirectoryError extends Error {
  readonly status = 400 as const
}

export function mapNotesDirectoryError(error: Error) {
  if (!(error instanceof NotesDirectoryError)) return undefined
  return Response.json({ error: error.message }, { status: error.status })
}

function normalizeConfiguredNotesDirectory(directory: string) {
  const trimmed = directory.trim()
  if (!path.isAbsolute(trimmed)) {
    throw new NotesDirectoryError("Notes directory must be an absolute path")
  }
  return resolveDirectory(trimmed)
}

export function resolveNotesDirectoryState(input: {
  buddyHomeDirectory: string
  configuredDirectory?: string | null
}): NotesDirectoryState {
  const defaultDirectory = resolveDirectory(
    resolveNotesLibraryDirectory({ buddyHomeDirectory: input.buddyHomeDirectory }),
  )
  const configuredDirectory = input.configuredDirectory?.trim()
    ? normalizeConfiguredNotesDirectory(input.configuredDirectory)
    : undefined
  return {
    ...(configuredDirectory ? { configuredDirectory } : undefined),
    defaultDirectory,
    resolvedDirectory: configuredDirectory ?? defaultDirectory,
  }
}

export async function readNotesDirectoryState(): Promise<NotesDirectoryState> {
  const [config, buddyHome] = await Promise.all([Config.getGlobal(), readNotebookHomeState()])
  return resolveNotesDirectoryState({
    buddyHomeDirectory: buddyHome.resolvedDirectory,
    configuredDirectory: config.notes_directory,
  })
}

export async function saveNotesDirectory(directory: string): Promise<NotesDirectoryState> {
  await Config.updateGlobal({ notes_directory: normalizeConfiguredNotesDirectory(directory) })
  return readNotesDirectoryState()
}
