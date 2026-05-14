import type { ToolAttachment, ToolState } from "./tool-registry-types"

const READ_IMAGE_FILE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]
const SVG_FILE_EXTENSION = ".svg"
const SVG_MARKUP_PATTERN = /<svg[\s\S]*?<\/svg>/iu

function isReadImageFilePath(filePath: string | undefined): boolean {
  if (!filePath) return false
  const lower = filePath.toLowerCase()
  return READ_IMAGE_FILE_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

function extractSvgMarkup(output: string | undefined): string | undefined {
  if (!output) return undefined
  const match = output.match(SVG_MARKUP_PATTERN)
  return match?.[0]
}

function buildSvgDataUrl(svgMarkup: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svgMarkup)}`
}

export function getReadPreviewImageAttachments(input: {
  state: ToolState
  filePath?: string
}): ToolAttachment[] {
  const imageAttachments = input.state.attachments.filter((attachment) =>
    attachment.mime.startsWith("image/"),
  )
  if (imageAttachments.length > 0) {
    return imageAttachments
  }

  if (!input.filePath?.toLowerCase().endsWith(SVG_FILE_EXTENSION)) {
    return []
  }

  const svgMarkup = extractSvgMarkup(input.state.output)
  if (!svgMarkup) {
    return []
  }

  return [
    {
      id: `read-svg-preview:${input.filePath}`,
      mime: "image/svg+xml",
      url: buildSvgDataUrl(svgMarkup),
      filename: input.filePath,
    },
  ]
}

export function isReadImagePreview(input: { state: ToolState; filePath?: string }): boolean {
  if (isReadImageFilePath(input.filePath)) {
    return true
  }

  return getReadPreviewImageAttachments(input).length > 0
}
