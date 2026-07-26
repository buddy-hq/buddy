import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { SessionTransformValidationError } from "../../session"
import {
  isNativeResourceAttachmentPart,
  nativeResourcePromptAttachmentsFromParts,
  readNativeResourcePromptAttachment,
  type NativeResourcePromptAttachment,
} from "./native-resource-attachments"

export const NATIVE_PDF_MAX_PAGES_PER_FILE = 30
export const NATIVE_PDF_MAX_PAGES_PER_PROMPT = 50

const PROMPT_PART_TYPE_FILE = "file" as const
const PDF_MIME = "application/pdf" as const
const FILE_SOURCE_TYPE = "file" as const

type NativePdfDeliveryDecision = {
  delivery: NativeResourcePromptAttachment["delivery"]
  pageCount?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isPdfFilePart(part: Record<string, unknown>): boolean {
  return part.type === PROMPT_PART_TYPE_FILE && part.mime === PDF_MIME
}

function normalizedFilePartSourcePath(input: {
  directory: string
  part: Record<string, unknown>
}): string | undefined {
  if (!isPdfFilePart(input.part)) return undefined

  const source = input.part.source
  if (
    isRecord(source) &&
    source.type === FILE_SOURCE_TYPE &&
    typeof source.path === "string" &&
    source.path.length > 0
  ) {
    return path.resolve(input.directory, source.path)
  }

  if (typeof input.part.url !== "string") return undefined
  try {
    const url = new URL(input.part.url)
    return url.protocol === "file:" ? path.resolve(fileURLToPath(url)) : undefined
  } catch {
    return undefined
  }
}

export async function readPdfPageCount(sourcePath: string): Promise<number> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(await readFile(sourcePath)),
    useWorkerFetch: false,
    isEvalSupported: false,
  })
  let document: Awaited<typeof loadingTask.promise> | undefined

  try {
    document = await loadingTask.promise
    if (!Number.isSafeInteger(document.numPages) || document.numPages <= 0) {
      throw new Error("PDF page count is invalid")
    }
    return document.numPages
  } finally {
    if (document) {
      await document.destroy()
    } else {
      await loadingTask.destroy()
    }
  }
}

export async function applyNativePdfDeliveryPolicy(input: {
  directory: string
  parts: Record<string, unknown>[]
}): Promise<Record<string, unknown>[]> {
  const attachments = nativeResourcePromptAttachmentsFromParts(input.parts)
  const nativePdfFilePaths = new Set<string>()
  for (const part of input.parts) {
    if (!isPdfFilePart(part)) continue

    const sourcePath = normalizedFilePartSourcePath({
      directory: input.directory,
      part,
    })
    if (!sourcePath) {
      throw new SessionTransformValidationError(
        "Native PDF model input must reference a completed local upload.",
      )
    }
    nativePdfFilePaths.add(sourcePath)
  }

  const attachmentPdfPaths = new Set(
    attachments.flatMap((attachment) =>
      attachment.format === "pdf" ? [path.resolve(attachment.sourcePath)] : [],
    ),
  )
  for (const sourcePath of nativePdfFilePaths) {
    if (!attachmentPdfPaths.has(sourcePath)) {
      throw new SessionTransformValidationError(
        "Native PDF model input requires matching resource attachment metadata.",
      )
    }
  }

  const decisions = new Map<string, NativePdfDeliveryDecision>()
  let admittedPageCount = 0

  for (const attachment of attachments) {
    if (attachment.format !== "pdf") continue

    const sourcePath = path.resolve(attachment.sourcePath)
    if (decisions.has(sourcePath)) continue

    const pageCount = nativePdfFilePaths.has(sourcePath)
      ? await readPdfPageCount(sourcePath).catch(() => undefined)
      : undefined
    const withinPerFileLimit =
      pageCount !== undefined && pageCount <= NATIVE_PDF_MAX_PAGES_PER_FILE
    const withinPromptLimit =
      pageCount !== undefined &&
      admittedPageCount + pageCount <= NATIVE_PDF_MAX_PAGES_PER_PROMPT
    const delivery =
      withinPerFileLimit && withinPromptLimit ? "model-and-resource" : "resource-only"

    if (delivery === "model-and-resource" && pageCount !== undefined) {
      admittedPageCount += pageCount
    }
    decisions.set(sourcePath, {
      delivery,
      ...(pageCount !== undefined ? { pageCount } : {}),
    })
  }

  const retainedNativePdfPaths = new Set<string>()
  return input.parts.flatMap((part) => {
    if (isNativeResourceAttachmentPart(part)) {
      const attachment = readNativeResourcePromptAttachment(part)
      if (attachment.format !== "pdf") return [attachment]

      const decision = decisions.get(path.resolve(attachment.sourcePath))
      return decision ? [{ ...attachment, ...decision }] : [attachment]
    }

    const sourcePath = normalizedFilePartSourcePath({
      directory: input.directory,
      part,
    })
    if (!sourcePath) return [part]

    const decision = decisions.get(sourcePath)
    if (
      decision?.delivery !== "model-and-resource" ||
      retainedNativePdfPaths.has(sourcePath)
    ) {
      return []
    }

    retainedNativePdfPaths.add(sourcePath)
    return [part]
  })
}
