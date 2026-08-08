import { canOpenWorkspaceFileOnBench } from "@/lib/workspace-file-media"
import { isReadableWorkspaceText } from "@/lib/workspace-file-content"
import type { BenchMediaRenderMode } from "@/components/bench/bench-media-preview"

export type PresentedMediaSourceCandidate = {
  path: string
  mimeType: string | undefined
  sizeBytes: number | undefined
  renderMode: BenchMediaRenderMode
}

export function canRenderPresentedMediaAsSource(input: PresentedMediaSourceCandidate): boolean {
  return (
    input.renderMode === "file" &&
    canOpenWorkspaceFileOnBench({
      path: input.path,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
    })
  )
}

export async function readPresentedMediaSourceBlob(blob: Blob): Promise<string> {
  const content = await blob.text()
  if (!isReadableWorkspaceText(content)) {
    throw new Error("This file is not readable UTF-8 text. Open it in its default app instead.")
  }
  return content
}
