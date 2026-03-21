import os from "node:os"
import path from "node:path"
import { promises as fs } from "node:fs"
import { pathToFileURL } from "node:url"
import { Agent } from "@buddy/opencode-adapter/agent"
import { SessionTransformValidationError } from "../../session"
import { resolveResourceReference } from "../../resources/resource-registry-service"

// Sync with packages/web/src/components/prompt/prompt-types.ts.
export const WORKSPACE_FILE_REFERENCE_PART_TYPE = "workspace-file-reference" as const
// Sync with packages/web/src/components/prompt/prompt-types.ts.
export const RESOURCE_REFERENCE_PART_TYPE = "resource-reference" as const
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

export type ResourceReferencePart = {
  type: typeof RESOURCE_REFERENCE_PART_TYPE
  key: string
}

export async function normalizePromptParts(input: {
  directory: string
  content: string
  parts: unknown[]
}): Promise<Record<string, unknown>[]> {
  const normalizedParts: Record<string, unknown>[] = []

  if (input.content.trim().length > 0) {
    normalizedParts.push(
      ...(await expandPromptTextPart({
        directory: input.directory,
        part: {
          type: "text",
          text: input.content,
        },
      })),
    )
  }

  for (const part of input.parts) {
    if (isWorkspaceFileReferencePart(part)) {
      normalizedParts.push(
        ...(await expandWorkspaceFileReferencePart({
          directory: input.directory,
          part,
        })),
      )
      continue
    }

    if (isResourceReferencePart(part)) {
      normalizedParts.push(
        ...(await expandResourceReferencePart({
          directory: input.directory,
          part,
        })),
      )
      continue
    }

    if (isPromptTextPart(part)) {
      normalizedParts.push(
        ...(await expandPromptTextPart({
          directory: input.directory,
          part,
        })),
      )
      continue
    }

    if (isPlainObject(part)) {
      normalizedParts.push({ ...part })
    }
  }

  if (normalizedParts.length === 0) {
    throw new SessionTransformValidationError("content or parts must be provided")
  }

  return normalizedParts
}

async function expandPromptTextPart(input: {
  directory: string
  part: Record<string, unknown>
}): Promise<Record<string, unknown>[]> {
  const text = promptTextValue(input.part)
  if (text === undefined || text.length === 0) {
    return []
  }

  const hasReference = PROMPT_WORKSPACE_FILE_REFERENCE_REGEX.test(text)
  PROMPT_WORKSPACE_FILE_REFERENCE_REGEX.lastIndex = 0
  if (!hasReference) {
    return [normalizePromptTextPart(input.part, text)]
  }

  const pieces: Record<string, unknown>[] = []
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
}): Promise<Record<string, unknown>[]> {
  return resolveWorkspaceReference({
    directory: input.directory,
    rawPath: input.part.path,
    source: "explicit",
  })
}

async function expandResourceReferencePart(input: {
  directory: string
  part: ResourceReferencePart
}): Promise<Record<string, unknown>[]> {
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
}): Promise<Record<string, unknown>[]> {
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

function promptTextValue(part: Record<string, unknown>) {
  const text = part.text
  if (typeof text === "string") return text
  const content = part.content
  if (typeof content === "string") return content
  return undefined
}

function normalizePromptTextPart(part: Record<string, unknown>, text: string) {
  return {
    ...stripPromptTextValues(part),
    type: PROMPT_PART_TYPE_TEXT,
    text,
  }
}

function stripPromptTextValues(part: Record<string, unknown>) {
  const next: Record<string, unknown> = { ...part }
  delete next.content
  delete next.text
  return next
}

function isPromptTextPart(part: unknown): part is Record<string, unknown> {
  if (!isPlainObject(part)) return false
  if (part.type !== PROMPT_PART_TYPE_TEXT) return false
  return typeof part.text === "string" || typeof part.content === "string"
}

function isWorkspaceFileReferencePart(part: unknown): part is WorkspaceFileReferencePart {
  if (!isPlainObject(part)) return false
  return part.type === WORKSPACE_FILE_REFERENCE_PART_TYPE && typeof part.path === "string"
}

function isResourceReferencePart(part: unknown): part is ResourceReferencePart {
  if (!isPlainObject(part)) return false
  return part.type === RESOURCE_REFERENCE_PART_TYPE && typeof part.key === "string"
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
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
