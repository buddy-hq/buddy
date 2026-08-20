import os from "node:os"
import path from "node:path"
import { promises as fs } from "node:fs"
import { pathToFileURL } from "node:url"
import {
  READER_ANCHOR_KIND_CFI_TEXT,
  readReaderTextAnchor,
  type ReaderTextAnchor,
} from "@buddy/reader-contract"
import { Agent } from "@buddy/opencode-adapter/agent"
import { SessionTransformValidationError } from "../../session"
import { resolveResourceReference } from "../../resources/resource-registry-service"
import { getOpenCodeClient } from "../../opencode-runtime/client"
import { syncOpenCodeProjectConfig } from "../../config/runtime"
import { extractSdkErrorMessage } from "../../http/sdk-response"
import {
  isNativeResourceAttachmentPart,
  nativeResourceAttachmentPromptPart,
  normalizeNativeResourceAttachmentPart,
  readNativeResourcePromptAttachment,
} from "./native-resource-attachments"
import { BUDDY_PROMPT_PART_METADATA_KEY } from "./native-resource-metadata"
import {
  parseJsonObject,
  parseNonEmptyPromptString,
  parsePromptString,
  parsePromptStringList,
  type TJsonObject,
  type TJsonValue,
  type TPromptPart,
} from "./utils"

// Sync with packages/web/src/components/prompt/prompt-types.ts.
export const OPENCODE_REFERENCE_PART_TYPE = "opencode-reference" as const
// Sync with packages/web/src/components/prompt/prompt-types.ts.
export const WORKSPACE_FILE_REFERENCE_PART_TYPE = "workspace-file-reference" as const
// Sync with packages/web/src/components/prompt/prompt-types.ts.
export const RESOURCE_REFERENCE_PART_TYPE = "resource-reference" as const
// Sync with packages/web/src/components/prompt/prompt-types.ts.
export const READING_SELECTION_PART_TYPE = "reading-selection" as const
// Sync with packages/web/src/components/prompt/prompt-types.ts.
export const SELECTION_CONTEXT_PART_TYPE = "selection-context" as const
export { BUDDY_PROMPT_PART_METADATA_KEY } from "./native-resource-metadata"
// Sync with packages/web/src/components/prompt/prompt-types.ts.
export const TEXT_FILE_ATTACHMENT_PART_TYPE = "text-file-attachment" as const
export const PROMPT_WORKSPACE_FILE_REFERENCE_REGEX =
  /(?<![\w`])@(?:"([^"\n]+)"|`([^`\n]+)`|(\.?[^\s`,.]+(?:\.[^\s`,.]+)*))/g
const PROMPT_PART_TYPE_TEXT = "text" as const
const PROMPT_PART_TYPE_FILE = "file" as const
const PROMPT_PART_TYPE_AGENT = "agent" as const
const FILE_MIME_TEXT = "text/plain" as const
const FILE_MIME_DIRECTORY = "application/x-directory" as const
const RESOURCE_REFERENCE_NOT_FOUND =
  "Resource reference was not found. Add it first with /resource add." as const
const RESOURCE_REFERENCE_NOT_READY =
  "Resource is not ready yet. Run /resource rebuild or wait for preparation." as const
const RESOURCE_REFERENCE_INVALID_PACK = "Resource pack is invalid. Run /resource rebuild." as const

export type WorkspaceFileReferencePart = {
  type: typeof WORKSPACE_FILE_REFERENCE_PART_TYPE
  path: string
}

export type OpenCodeReferencePart = {
  type: typeof OPENCODE_REFERENCE_PART_TYPE
  name: string
  path: string
}

export type ResourceReferencePart = {
  type: typeof RESOURCE_REFERENCE_PART_TYPE
  key: string
}

export type ReadingSelectionPart = {
  type: typeof READING_SELECTION_PART_TYPE
  text: string
  selectionKey?: string
  resourceKey?: string
  anchor: ReaderTextAnchor
  tocLabel?: string
  pageLabel?: string
  locationLabel?: string
}

export type ReadingSelectionContextPart = {
  type: typeof SELECTION_CONTEXT_PART_TYPE
  source: "reading"
  text: string
  selectionKey: string
  resourceKey?: string
  anchor: ReaderTextAnchor
  tocLabel?: string
  pageLabel?: string
  locationLabel?: string
}

export type MarkdownSelectionContextPart = {
  type: typeof SELECTION_CONTEXT_PART_TYPE
  source: "markdown"
  text: string
  selectionKey: string
  path?: string
  version?: string
  headingPath?: string[]
}

export type SelectionContextPart = ReadingSelectionContextPart | MarkdownSelectionContextPart

type TPromptTextPart = TPromptPart & {
  type: typeof PROMPT_PART_TYPE_TEXT
}

export async function normalizePromptParts(input: {
  directory: string
  content: string
  parts: readonly TJsonValue[]
}): Promise<TPromptPart[]> {
  const normalizedParts: TPromptPart[] = []

  if (input.content.trim().length > 0) {
    normalizedParts.push(
      ...(await expandPromptTextPart({
        directory: input.directory,
        part: {
          type: PROMPT_PART_TYPE_TEXT,
          text: input.content,
        },
      })),
    )
  }

  for (const part of input.parts) {
    if (isNativeResourceAttachmentPart(part)) {
      normalizedParts.push(
        nativeResourceAttachmentPromptPart(
          await normalizeNativeResourceAttachmentPart({
            directory: input.directory,
            value: part,
          }),
        ),
      )
      continue
    }

    const openCodeReference = parseOpenCodeReferencePart(part)
    if (openCodeReference) {
      normalizedParts.push(
        await expandOpenCodeReferencePart({
          directory: input.directory,
          part: openCodeReference,
        }),
      )
      continue
    }

    const workspaceFileReference = parseWorkspaceFileReferencePart(part)
    if (workspaceFileReference) {
      normalizedParts.push(
        ...(await expandWorkspaceFileReferencePart({
          directory: input.directory,
          part: workspaceFileReference,
        })),
      )
      continue
    }

    const resourceReference = parseResourceReferencePart(part)
    if (resourceReference) {
      normalizedParts.push(
        ...(await expandResourceReferencePart({
          directory: input.directory,
          part: resourceReference,
        })),
      )
      continue
    }

    const textPart = parsePromptTextPart(part)
    if (textPart) {
      normalizedParts.push(
        ...(await expandPromptTextPart({
          directory: input.directory,
          part: textPart,
        })),
      )
      continue
    }

    const readingSelection = parseReadingSelectionPart(part)
    if (readingSelection) {
      normalizedParts.push(readingSelectionPromptPart(normalizeReadingSelectionPart(readingSelection)))
      continue
    }

    const selectionContext = parseSelectionContextPart(part)
    if (selectionContext) {
      normalizedParts.push(
        selectionContextPromptPart(normalizeSelectionContextPart(selectionContext)),
      )
      continue
    }

    const object = parseJsonObject(part)
    if (object !== undefined) {
      normalizedParts.push({ ...object })
    }
  }

  if (normalizedParts.length === 0) {
    throw new SessionTransformValidationError("content or parts must be provided")
  }

  return normalizedParts
}

async function expandOpenCodeReferencePart(input: {
  directory: string
  part: OpenCodeReferencePart
}): Promise<TPromptPart> {
  let reference = await findOpenCodeReference(input)
  if (!reference) {
    await syncOpenCodeProjectConfig(input.directory, true)
    reference = await findOpenCodeReference(input)
  }

  if (!reference) {
    throw new SessionTransformValidationError(
      `Workspace reference is no longer available: ${input.part.name}`,
    )
  }

  const referenceStat = await fs.stat(reference.path).catch(() => undefined)
  if (!referenceStat?.isDirectory()) {
    throw new SessionTransformValidationError(
      `Workspace reference is not ready: ${input.part.name}`,
    )
  }

  return createVendorFilePart({
    filePath: reference.path,
    filename: reference.name,
    mime: FILE_MIME_DIRECTORY,
  })
}

async function findOpenCodeReference(input: {
  directory: string
  part: OpenCodeReferencePart
}) {
  const client = await getOpenCodeClient(input.directory)
  const result = await client.v2.reference.list()
  if (result.error !== undefined) {
    throw new SessionTransformValidationError(
      extractSdkErrorMessage(result.error) ?? "Failed to resolve workspace reference",
    )
  }

  return result.data?.data.find(
    (candidate) =>
      candidate.name === input.part.name &&
      candidate.path === input.part.path &&
      candidate.hidden !== true,
  )
}

async function expandPromptTextPart(input: {
  directory: string
  part: TPromptTextPart
}): Promise<TPromptPart[]> {
  const text = promptTextValue(input.part)
  if (text === undefined || text.length === 0) {
    return []
  }

  if (isTextFileAttachmentPromptPart(input.part)) {
    return [normalizePromptTextPart(input.part, text)]
  }

  const hasReference = PROMPT_WORKSPACE_FILE_REFERENCE_REGEX.test(text)
  PROMPT_WORKSPACE_FILE_REFERENCE_REGEX.lastIndex = 0
  if (!hasReference) {
    return [normalizePromptTextPart(input.part, text)]
  }

  const pieces: TPromptPart[] = []
  let cursor = 0

  for (const match of text.matchAll(PROMPT_WORKSPACE_FILE_REFERENCE_REGEX)) {
    const token = match[0] ?? ""
    const rawReference = (match[1] ?? match[2] ?? match[3] ?? "").trim()
    const tokenStart = match.index ?? 0

    if (tokenStart > cursor) {
      const leadingText = text.slice(cursor, tokenStart)
      if (leadingText.length > 0) {
        pieces.push(normalizePromptTextPart(input.part, leadingText))
      }
    }

    const resolvedParts = await resolveWorkspaceReference({
      directory: input.directory,
      rawPath: rawReference,
      source: "raw",
    })
    if (resolvedParts.length > 0) {
      pieces.push(...resolvedParts)
    } else {
      pieces.push(normalizePromptTextPart(input.part, token))
    }
    cursor = tokenStart + token.length
  }

  if (cursor < text.length) {
    const trailingText = text.slice(cursor)
    if (trailingText.length > 0) {
      pieces.push(normalizePromptTextPart(input.part, trailingText))
    }
  }

  return pieces
}

async function expandWorkspaceFileReferencePart(input: {
  directory: string
  part: WorkspaceFileReferencePart
}): Promise<TPromptPart[]> {
  return resolveWorkspaceReference({
    directory: input.directory,
    rawPath: input.part.path,
    source: "explicit",
  })
}

async function expandResourceReferencePart(input: {
  directory: string
  part: ResourceReferencePart
}): Promise<TPromptPart[]> {
  const key = input.part.key.trim()
  if (!key) {
    throw new SessionTransformValidationError("resource-reference key is required")
  }

  const resolved = await resolveResourceReference({
    directory: input.directory,
    key,
  })

  if (!resolved.ok) {
    if (resolved.reason === "not_found") {
      throw new SessionTransformValidationError(RESOURCE_REFERENCE_NOT_FOUND)
    }
    if (resolved.reason === "not_ready") {
      throw new SessionTransformValidationError(RESOURCE_REFERENCE_NOT_READY)
    }
    throw new SessionTransformValidationError(RESOURCE_REFERENCE_INVALID_PACK)
  }

  const fileParts = [
    createVendorFilePart({
      filePath: resolved.entrypointPath,
      filename: relativeDisplayPath(input.directory, resolved.entrypointPath),
      mime: FILE_MIME_TEXT,
    }),
  ]

  if (resolved.tocPath) {
    fileParts.push(
      createVendorFilePart({
        filePath: resolved.tocPath,
        filename: relativeDisplayPath(input.directory, resolved.tocPath),
        mime: FILE_MIME_TEXT,
      }),
    )
  }

  return fileParts
}

async function resolveWorkspaceReference(input: {
  directory: string
  rawPath: string
  source: "raw" | "explicit"
}): Promise<TPromptPart[]> {
  const resolvedPath = resolveWorkspacePath(input.directory, input.rawPath)
  const isWorkspaceScopedPath =
    isWorkspaceRelativePath(input.rawPath) && isPathInsideWorkspace(input.directory, resolvedPath)
  if (!isWorkspaceScopedPath) {
    if (input.source === "explicit") {
      throw new SessionTransformValidationError(
        `workspace-file-reference path must be workspace-relative: ${input.rawPath}`,
      )
    }
    const agentName = await resolveAgentReferenceName(input.rawPath)
    if (agentName) {
      return [createVendorAgentPart(agentName)]
    }
    return []
  }

  const stat = await fs.stat(resolvedPath).catch(() => undefined)
  if (!stat) {
    if (input.source === "raw") {
      const agentName = await resolveAgentReferenceName(input.rawPath)
      if (agentName) {
        return [createVendorAgentPart(agentName)]
      }
      return []
    }
    throw new SessionTransformValidationError(`Referenced file not found: ${input.rawPath}`)
  }

  if (stat.isDirectory()) {
    return [
      createVendorFilePart({
        filePath: resolvedPath,
        filename: relativeDisplayPath(input.directory, resolvedPath),
        mime: FILE_MIME_DIRECTORY,
      }),
    ]
  }

  return [
    createVendorFilePart({
      filePath: resolvedPath,
      filename: relativeDisplayPath(input.directory, resolvedPath),
      mime: FILE_MIME_TEXT,
    }),
  ]
}

function createVendorFilePart(input: { filePath: string; filename: string; mime: string }) {
  return {
    type: PROMPT_PART_TYPE_FILE,
    url: pathToFileURL(path.resolve(input.filePath)).href,
    filename: input.filename,
    mime: input.mime,
  }
}

function createVendorAgentPart(name: string) {
  return {
    type: PROMPT_PART_TYPE_AGENT,
    name,
  }
}

function resolveWorkspacePath(directory: string, rawPath: string) {
  if (rawPath.startsWith("~/")) {
    return path.join(os.homedir(), rawPath.slice(2))
  }

  if (path.isAbsolute(rawPath)) {
    return rawPath
  }

  return path.resolve(directory, rawPath)
}

function relativeDisplayPath(directory: string, filePath: string) {
  const relpath = path.relative(directory, filePath)
  return relpath.length > 0 ? relpath : path.basename(filePath)
}

function promptTextValue(part: TPromptPart) {
  return parsePromptString(part.text) ?? parsePromptString(part.content)
}

function normalizePromptTextPart(part: TPromptPart, text: string) {
  return {
    ...stripPromptTextValues(part),
    type: PROMPT_PART_TYPE_TEXT,
    text,
  }
}

function stripPromptTextValues(part: TPromptPart) {
  const next = { ...part }
  delete next.content
  delete next.text
  return next
}

function parsePromptTextPart<T>(part: T): TPromptTextPart | undefined {
  const object = parseJsonObject(part)
  if (object === undefined || object.type !== PROMPT_PART_TYPE_TEXT) return undefined
  if (parsePromptString(object.text) === undefined && parsePromptString(object.content) === undefined) {
    return undefined
  }
  return Object.assign(object, { type: PROMPT_PART_TYPE_TEXT })
}

function isTextFileAttachmentPromptPart(part: TPromptPart) {
  const metadataContainer = parseJsonObject(part.metadata)
  if (metadataContainer === undefined) return false
  const metadata = parseJsonObject(metadataContainer[BUDDY_PROMPT_PART_METADATA_KEY])
  const filename = parsePromptString(metadata?.filename)
  const mime = parsePromptString(metadata?.mime)
  return (
    metadata !== undefined &&
    metadata.type === TEXT_FILE_ATTACHMENT_PART_TYPE &&
    filename !== undefined &&
    filename.length > 0 &&
    mime !== undefined &&
    mime.length > 0
  )
}

function parseOpenCodeReferencePart<T>(part: T): OpenCodeReferencePart | undefined {
  const object = parseJsonObject(part)
  const name = parsePromptString(object?.name)
  const pathValue = parsePromptString(object?.path)
  if (object === undefined || object.type !== OPENCODE_REFERENCE_PART_TYPE) return undefined
  if (name === undefined || pathValue === undefined) return undefined
  return {
    type: OPENCODE_REFERENCE_PART_TYPE,
    name,
    path: pathValue,
  }
}

function parseWorkspaceFileReferencePart<T>(part: T): WorkspaceFileReferencePart | undefined {
  const object = parseJsonObject(part)
  const pathValue = parsePromptString(object?.path)
  if (object === undefined || object.type !== WORKSPACE_FILE_REFERENCE_PART_TYPE) return undefined
  if (pathValue === undefined) return undefined
  return {
    type: WORKSPACE_FILE_REFERENCE_PART_TYPE,
    path: pathValue,
  }
}

function parseResourceReferencePart<T>(part: T): ResourceReferencePart | undefined {
  const object = parseJsonObject(part)
  const key = parsePromptString(object?.key)
  if (object === undefined || object.type !== RESOURCE_REFERENCE_PART_TYPE) return undefined
  if (key === undefined) return undefined
  return {
    type: RESOURCE_REFERENCE_PART_TYPE,
    key,
  }
}

function parseReadingSelectionPart<T>(part: T): TJsonObject | undefined {
  const object = parseJsonObject(part)
  if (object === undefined || object.type !== READING_SELECTION_PART_TYPE) return undefined
  if (parsePromptString(object.text) === undefined) return undefined
  return object
}

function parseSelectionContextPart<T>(part: T): TJsonObject | undefined {
  const object = parseJsonObject(part)
  if (object === undefined || object.type !== SELECTION_CONTEXT_PART_TYPE) return undefined
  if (object.source !== "reading" && object.source !== "markdown") return undefined
  if (parsePromptString(object.text) === undefined) return undefined
  if (parsePromptString(object.selectionKey) === undefined) return undefined
  if (object.headingPath !== undefined && parsePromptStringList(object.headingPath) === undefined) {
    return undefined
  }
  return object
}

function readSelectionTextAnchor(value: TJsonValue | undefined): ReaderTextAnchor | undefined {
  const object = parseJsonObject(value)
  if (object === undefined) return undefined
  if (object.anchor !== undefined) return readReaderTextAnchor(object.anchor)
  const cfi = parsePromptString(object.cfi)
  if (cfi === undefined) return undefined

  return readReaderTextAnchor(
    Object.assign(
      {
        kind: READER_ANCHOR_KIND_CFI_TEXT,
        cfi,
      },
      object.index !== undefined ? { sectionIndex: object.index } : undefined,
    ),
  )
}

function readingSelectionPromptPart(part: ReadingSelectionPart): TPromptPart {
  return Object.assign(
    {
      type: part.type,
      text: part.text,
      anchor: part.anchor,
    },
    part.selectionKey !== undefined ? { selectionKey: part.selectionKey } : undefined,
    part.resourceKey !== undefined ? { resourceKey: part.resourceKey } : undefined,
    part.tocLabel !== undefined ? { tocLabel: part.tocLabel } : undefined,
    part.pageLabel !== undefined ? { pageLabel: part.pageLabel } : undefined,
    part.locationLabel !== undefined ? { locationLabel: part.locationLabel } : undefined,
  )
}

function selectionContextPromptPart(part: SelectionContextPart): TPromptPart {
  if (part.source === "markdown") {
    return Object.assign(
      {
        type: part.type,
        source: part.source,
        text: part.text,
        selectionKey: part.selectionKey,
      },
      part.path !== undefined ? { path: part.path } : undefined,
      part.version !== undefined ? { version: part.version } : undefined,
      part.headingPath !== undefined ? { headingPath: part.headingPath } : undefined,
    )
  }
  return Object.assign(
    {
      type: part.type,
      source: part.source,
      text: part.text,
      selectionKey: part.selectionKey,
      anchor: part.anchor,
    },
    part.resourceKey !== undefined ? { resourceKey: part.resourceKey } : undefined,
    part.tocLabel !== undefined ? { tocLabel: part.tocLabel } : undefined,
    part.pageLabel !== undefined ? { pageLabel: part.pageLabel } : undefined,
    part.locationLabel !== undefined ? { locationLabel: part.locationLabel } : undefined,
  )
}

function normalizeReadingSelectionPart(part: TJsonObject): ReadingSelectionPart {
  const text = parsePromptString(part.text)?.trim()
  if (!text) {
    throw new SessionTransformValidationError("reading-selection text is required")
  }
  const anchor = readSelectionTextAnchor(part)
  if (!anchor) {
    throw new SessionTransformValidationError("reading-selection anchor is required")
  }

  const normalized: ReadingSelectionPart = {
    type: READING_SELECTION_PART_TYPE,
    text,
    anchor,
  }
  const selectionKey = parseNonEmptyPromptString(part.selectionKey)
  const resourceKey = parseNonEmptyPromptString(part.resourceKey)
  const tocLabel = parseNonEmptyPromptString(part.tocLabel)
  const pageLabel = parseNonEmptyPromptString(part.pageLabel)
  const locationLabel = parseNonEmptyPromptString(part.locationLabel)
  return Object.assign(
    Object.assign(
      normalized,
      selectionKey !== undefined ? { selectionKey } : undefined,
      resourceKey !== undefined ? { resourceKey } : undefined,
      tocLabel !== undefined ? { tocLabel } : undefined,
    ),
    pageLabel !== undefined ? { pageLabel } : undefined,
    locationLabel !== undefined ? { locationLabel } : undefined,
  )
}

function normalizeSelectionContextPart(part: TJsonObject): SelectionContextPart {
  const text = parsePromptString(part.text)?.trim()
  if (!text) {
    throw new SessionTransformValidationError("selection-context text is required")
  }

  const selectionKey = parsePromptString(part.selectionKey)?.trim()
  if (!selectionKey) {
    throw new SessionTransformValidationError("selection-context selectionKey is required")
  }
  if (part.source === "markdown") {
    const markdownPart: MarkdownSelectionContextPart = {
      type: SELECTION_CONTEXT_PART_TYPE,
      source: "markdown",
      text,
      selectionKey,
    }
    const headingPath = parsePromptStringList(part.headingPath)
    const markdownPath = parseNonEmptyPromptString(part.path)
    const version = parseNonEmptyPromptString(part.version)
    return Object.assign(
      markdownPart,
      markdownPath !== undefined ? { path: markdownPath } : undefined,
      version !== undefined ? { version } : undefined,
      headingPath !== undefined
        ? {
            headingPath: headingPath.flatMap((entry) => {
              const trimmed = entry.trim()
              return trimmed ? [trimmed] : []
            }),
          }
        : undefined,
    )
  }

  const anchor = readSelectionTextAnchor(part)
  if (!anchor) {
    throw new SessionTransformValidationError("reading selection-context anchor is required")
  }

  const readingPart: ReadingSelectionContextPart = {
    type: SELECTION_CONTEXT_PART_TYPE,
    source: "reading",
    text,
    selectionKey,
    anchor,
  }
  const resourceKey = parseNonEmptyPromptString(part.resourceKey)
  const tocLabel = parseNonEmptyPromptString(part.tocLabel)
  const pageLabel = parseNonEmptyPromptString(part.pageLabel)
  const locationLabel = parseNonEmptyPromptString(part.locationLabel)
  return Object.assign(
    Object.assign(
      readingPart,
      resourceKey !== undefined ? { resourceKey } : undefined,
      tocLabel !== undefined ? { tocLabel } : undefined,
      pageLabel !== undefined ? { pageLabel } : undefined,
    ),
    locationLabel !== undefined ? { locationLabel } : undefined,
  )
}

export function flattenPromptPartsForRuntime<T>(parts: readonly T[]): TPromptPart[] {
  return parts.flatMap((part) => {
    if (isNativeResourceAttachmentPart(part)) {
      const metadata = readNativeResourcePromptAttachment(part)
      return [
        {
          type: PROMPT_PART_TYPE_TEXT,
          text: `Attached native learning resource metadata: ${JSON.stringify({ filename: metadata.filename, format: metadata.format })}. Follow the preparation instructions in the system reminder before relying on this document's contents.`,
          metadata: {
            [BUDDY_PROMPT_PART_METADATA_KEY]: nativeResourceAttachmentPromptPart(metadata),
          },
        },
      ]
    }

    const selectionContext = parseSelectionContextPart(part)
    if (selectionContext) {
      const normalized = normalizeSelectionContextPart(selectionContext)
      return [
        {
          type: PROMPT_PART_TYPE_TEXT,
          text: normalized.text,
          metadata: {
            [BUDDY_PROMPT_PART_METADATA_KEY]: selectionContextPromptPart(normalized),
          },
        },
      ]
    }

    const readingSelection = parseReadingSelectionPart(part)
    if (!readingSelection) {
      const object = parseJsonObject(part)
      return object !== undefined ? [{ ...object }] : []
    }

    const normalized = normalizeReadingSelectionPart(readingSelection)
    return [
      {
        type: PROMPT_PART_TYPE_TEXT,
        text: normalized.text,
        metadata: {
          [BUDDY_PROMPT_PART_METADATA_KEY]: readingSelectionPromptPart(normalized),
        },
      },
    ]
  })
}

function isWorkspaceRelativePath(filepath: string) {
  if (path.isAbsolute(filepath)) return false
  if (filepath.startsWith("~/")) return false
  if (filepath.length === 0) return false
  return true
}

function isPathInsideWorkspace(directory: string, filepath: string) {
  const workspaceRoot = path.resolve(directory)
  const resolvedFilepath = path.resolve(filepath)
  const relpath = path.relative(workspaceRoot, resolvedFilepath)
  return relpath.length === 0 || (!relpath.startsWith("..") && !path.isAbsolute(relpath))
}

async function resolveAgentReferenceName(rawName: string): Promise<string | undefined> {
  try {
    const agent = await Agent.get(rawName)
    return agent?.name
  } catch {
    return undefined
  }
}
