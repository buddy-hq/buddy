import {
  LARGE_TEXT_FILE_LIMIT_BYTES,
  canOpenWorkspaceFileOnBench,
  canOpenWorkspaceFileInPanel,
  classifyWorkspaceMedia,
  isImageMimeType,
  isWorkspaceImagePath,
  isWorkspaceReaderPath,
  isWorkspaceFileOverSoftLimit,
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
import { fileNameFromPath } from "@/lib/workspace-file-paths"

export type { WorkspaceMediaKind, WorkspaceMediaRenderMode }

export type WorkspaceFileRawMetadata = {
  sizeBytes: number | undefined
  mimeType: string | undefined
}

export {
  LARGE_TEXT_FILE_LIMIT_BYTES,
  canOpenWorkspaceFileOnBench,
  canOpenWorkspaceFileInPanel,
  classifyWorkspaceMedia,
  isImageMimeType,
  isWorkspaceImagePath,
  isWorkspaceReaderPath,
  isWorkspaceFileOverSoftLimit,
  shouldOpenFileInDefaultAppBySize,
}

const HTTP_STATUS_NOT_FOUND = 404

export type WorkspaceFileRawProbe =
  | { status: "available"; metadata: WorkspaceFileRawMetadata }
  | { status: "missing" }
  | { status: "unknown"; error: Error }

export function workspaceFileMissingMessage(path: string): string {
  return `${fileNameFromPath(path) || path} was moved or deleted.`
}

export class WorkspaceFileMissingError extends Error {
  constructor(path: string) {
    super(workspaceFileMissingMessage(path))
    this.name = "WorkspaceFileMissingError"
  }
}

export async function probeWorkspaceFileRaw(input: {
  directory: string
  path: string
}): Promise<WorkspaceFileRawProbe> {
  try {
    const response = await getBuddyClient(input.directory).headApiFileRawFileName(
      buildProjectFileRawParameters(input.path),
    )
    if (response.response?.status === HTTP_STATUS_NOT_FOUND) return { status: "missing" }
    if (!response.response?.ok) {
      return { status: "unknown", error: new Error(buddyResultMessage(response)) }
    }

    const sizeHeader = response.response.headers.get(CONTENT_LENGTH_HEADER)
    const parsedSize = sizeHeader ? Number.parseInt(sizeHeader, 10) : Number.NaN
    return {
      status: "available",
      metadata: {
        sizeBytes: Number.isFinite(parsedSize) && parsedSize >= 0 ? parsedSize : undefined,
        mimeType: response.response.headers.get(CONTENT_TYPE_HEADER) ?? undefined,
      },
    }
  } catch (error) {
    return {
      status: "unknown",
      error: error instanceof Error ? error : new Error(String(error)),
    }
  }
}

export async function readWorkspaceFileRawMetadata(input: {
  directory: string
  path: string
}): Promise<WorkspaceFileRawMetadata> {
  const probe = await probeWorkspaceFileRaw(input)
  if (probe.status === "available") return probe.metadata
  if (probe.status === "missing") throw new WorkspaceFileMissingError(input.path)
  throw probe.error
}
