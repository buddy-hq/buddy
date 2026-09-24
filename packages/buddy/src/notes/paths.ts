import fsp from "node:fs/promises"
import path from "node:path"
import { parseNodeErrorCode } from "../storage/parse-node-error"
import { isPathInsideDirectory } from "../storage/path-containment"

export const NOTES_LIBRARY_DIRECTORY_NAME = "Notes" as const
export const NOTES_ATTACHMENTS_DIRECTORY_NAME = "Attachments" as const
export const NOTES_CHAT_NOTES_DIRECTORY_NAME = "Chat notes" as const
const NODE_ERROR_NOT_FOUND = "ENOENT" as const

export function resolveDefaultNotesLibraryDirectory(buddyHomeDirectory: string) {
  return path.join(buddyHomeDirectory, NOTES_LIBRARY_DIRECTORY_NAME)
}

export function resolveNotesLibraryDirectory(input: {
  buddyHomeDirectory: string
  configuredDirectory?: string | null
}) {
  const configured = input.configuredDirectory?.trim()
  return configured || resolveDefaultNotesLibraryDirectory(input.buddyHomeDirectory)
}

export function resolveChatNotesDirectory(notesDirectory: string) {
  return path.join(notesDirectory, NOTES_CHAT_NOTES_DIRECTORY_NAME)
}

export function resolveNotesAttachmentsDirectory(notesDirectory: string) {
  return path.join(notesDirectory, NOTES_ATTACHMENTS_DIRECTORY_NAME)
}

export function isLexicallyReservedNotesAttachmentsPath(
  notesDirectory: string,
  candidatePath: string,
) {
  return isPathInsideDirectory(
    path.resolve(resolveNotesAttachmentsDirectory(notesDirectory)),
    path.resolve(candidatePath),
  )
}

async function resolveCanonicalNotesPath(filepath: string) {
  const resolved = path.resolve(filepath)
  return fsp.realpath(resolved).catch((error) => {
    if (parseNodeErrorCode(error) === NODE_ERROR_NOT_FOUND) return resolved
    throw error
  })
}

export async function isReservedNotesAttachmentsPath(
  notesDirectory: string,
  candidatePath: string,
) {
  const [attachmentsDirectory, candidate] = await Promise.all([
    resolveCanonicalNotesPath(resolveNotesAttachmentsDirectory(notesDirectory)),
    resolveCanonicalNotesPath(candidatePath),
  ])
  return isPathInsideDirectory(attachmentsDirectory, candidate)
}
