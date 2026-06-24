import { lookup } from "mime-types"

const DEFAULT_BINARY_MIME_TYPE = "application/octet-stream"

export function mimeTypeForPath(filepath: string, fallback = DEFAULT_BINARY_MIME_TYPE): string {
  const value = lookup(filepath)
  return value || fallback
}
