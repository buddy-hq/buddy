import { constants as fileSystemConstants } from "node:fs"
import { copyFile, link, mkdir, stat, unlink } from "node:fs/promises"
import { randomBytes, randomUUID } from "node:crypto"
import path from "node:path"
import {
  NATIVE_RESOURCE_FORMATS,
  nativeResourceDefinitionFromPath,
  type NativeResourceFormat,
} from "@buddy/workspace-file-policy"
import { RESOURCE_MAX_SOURCE_BYTES } from "../resource-packs/budgets"

const NOTEBOOK_UPLOAD_DIRECTORY = "uploads"
const NOTEBOOK_UPLOAD_ID_LENGTH = 10
const NOTEBOOK_UPLOAD_RANDOM_BYTES = 8
const NOTEBOOK_UPLOAD_MAX_PUBLISH_ATTEMPTS = 32
const NOTEBOOK_UPLOAD_MAX_STEM_LENGTH = 120
const NOTEBOOK_UPLOAD_PARTIAL_PREFIX = ".buddy-upload-"
const NOTEBOOK_UPLOAD_PARTIAL_SUFFIX = ".partial"
const NOTEBOOK_UPLOAD_SOURCE_TOO_LARGE_MESSAGE =
  "The selected file exceeds the 64 MiB document limit."
const NOTEBOOK_UPLOAD_SUPPORTED_FORMATS_MESSAGE =
  `Supported document formats are ${NATIVE_RESOURCE_FORMATS.map((format) => format.toUpperCase()).join(", ")}.`
const UNSAFE_UPLOAD_STEM_CHARACTERS = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*'])
const TRAILING_UPLOAD_STEM_CHARACTERS = /[ .]+$/u

export type NotebookUpload = {
  uploadID: string
  displayName: string
  format: NativeResourceFormat
  mime: string
  workspacePath: string
  absolutePath: string
  sizeBytes: number
}

export type NotebookUploadErrorCode =
  | "invalid-source"
  | "unsupported-format"
  | "source-too-large"
  | "publish-collision"

export class NotebookUploadError extends Error {
  readonly code: NotebookUploadErrorCode

  constructor(code: NotebookUploadErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = "NotebookUploadError"
    this.code = code
  }
}

function createUploadID(): string {
  return randomBytes(NOTEBOOK_UPLOAD_RANDOM_BYTES)
    .toString("base64url")
    .slice(0, NOTEBOOK_UPLOAD_ID_LENGTH)
}

function uploadStem(displayName: string): string {
  const rawStem = path.parse(displayName).name
  const safeStem = Array.from(rawStem, (character) =>
    UNSAFE_UPLOAD_STEM_CHARACTERS.has(character) || (character.codePointAt(0) ?? 0) <= 31
      ? "-"
      : character,
  ).join("")
  const sanitized = safeStem
    .replace(TRAILING_UPLOAD_STEM_CHARACTERS, "")
    .slice(0, NOTEBOOK_UPLOAD_MAX_STEM_LENGTH)
  return sanitized || "resource"
}

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined
  return typeof error.code === "string" ? error.code : undefined
}

async function removePartialFile(partialPath: string): Promise<void> {
  try {
    await unlink(partialPath)
  } catch (error) {
    if (errorCode(error) !== "ENOENT") throw error
  }
}

async function publishUpload(input: {
  partialPath: string
  uploadDirectory: string
  stem: string
  extension: string
}): Promise<{ uploadID: string; absolutePath: string }> {
  for (let attempt = 0; attempt < NOTEBOOK_UPLOAD_MAX_PUBLISH_ATTEMPTS; attempt += 1) {
    const uploadID = createUploadID()
    const absolutePath = path.join(
      input.uploadDirectory,
      `${input.stem}--${uploadID}${input.extension}`,
    )
    try {
      await link(input.partialPath, absolutePath)
      return { uploadID, absolutePath }
    } catch (error) {
      if (errorCode(error) === "EEXIST") continue
      throw error
    }
  }

  throw new NotebookUploadError(
    "publish-collision",
    "Could not allocate a unique notebook upload filename. Try again.",
  )
}

export async function copyNativeResourceToNotebook(input: {
  directory: string
  sourcePath: string
}): Promise<NotebookUpload> {
  const sourcePath = path.resolve(input.sourcePath)
  const displayName = path.basename(sourcePath)
  const definition = nativeResourceDefinitionFromPath(displayName)
  if (!definition) {
    throw new NotebookUploadError(
      "unsupported-format",
      NOTEBOOK_UPLOAD_SUPPORTED_FORMATS_MESSAGE,
    )
  }

  let sourceStats
  try {
    sourceStats = await stat(sourcePath)
  } catch (error) {
    throw new NotebookUploadError(
      "invalid-source",
      `The selected file is not available: ${displayName}`,
      { cause: error },
    )
  }
  if (!sourceStats.isFile()) {
    throw new NotebookUploadError(
      "invalid-source",
      `The selected path is not a regular file: ${displayName}`,
    )
  }
  if (sourceStats.size > RESOURCE_MAX_SOURCE_BYTES) {
    throw new NotebookUploadError(
      "source-too-large",
      NOTEBOOK_UPLOAD_SOURCE_TOO_LARGE_MESSAGE,
    )
  }

  const uploadDirectory = path.join(input.directory, NOTEBOOK_UPLOAD_DIRECTORY)
  await mkdir(uploadDirectory, { recursive: true })
  const partialPath = path.join(
    uploadDirectory,
    `${NOTEBOOK_UPLOAD_PARTIAL_PREFIX}${randomUUID()}${NOTEBOOK_UPLOAD_PARTIAL_SUFFIX}`,
  )

  try {
    await copyFile(sourcePath, partialPath, fileSystemConstants.COPYFILE_EXCL)
    const copiedStats = await stat(partialPath)
    if (copiedStats.size > RESOURCE_MAX_SOURCE_BYTES) {
      throw new NotebookUploadError(
        "source-too-large",
        NOTEBOOK_UPLOAD_SOURCE_TOO_LARGE_MESSAGE,
      )
    }
    const published = await publishUpload({
      partialPath,
      uploadDirectory,
      stem: uploadStem(displayName),
      extension: definition.extension,
    })
    await removePartialFile(partialPath)

    return {
      uploadID: published.uploadID,
      displayName,
      format: definition.format,
      mime: definition.mime,
      workspacePath: path.posix.join(NOTEBOOK_UPLOAD_DIRECTORY, path.basename(published.absolutePath)),
      absolutePath: published.absolutePath,
      sizeBytes: copiedStats.size,
    }
  } catch (error) {
    await removePartialFile(partialPath)
    if (error instanceof NotebookUploadError) throw error
    throw new NotebookUploadError("invalid-source", `Could not copy ${displayName}.`, {
      cause: error,
    })
  }
}
