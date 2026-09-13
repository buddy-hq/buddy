import { Buffer } from "node:buffer"
import type {
  GlobalNotebookHomeGetResponses,
  GlobalNotesDirectoryGetResponses,
  OpenProjectsListResponses,
} from "@buddy/sdk"

const BUDDY_API_PATH = "/api" as const

async function loadRouteData<T>(input: {
  baseUrl: string
  path: string
  authorization: string
}): Promise<T> {
  const response = await fetch(`${input.baseUrl}${input.path}`, {
    headers: { authorization: input.authorization },
  })
  if (!response.ok) {
    throw new Error(`Could not resolve Markdown PDF roots from Buddy (${response.status})`)
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
  const baseUrl = `${input.backendUrl.replace(/\/+$/, "")}${BUDDY_API_PATH}`
  const authorization = `Basic ${Buffer.from(`${input.username}:${input.password}`).toString("base64")}`
  const [notebookHome, notesDirectory, openProjects] = await Promise.all([
    loadRouteData<GlobalNotebookHomeGetResponses[200]>({
      baseUrl,
      path: "/global/notebook-home",
      authorization,
    }),
    loadRouteData<GlobalNotesDirectoryGetResponses[200]>({
      baseUrl,
      path: "/global/notes-directory",
      authorization,
    }),
    loadRouteData<OpenProjectsListResponses[200]>({
      baseUrl,
      path: "/open-projects",
      authorization,
    }),
  ])
  return resolveMarkdownPdfAllowedRoots({
    notebookHome,
    notesDirectory,
    openProjects,
  })
}
