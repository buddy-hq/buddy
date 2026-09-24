import { Buffer } from "node:buffer"
import type {
  GlobalNotebookHomeGetResponses,
  GlobalNotesDirectoryGetResponses,
  OpenProjectsListResponses,
} from "@buddy/sdk"

const BUDDY_API_PATH = "/api" as const

const MARKDOWN_PDF_ROOTS_FAILURE_MESSAGE =
  "Could not resolve Markdown PDF roots from Buddy" as const

export async function loadBuddyRouteData<T>(input: {
  backendUrl: string
  username: string
  password: string
  path: string
  failureMessage: string
}): Promise<T> {
  const authorization = `Basic ${Buffer.from(`${input.username}:${input.password}`).toString("base64")}`
  const response = await fetch(
    `${input.backendUrl.replace(/\/+$/, "")}${BUDDY_API_PATH}${input.path}`,
    { headers: { authorization } },
  )
  if (!response.ok) {
    throw new Error(`${input.failureMessage} (${response.status})`)
  }
  // SAFETY: These authenticated Buddy endpoints return the generated route response shape for T.
  return (await response.json()) as T
}

export function resolveMarkdownPdfAllowedRoots(input: {
  notebookHome: GlobalNotebookHomeGetResponses[200]
  notesDirectory: GlobalNotesDirectoryGetResponses[200]
  openProjects: OpenProjectsListResponses[200]
}): string[] {
  return [
    ...new Set([
      input.notebookHome.resolvedDirectory,
      input.notesDirectory.resolvedDirectory,
      ...input.openProjects.directories,
    ]),
  ]
}

export async function loadMarkdownPdfAllowedRoots(input: {
  backendUrl: string
  username: string
  password: string
}): Promise<string[]> {
  const [notebookHome, notesDirectory, openProjects] = await Promise.all([
    loadBuddyRouteData<GlobalNotebookHomeGetResponses[200]>({
      ...input,
      path: "/global/notebook-home",
      failureMessage: MARKDOWN_PDF_ROOTS_FAILURE_MESSAGE,
    }),
    loadBuddyRouteData<GlobalNotesDirectoryGetResponses[200]>({
      ...input,
      path: "/global/notes-directory",
      failureMessage: MARKDOWN_PDF_ROOTS_FAILURE_MESSAGE,
    }),
    loadBuddyRouteData<OpenProjectsListResponses[200]>({
      ...input,
      path: "/open-projects",
      failureMessage: MARKDOWN_PDF_ROOTS_FAILURE_MESSAGE,
    }),
  ])
  return resolveMarkdownPdfAllowedRoots({
    notebookHome,
    notesDirectory,
    openProjects,
  })
}
