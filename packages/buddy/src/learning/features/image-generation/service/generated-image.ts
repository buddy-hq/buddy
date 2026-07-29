import { createHash, randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { Global } from "@buddy/opencode-adapter/global"
import z from "zod"

export const GENERATED_IMAGES_DIRECTORY = "generated_images"
const PNG_FILE_EXTENSION = ".png"
const GENERATED_IMAGE_FALLBACK_TITLE = "Generated image"
const GENERATED_IMAGE_FALLBACK_SLUG = "generated-image"
const IMAGE_SLUG_MAX_CHARACTERS = 60
export const IMAGE_TITLE_MAX_CHARACTERS = 80
const GENERATED_IMAGE_PROVENANCE_VERSION = 1
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/u
const SAFE_PATH_SEGMENT_PATTERN = /[^a-zA-Z0-9_-]+/gu
const SEMANTIC_SLUG_SEPARATOR_PATTERN = /[^\p{Letter}\p{Number}]+/gu
const COMBINING_MARK_PATTERN = /\p{Mark}+/gu
const WHITESPACE_PATTERN = /\s+/gu
const LEADING_OR_TRAILING_HYPHENS_PATTERN = /^-+|-+$/gu

const GeneratedImageProvenanceSchema = z
  .object({
    version: z.literal(GENERATED_IMAGE_PROVENANCE_VERSION),
    path: z.string().min(1),
    sha256: z.string().regex(SHA256_HEX_PATTERN),
    sizeBytes: z.number().int().nonnegative(),
    sessionID: z.string().min(1),
    callID: z.string().min(1),
  })
  .strict()

type GeneratedImageProvenance = z.infer<typeof GeneratedImageProvenanceSchema>

type SavedGeneratedImage = {
  path: string
  sha256: string
  sizeBytes: number
}

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

export function generatedImagesRoot(): string {
  return path.join(Global.Path.data, GENERATED_IMAGES_DIRECTORY)
}

export function generatedImageSessionDirectory(sessionID: string): string {
  return path.join(generatedImagesRoot(), safePathSegment(sessionID))
}

export function generatedImageProvenance(input: {
  image: SavedGeneratedImage
  sessionID: string
  callID: string
}): GeneratedImageProvenance {
  return GeneratedImageProvenanceSchema.parse({
    version: GENERATED_IMAGE_PROVENANCE_VERSION,
    path: input.image.path,
    sha256: input.image.sha256,
    sizeBytes: input.image.sizeBytes,
    sessionID: input.sessionID,
    callID: input.callID,
  })
}

export async function saveGeneratedImage(input: {
  sessionID: string
  callID?: string
  title: string
  base64: string
}): Promise<SavedGeneratedImage> {
  const outputDirectory = generatedImageSessionDirectory(input.sessionID)
  const fileName = generatedImageFileName({
    title: input.title,
    uniqueID: input.callID ?? randomUUID(),
  })
  const bytes = Buffer.from(input.base64, "base64")
  const outputPath = path.join(outputDirectory, fileName)

  await fs.mkdir(outputDirectory, { recursive: true })
  await fs.writeFile(outputPath, bytes, { flag: "wx" })
  return {
    path: outputPath,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    sizeBytes: bytes.byteLength,
  }
}

export { GeneratedImageProvenanceSchema }
export type { GeneratedImageProvenance, SavedGeneratedImage }
