import { stat } from "node:fs/promises"
import path from "node:path"
import {
  NATIVE_RESOURCE_ATTACHMENT_MAX_COUNT,
  isNativeResourceFormat,
  nativeResourceDefinitionForFormat,
  nativeResourceFormatFromPath,
  type NativeResourceDelivery,
  type NativeResourceFormat,
} from "@buddy/workspace-file-policy"
import { SessionTransformValidationError } from "../../session"
import { NATIVE_RESOURCE_ATTACHMENT_PART_TYPE } from "./native-resource-metadata"

export { NATIVE_RESOURCE_ATTACHMENT_PART_TYPE } from "./native-resource-metadata"
const NATIVE_RESOURCE_ATTACHMENT_MAX_FILENAME_CHARS = 255
const NATIVE_RESOURCE_ATTACHMENT_MAX_ALIAS_CHARS = 255
const NATIVE_RESOURCE_ATTACHMENT_MAX_PATH_CHARS = 4_096
const NOTEBOOK_UPLOAD_DIRECTORY = "uploads"

export type NativeResourcePromptAttachment = {
  type: typeof NATIVE_RESOURCE_ATTACHMENT_PART_TYPE
  filename: string
  sourcePath: string
  format: NativeResourceFormat
  alias: string
  mime: string
  delivery: NativeResourceDelivery
  pageCount?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function isNativeResourceAttachmentPart(
  value: unknown,
): value is Record<string, unknown> & { type: typeof NATIVE_RESOURCE_ATTACHMENT_PART_TYPE } {
  return isRecord(value) && value.type === NATIVE_RESOURCE_ATTACHMENT_PART_TYPE
}

export function readNativeResourcePromptAttachment(
  value: Record<string, unknown>,
): NativeResourcePromptAttachment {
  if (
    value.type !== NATIVE_RESOURCE_ATTACHMENT_PART_TYPE ||
    typeof value.filename !== "string" ||
    typeof value.sourcePath !== "string" ||
    typeof value.format !== "string" ||
    !isNativeResourceFormat(value.format) ||
    typeof value.alias !== "string" ||
    typeof value.mime !== "string" ||
    (value.delivery !== "model-and-resource" && value.delivery !== "resource-only") ||
    (value.pageCount !== undefined &&
      (typeof value.pageCount !== "number" ||
        !Number.isSafeInteger(value.pageCount) ||
        value.pageCount <= 0))
  ) {
    throw new SessionTransformValidationError("native resource attachment metadata is invalid")
  }
  const attachment: NativeResourcePromptAttachment = {
    type: NATIVE_RESOURCE_ATTACHMENT_PART_TYPE,
    filename: value.filename,
    sourcePath: value.sourcePath,
    format: value.format,
    alias: value.alias,
    mime: value.mime,
    delivery: value.delivery,
  }
  return Object.assign(
    attachment,
    typeof value.pageCount === "number" ? { pageCount: value.pageCount } : undefined,
  )
}

export function nativeResourcePromptAttachmentsFromParts(
  parts: readonly Record<string, unknown>[],
): NativeResourcePromptAttachment[] {
  const attachments = parts.flatMap((part) =>
    isNativeResourceAttachmentPart(part) ? [readNativeResourcePromptAttachment(part)] : [],
  )
  if (attachments.length > NATIVE_RESOURCE_ATTACHMENT_MAX_COUNT) {
    throw new SessionTransformValidationError(
      `A prompt can prepare at most ${NATIVE_RESOURCE_ATTACHMENT_MAX_COUNT} native resources.`,
    )
  }
  return attachments
}

function requiredBoundedString(
  value: Record<string, unknown>,
  key: string,
  maxCharacters: number,
): string {
  const candidate = value[key]
  if (typeof candidate !== "string" || candidate.trim().length === 0) {
    throw new SessionTransformValidationError(`native resource ${key} is required`)
  }
  const trimmed = candidate.trim()
  if (trimmed.length > maxCharacters) {
    throw new SessionTransformValidationError(`native resource ${key} is too long`)
  }
  return trimmed
}

function isPathInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child)
  return relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative)
}

export async function normalizeNativeResourceAttachmentPart(input: {
  directory: string
  value: unknown
}): Promise<NativeResourcePromptAttachment> {
  if (!isRecord(input.value)) {
    throw new SessionTransformValidationError("native resource attachment must be an object")
  }
  if (input.value.type !== NATIVE_RESOURCE_ATTACHMENT_PART_TYPE) {
    throw new SessionTransformValidationError("native resource attachment type is invalid")
  }

  const filename = requiredBoundedString(
    input.value,
    "filename",
    NATIVE_RESOURCE_ATTACHMENT_MAX_FILENAME_CHARS,
  )
  const sourcePathValue = requiredBoundedString(
    input.value,
    "sourcePath",
    NATIVE_RESOURCE_ATTACHMENT_MAX_PATH_CHARS,
  )
  const alias = requiredBoundedString(
    input.value,
    "alias",
    NATIVE_RESOURCE_ATTACHMENT_MAX_ALIAS_CHARS,
  )
  const formatValue = input.value.format
  if (typeof formatValue !== "string" || !isNativeResourceFormat(formatValue)) {
    throw new SessionTransformValidationError("native resource format is invalid")
  }

  const sourcePath = path.resolve(sourcePathValue)
  const uploadsDirectory = path.resolve(input.directory, NOTEBOOK_UPLOAD_DIRECTORY)
  if (!isPathInside(uploadsDirectory, sourcePath)) {
    throw new SessionTransformValidationError(
      "native resource sourcePath must identify a completed notebook upload",
    )
  }
  if (nativeResourceFormatFromPath(sourcePath) !== formatValue) {
    throw new SessionTransformValidationError(
      "native resource format does not match its uploaded filename",
    )
  }
  const sourceStats = await stat(sourcePath).catch(() => undefined)
  if (!sourceStats?.isFile()) {
    throw new SessionTransformValidationError("native resource upload is not available")
  }

  return {
    type: NATIVE_RESOURCE_ATTACHMENT_PART_TYPE,
    filename,
    sourcePath,
    format: formatValue,
    alias,
    mime: nativeResourceDefinitionForFormat(formatValue).mime,
    delivery: nativeResourceDefinitionForFormat(formatValue).delivery,
  }
}
