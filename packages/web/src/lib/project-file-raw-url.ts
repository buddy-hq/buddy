import { fileNameFromPath, normalizeRelativePath } from "@/lib/workspace-file-paths"

const PROJECT_FILE_RAW_ROUTE_PREFIX = "/api/file/raw" as const
const DEFAULT_RAW_FILE_NAME = "file" as const
export const CONTENT_LENGTH_HEADER = "content-length" as const
export const CONTENT_TYPE_HEADER = "content-type" as const

export function buildProjectFileRawUrl(directory: string, filepath: string) {
  const normalizedPath = normalizeRelativePath(filepath)
  const downloadName = fileNameFromPath(normalizedPath) || DEFAULT_RAW_FILE_NAME
  const query = new URLSearchParams({
    path: normalizedPath,
  })
  return {
    directory,
    endpoint: `${PROJECT_FILE_RAW_ROUTE_PREFIX}/${encodeURIComponent(downloadName)}?${query.toString()}`,
  }
}
