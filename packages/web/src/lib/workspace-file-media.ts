import {
  canOpenWorkspaceFileInPanel,
  classifyWorkspaceMedia,
  isImageMimeType,
  isWorkspaceImagePath,
  isWorkspaceReaderPath,
  shouldOpenFileInDefaultAppBySize,
  type WorkspaceMediaKind,
  type WorkspaceMediaRenderMode,
} from "@buddy/workspace-file-policy"
import {
  buildProjectFileRawParameters,
  CONTENT_LENGTH_HEADER,
  CONTENT_TYPE_HEADER,
} from "@/lib/project-file-raw-url"
import { buddyResultMessage, getBuddyClient } from "@/lib/buddy-client"

export type { WorkspaceMediaKind, WorkspaceMediaRenderMode }

export type WorkspaceFileRawMetadata = {
  sizeBytes: number | undefined
  mimeType: string | undefined
}

export {
  canOpenWorkspaceFileInPanel,
  classifyWorkspaceMedia,
  isImageMimeType,
  isWorkspaceImagePath,
  isWorkspaceReaderPath,
  shouldOpenFileInDefaultAppBySize,
}

export async function readWorkspaceFileRawMetadata(input: {
  directory: string
  path: string
}): Promise<WorkspaceFileRawMetadata> {
  const response = await getBuddyClient(input.directory).headApiFileRawFileName(
    buildProjectFileRawParameters(input.path),
  )
  if (!response.response?.ok) {
    throw new Error(buddyResultMessage(response))
  }

  const sizeHeader = response.response.headers.get(CONTENT_LENGTH_HEADER)
  const parsedSize = sizeHeader ? Number.parseInt(sizeHeader, 10) : Number.NaN
  return {
    sizeBytes: Number.isFinite(parsedSize) && parsedSize >= 0 ? parsedSize : undefined,
    mimeType: response.response.headers.get(CONTENT_TYPE_HEADER) ?? undefined,
  }
}
