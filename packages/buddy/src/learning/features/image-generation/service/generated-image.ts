import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { Global } from "@buddy/opencode-adapter/global"

const GENERATED_IMAGES_DIRECTORY = "generated_images"
const PNG_FILE_EXTENSION = ".png"
const GENERATED_IMAGE_FALLBACK_TITLE = "Generated image"
const GENERATED_IMAGE_FALLBACK_SLUG = "generated-image"
const IMAGE_SLUG_MAX_CHARACTERS = 60
export const IMAGE_TITLE_MAX_CHARACTERS = 80
const SAFE_PATH_SEGMENT_PATTERN = /[^a-zA-Z0-9_-]+/gu
const SEMANTIC_SLUG_SEPARATOR_PATTERN = /[^\p{Letter}\p{Number}]+/gu
const COMBINING_MARK_PATTERN = /\p{Mark}+/gu
const WHITESPACE_PATTERN = /\s+/gu
const LEADING_OR_TRAILING_HYPHENS_PATTERN = /^-+|-+$/gu

function safePathSegment(value: string): string {
  const sanitized = value.replace(SAFE_PATH_SEGMENT_PATTERN, "_")
  return sanitized || "generated_image"
}

function truncateSemanticValue(value: string, maxCharacters: number): string {
  if (value.length <= maxCharacters) return value
  const truncated = value.slice(0, maxCharacters + 1)
  const wordBoundary = truncated.lastIndexOf(" ")
  return (
    wordBoundary > 0 ? truncated.slice(0, wordBoundary) : value.slice(0, maxCharacters)
  ).trim()
}

export function resolveGeneratedImageTitle(input: { title?: string; prompt: string }): string {
  const candidate = (input.title?.trim() || input.prompt.trim()).replace(WHITESPACE_PATTERN, " ")
  if (!candidate) return GENERATED_IMAGE_FALLBACK_TITLE
  return truncateSemanticValue(candidate, IMAGE_TITLE_MAX_CHARACTERS)
}

export function generatedImageFileName(input: { title: string; uniqueID: string }): string {
  const slug = input.title
    .normalize("NFKD")
    .replace(COMBINING_MARK_PATTERN, "")
    .toLocaleLowerCase("en-US")
    .replace(SEMANTIC_SLUG_SEPARATOR_PATTERN, "-")
    .replace(LEADING_OR_TRAILING_HYPHENS_PATTERN, "")
    .slice(0, IMAGE_SLUG_MAX_CHARACTERS)
    .replace(LEADING_OR_TRAILING_HYPHENS_PATTERN, "")
  const uniqueSuffix = safePathSegment(input.uniqueID)
  return `${slug || GENERATED_IMAGE_FALLBACK_SLUG}-${uniqueSuffix}${PNG_FILE_EXTENSION}`
}

export async function saveGeneratedImage(input: {
  sessionID: string
  callID?: string
  title: string
  base64: string
}): Promise<string> {
  const outputDirectory = path.join(
    Global.Path.data,
    GENERATED_IMAGES_DIRECTORY,
    safePathSegment(input.sessionID),
  )
  const fileName = generatedImageFileName({
    title: input.title,
    uniqueID: input.callID ?? randomUUID(),
  })
  const bytes = Buffer.from(input.base64, "base64")
  const outputPath = path.join(outputDirectory, fileName)

  await fs.mkdir(outputDirectory, { recursive: true })
  await fs.writeFile(outputPath, bytes, { flag: "wx" })
  return outputPath
}
