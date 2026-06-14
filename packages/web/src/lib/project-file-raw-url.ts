import { fileNameFromPath, normalizeRelativePath } from "@/lib/workspace-file-paths"

export const DEFAULT_RAW_FILE_NAME = "file" as const
export const CONTENT_LENGTH_HEADER = "content-length" as const
export const CONTENT_TYPE_HEADER = "content-type" as const

export function buildProjectFileRawParameters(filepath: string) {
  const normalizedPath = normalizeRelativePath(filepath)
  return {
    fileName: fileNameFromPath(normalizedPath) || DEFAULT_RAW_FILE_NAME,
    path: normalizedPath,
  }
}

export function buildProjectFileRawUrl(input: { directory: string; path: string }) {
  const parameters = buildProjectFileRawParameters(input.path)
  return `/api/file/raw/${encodeURIComponent(parameters.fileName)}?path=${encodeURIComponent(parameters.path)}&directory=${encodeURIComponent(input.directory)}`
}
