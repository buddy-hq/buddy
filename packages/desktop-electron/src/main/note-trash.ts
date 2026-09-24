import { lstat, realpath } from "node:fs/promises"
import { extname, isAbsolute } from "node:path"
import type { GlobalNotesDirectoryGetResponses } from "@buddy/sdk"
import { isPathInsideDirectory } from "./markdown-pdf-path"
import { loadBuddyRouteData } from "./markdown-pdf-roots"

const NOTE_FILE_EXTENSION = ".md" as const
const NOTE_TRASH_REJECTED_MESSAGE =
  "Only Markdown files in the Notes library can be moved to the trash" as const

export async function loadNotesDirectory(input: {
  backendUrl: string
  username: string
  password: string
}): Promise<string> {
  const state = await loadBuddyRouteData<GlobalNotesDirectoryGetResponses[200]>({
    ...input,
    path: "/global/notes-directory",
    failureMessage: "Could not resolve the Notes directory from Buddy",
  })
  return state.resolvedDirectory
}

export async function resolveTrashableNotePath(input: {
  notePath: string | undefined
  notesDirectory: string
}): Promise<string> {
  const { notePath } = input
  if (
    !notePath ||
    !isAbsolute(notePath) ||
    extname(notePath).toLowerCase() !== NOTE_FILE_EXTENSION
  ) {
    throw new Error(NOTE_TRASH_REJECTED_MESSAGE)
  }
  const stats = await lstat(notePath)
  if (!stats.isFile()) throw new Error(NOTE_TRASH_REJECTED_MESSAGE)
  const [canonicalNotePath, canonicalNotesDirectory] = await Promise.all([
    realpath(notePath),
    realpath(input.notesDirectory),
  ])
  if (!isPathInsideDirectory(canonicalNotePath, canonicalNotesDirectory)) {
    throw new Error(NOTE_TRASH_REJECTED_MESSAGE)
  }
  return canonicalNotePath
}
