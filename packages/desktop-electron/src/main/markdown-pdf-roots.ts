import { Buffer } from "node:buffer"
import {
  createBuddyClient,
  type GlobalNotebookHomeGetResponses,
  type GlobalNotesDirectoryGetResponses,
  type OpenProjectsListResponses,
} from "@buddy/sdk"

const BUDDY_API_PATH = "/api" as const

type BuddyRouteResult<T> = {
  data: T | undefined
  response: Response | undefined
}

function requireRouteData<T>(result: BuddyRouteResult<T>): T {
  if (!result.response?.ok || result.data === undefined) {
    throw new Error(
      `Could not resolve Markdown PDF roots from Buddy (${result.response?.status ?? "no response"})`,
    )
  }
  return result.data
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
  const client = createBuddyClient({
    baseUrl,
    headers: { authorization },
  })
  const [notebookHomeResult, notesDirectoryResult, openProjectsResult] = await Promise.all([
    client.global.notebookHome.get(),
    client.global.notesDirectory.get(),
    client.openProjects.list(),
  ])
  return resolveMarkdownPdfAllowedRoots({
    notebookHome: requireRouteData(notebookHomeResult),
    notesDirectory: requireRouteData(notesDirectoryResult),
    openProjects: requireRouteData(openProjectsResult),
  })
}
