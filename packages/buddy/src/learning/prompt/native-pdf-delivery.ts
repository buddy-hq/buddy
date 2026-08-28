import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { SessionTransformValidationError } from "../../session"
import {
  isNativeResourceAttachmentPart,
  nativeResourceAttachmentPromptPart,
  nativeResourcePromptAttachmentsFromParts,
  readNativeResourcePromptAttachment,
  type NativeResourcePromptAttachment,
} from "./native-resource-attachments"
import { parseJsonObject, parsePromptString, type TPromptPart } from "./utils"

export const NATIVE_PDF_MAX_PAGES_PER_FILE = 30
export const NATIVE_PDF_MAX_PAGES_PER_PROMPT = 50

const PROMPT_PART_TYPE_FILE = "file" as const
const PDF_MIME = "application/pdf" as const
const FILE_SOURCE_TYPE = "file" as const

type TNativePdfDeliveryDecision = {
  delivery: NativeResourcePromptAttachment["delivery"]
  pageCount?: number
}

function isPdfFilePart(part: TPromptPart): boolean {
  return part.type === PROMPT_PART_TYPE_FILE && part.mime === PDF_MIME
}

function normalizedFilePartSourcePath(input: {
  directory: string
  part: TPromptPart
}): string | undefined {
  if (!isPdfFilePart(input.part)) return undefined

  const source = parseJsonObject(input.part.source)
  const sourcePath =
    source !== undefined && source.type === FILE_SOURCE_TYPE
      ? parsePromptString(source.path)
      : undefined
  if (sourcePath !== undefined && sourcePath.length > 0) {
    return path.resolve(input.directory, sourcePath)
  }

  const urlValue = parsePromptString(input.part.url)
  if (urlValue === undefined) return undefined
  try {
    const url = new URL(urlValue)
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
  parts: TPromptPart[]
}): Promise<TPromptPart[]> {
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

  const decisions = new Map<string, TNativePdfDeliveryDecision>()
  let admittedPageCount = 0

  for (const attachment of attachments) {
    if (attachment.format !== "pdf") continue

    const sourcePath = path.resolve(attachment.sourcePath)
    if (decisions.has(sourcePath)) continue

    const pageCount = nativePdfFilePaths.has(sourcePath)
      ? await readPdfPageCount(sourcePath).catch(() => undefined)
      : undefined
    const withinPerFileLimit = pageCount !== undefined && pageCount <= NATIVE_PDF_MAX_PAGES_PER_FILE
    const withinPromptLimit =
      pageCount !== undefined && admittedPageCount + pageCount <= NATIVE_PDF_MAX_PAGES_PER_PROMPT
    const delivery: TNativePdfDeliveryDecision["delivery"] =
      withinPerFileLimit && withinPromptLimit ? "model-and-resource" : "resource-only"

    if (delivery === "model-and-resource" && pageCount !== undefined) {
      admittedPageCount += pageCount
    }
    decisions.set(
      sourcePath,
      Object.assign({ delivery }, pageCount !== undefined ? { pageCount } : undefined),
    )
  }

  const retainedNativePdfPaths = new Set<string>()
  return input.parts.flatMap((part) => {
    if (isNativeResourceAttachmentPart(part)) {
      const attachment = readNativeResourcePromptAttachment(part)
      if (attachment.format !== "pdf") return [nativeResourceAttachmentPromptPart(attachment)]

      const decision = decisions.get(path.resolve(attachment.sourcePath))
      return [
        nativeResourceAttachmentPromptPart(
          decision ? Object.assign({}, attachment, decision) : attachment,
        ),
      ]
    }

    const sourcePath = normalizedFilePartSourcePath({
      directory: input.directory,
      part,
    })
    if (!sourcePath) return [part]

    const decision = decisions.get(sourcePath)
    if (decision?.delivery !== "model-and-resource" || retainedNativePdfPaths.has(sourcePath)) {
      return []
    }

    retainedNativePdfPaths.add(sourcePath)
    return [part]
  })
}
