import { stat } from "node:fs/promises"
import path from "node:path"
import z from "zod"
import {
  NATIVE_RESOURCE_ATTACHMENT_MAX_COUNT,
  NATIVE_RESOURCE_FORMATS,
  isNativeResourceFormat,
  nativeResourceDefinitionForFormat,
  nativeResourceFormatFromPath,
  type NativeResourceDelivery,
  type NativeResourceFormat,
} from "@buddy/workspace-file-policy"
import { SessionTransformValidationError } from "../../session"
import { NATIVE_RESOURCE_ATTACHMENT_PART_TYPE } from "./native-resource-metadata"
import {
  parseJsonObject,
  parsePromptString,
  type TJsonObject,
  type TPromptPart,
} from "./utils"

export { NATIVE_RESOURCE_ATTACHMENT_PART_TYPE } from "./native-resource-metadata"

const NATIVE_RESOURCE_ATTACHMENT_MAX_FILENAME_CHARS = 255
const NATIVE_RESOURCE_ATTACHMENT_MAX_ALIAS_CHARS = 255
const NATIVE_RESOURCE_ATTACHMENT_MAX_PATH_CHARS = 4_096
const NOTEBOOK_UPLOAD_DIRECTORY = "uploads"

const NativeResourceDeliverySchema = z.enum(["model-and-resource", "resource-only"])
const NativeResourceFormatSchema = z.enum(NATIVE_RESOURCE_FORMATS)
const NativeResourcePromptAttachmentSchema = z.object({
  type: z.literal(NATIVE_RESOURCE_ATTACHMENT_PART_TYPE),
  filename: z.string(),
  sourcePath: z.string(),
  format: NativeResourceFormatSchema,
  alias: z.string(),
  mime: z.string(),
  delivery: NativeResourceDeliverySchema,
  pageCount: z.number().int().positive().optional(),
})

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

export function isNativeResourceAttachmentPart<T>(
  value: T,
): value is T & NativeResourcePromptAttachment {
  const object = parseJsonObject(value)
  return object !== undefined && object.type === NATIVE_RESOURCE_ATTACHMENT_PART_TYPE
}

export function readNativeResourcePromptAttachment<T>(value: T): NativeResourcePromptAttachment {
  const parsed = NativeResourcePromptAttachmentSchema.safeParse(value)
  if (!parsed.success) {
    throw new SessionTransformValidationError("native resource attachment metadata is invalid")
  }
  const attachment: NativeResourcePromptAttachment = {
    type: parsed.data.type,
    filename: parsed.data.filename,
    sourcePath: parsed.data.sourcePath,
    format: parsed.data.format,
    alias: parsed.data.alias,
    mime: parsed.data.mime,
    delivery: parsed.data.delivery,
  }
  return Object.assign(
    attachment,
    parsed.data.pageCount !== undefined ? { pageCount: parsed.data.pageCount } : undefined,
  )
}

export function nativeResourcePromptAttachmentsFromParts(
  parts: readonly TPromptPart[],
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

export function nativeResourceAttachmentPromptPart(attachment: NativeResourcePromptAttachment) {
  return Object.assign(
    {
      type: attachment.type,
      filename: attachment.filename,
      sourcePath: attachment.sourcePath,
      format: attachment.format,
      alias: attachment.alias,
      mime: attachment.mime,
      delivery: attachment.delivery,
    },
    attachment.pageCount !== undefined ? { pageCount: attachment.pageCount } : undefined,
  )
}

function requiredBoundedString(value: TJsonObject, key: string, maxCharacters: number): string {
  const candidate = parsePromptString(value[key])
  if (candidate === undefined || candidate.trim().length === 0) {
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

export async function normalizeNativeResourceAttachmentPart<T>(input: {
  directory: string
  value: T
}): Promise<NativeResourcePromptAttachment> {
  const object = parseJsonObject(input.value)
  if (object === undefined) {
    throw new SessionTransformValidationError("native resource attachment must be an object")
  }
  if (object.type !== NATIVE_RESOURCE_ATTACHMENT_PART_TYPE) {
    throw new SessionTransformValidationError("native resource attachment type is invalid")
  }

  const filename = requiredBoundedString(
    object,
    "filename",
    NATIVE_RESOURCE_ATTACHMENT_MAX_FILENAME_CHARS,
  )
  const sourcePathValue = requiredBoundedString(
    object,
    "sourcePath",
    NATIVE_RESOURCE_ATTACHMENT_MAX_PATH_CHARS,
  )
  const alias = requiredBoundedString(object, "alias", NATIVE_RESOURCE_ATTACHMENT_MAX_ALIAS_CHARS)
  const formatValue = parsePromptString(object.format)
  if (formatValue === undefined || !isNativeResourceFormat(formatValue)) {
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

  const definition = nativeResourceDefinitionForFormat(formatValue)
  return {
    type: NATIVE_RESOURCE_ATTACHMENT_PART_TYPE,
    filename,
    sourcePath,
    format: formatValue,
    alias,
    mime: definition.mime,
    delivery: definition.delivery,
  }
}
