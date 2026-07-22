import type { NotebookUploadCreateResponses } from "@buddy/sdk"
import { getBuddyClient, requireBuddyData } from "./buddy-client"

export type CompletedNotebookUpload = NotebookUploadCreateResponses[200]

export async function copyNotebookUpload(input: {
  directory: string
  sourcePath: string
  signal: AbortSignal
}): Promise<CompletedNotebookUpload> {
  return requireBuddyData(
    await getBuddyClient(input.directory).notebookUpload.create(
      { sourcePath: input.sourcePath },
      { signal: input.signal },
    ),
  )
}
