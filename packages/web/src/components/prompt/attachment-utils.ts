import { NATIVE_RESOURCE_FILE_DEFINITIONS } from "@buddy/workspace-file-policy"
import type { PromptComposerAttachment, PromptModelAttachment } from "./prompt-types"

export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"]
export const ACCEPTED_NON_IMAGE_FILE_TYPES = [
  ...NATIVE_RESOURCE_FILE_DEFINITIONS.flatMap((definition) => [
    definition.mime,
    definition.extension,
  ]),
  "text/*",
  "application/json",
  "application/ld+json",
  "application/toml",
  "application/x-toml",
  "application/x-yaml",
  "application/xml",
  "application/yaml",
  ".c",
  ".cc",
  ".cjs",
  ".conf",
  ".cpp",
  ".css",
  ".csv",
  ".cts",
  ".env",
  ".go",
  ".gql",
  ".graphql",
  ".h",
  ".hh",
  ".hpp",
  ".htm",
  ".html",
  ".ini",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".log",
  ".md",
  ".mdx",
  ".mjs",
  ".mts",
  ".py",
  ".rb",
  ".rs",
  ".sass",
  ".scss",
  ".sh",
  ".sql",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
  ".zsh",
]
export const ACCEPTED_FILE_TYPES = [...ACCEPTED_IMAGE_TYPES, ...ACCEPTED_NON_IMAGE_FILE_TYPES]

const IMAGE_MIME_TYPES = new Set(ACCEPTED_IMAGE_TYPES)
const IMAGE_MIME_TYPES_BY_EXTENSION = new Map([
  ["gif", "image/gif"],
  ["jpeg", "image/jpeg"],
  ["jpg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
])
const STRUCTURED_TEXT_MIME_TYPES = new Set([
  "application/json",
  "application/ld+json",
  "application/toml",
  "application/x-toml",
  "application/x-yaml",
  "application/xml",
  "application/yaml",
])
const ATTACHMENT_MIME_SAMPLE_BYTES = 4_096
const MAX_TEXT_CONTROL_BYTE_RATIO = 0.3
const MIME_TYPE_PARAMETER_SEPARATOR = ";"
const FILE_EXTENSION_SEPARATOR = "."
const PDF_MIME_TYPE = "application/pdf"
const GENERIC_BINARY_MIME_TYPE = "application/octet-stream"
const TEXT_MIME_TYPE = "text/plain"

function normalizeMimeType(mime: string) {
  return mime.split(MIME_TYPE_PARAMETER_SEPARATOR, 1)[0]?.trim().toLowerCase() ?? ""
}

function fileExtension(filename: string) {
  const separator = filename.lastIndexOf(FILE_EXTENSION_SEPARATOR)
  if (separator === -1) return ""
  return filename.slice(separator + 1).toLowerCase()
}

function isTextMimeType(mime: string) {
  if (!mime) return false
  if (mime.startsWith("text/")) return true
  if (STRUCTURED_TEXT_MIME_TYPES.has(mime)) return true
  if (mime.endsWith("+json")) return true
  return mime.endsWith("+xml")
}

function isProbablyText(bytes: Uint8Array) {
  if (bytes.length === 0) return true

  let controlByteCount = 0
  for (const byte of bytes) {
    if (byte === 0) return false
    if (byte < 9 || (byte > 13 && byte < 32)) controlByteCount += 1
  }
  return controlByteCount / bytes.length <= MAX_TEXT_CONTROL_BYTE_RATIO
}

/**
 * Match OpenCode Desktop's attachment classification before reading a complete
 * file into memory. Unknown files are sampled so text with an unreliable
 * browser MIME type still works while binary files are rejected cheaply.
 */
export async function resolvePromptAttachmentMime(file: File): Promise<string | undefined> {
  const mime = normalizeMimeType(file.type)
  if (IMAGE_MIME_TYPES.has(mime)) return mime
  if (mime === PDF_MIME_TYPE) return mime

  const extension = fileExtension(file.name)
  const fallbackMime =
    IMAGE_MIME_TYPES_BY_EXTENSION.get(extension) ??
    (extension === "pdf" ? PDF_MIME_TYPE : undefined)
  if ((!mime || mime === GENERIC_BINARY_MIME_TYPE) && fallbackMime) return fallbackMime

  if (isTextMimeType(mime)) return TEXT_MIME_TYPE

  const sample = new Uint8Array(
    await file.slice(0, ATTACHMENT_MIME_SAMPLE_BYTES).arrayBuffer(),
  )
  if (!isProbablyText(sample)) return undefined
  return TEXT_MIME_TYPE
}

export function attachmentRequiresVisionInput(mime: string): boolean {
  return ACCEPTED_IMAGE_TYPES.includes(mime.toLowerCase())
}

export function cloneAttachments(attachments: PromptComposerAttachment[]) {
  return attachments.map((attachment) => ({ ...attachment }))
}

export function createAttachmentID() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `attachment-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function readFileAsDataUrl(file: File, resolvedMime?: string) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    const onLoad = () => {
      if (typeof reader.result === "string") {
        if (!resolvedMime) {
          resolve(reader.result)
          return
        }

        const separator = reader.result.indexOf(",")
        if (separator === -1) {
          reject(new Error("Failed to read attachment"))
          return
        }
        resolve(`data:${resolvedMime};base64,${reader.result.slice(separator + 1)}`)
        return
      }
      reject(new Error("Failed to read attachment"))
    }
    const onError = () => reject(reader.error ?? new Error("Failed to read attachment"))
    reader.addEventListener("load", onLoad, { once: true })
    reader.addEventListener("error", onError, { once: true })
    reader.readAsDataURL(file)
  })
}

export async function fileToPromptComposerAttachment(
  file: File,
  resolvedMime?: string,
): Promise<PromptModelAttachment | undefined> {
  const mime = resolvedMime ?? (await resolvePromptAttachmentMime(file))
  if (!mime) return undefined

  return {
    id: createAttachmentID(),
    filename: file.name || (mime.startsWith("image/") ? "image" : "attachment"),
    mime,
    dataUrl: await readFileAsDataUrl(file, mime),
    kind: mime.startsWith("image/") ? "image" : "file",
  }
}
