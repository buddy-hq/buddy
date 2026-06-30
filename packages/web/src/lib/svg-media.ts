import { fileExtensionFromPath } from "@/lib/workspace-file-paths"

const SVG_FILE_EXTENSION = "svg"
const SVG_MIME_TYPE = "image/svg+xml"
const MIME_TYPE_PARAMETER_SEPARATOR = ";"

type SvgMediaIdentity = {
  fileName?: string | null
  mimeType?: string | null
}

export function isSvgMedia(input: SvgMediaIdentity): boolean {
  const normalizedMimeType = input.mimeType
    ?.split(MIME_TYPE_PARAMETER_SEPARATOR, 1)[0]
    ?.trim()
    .toLowerCase()
  if (normalizedMimeType === SVG_MIME_TYPE) return true

  return input.fileName ? fileExtensionFromPath(input.fileName) === SVG_FILE_EXTENSION : false
}
