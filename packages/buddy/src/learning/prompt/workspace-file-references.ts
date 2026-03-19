import os from "node:os"
import path from "node:path"
import { promises as fs } from "node:fs"
import { pathToFileURL } from "node:url"
import { Agent } from "@buddy/opencode-adapter/agent"
import { SessionTransformValidationError } from "../../session"
import {
  classifyResourcePath,
  ensureResourcePack,
  type ResourcePackService,
} from "../../resources/resource-pack-service"

// Sync with packages/web/src/components/prompt/prompt-types.ts.
export const WORKSPACE_FILE_REFERENCE_PART_TYPE = "workspace-file-reference" as const
export const PROMPT_WORKSPACE_FILE_REFERENCE_REGEX =
  /(?<![\w`])@(?:"([^"\n]+)"|`([^`\n]+)`|(\.?[^\s`,.]+(?:\.[^\s`,.]+)*))/g
const PROMPT_PART_TYPE_TEXT = "text" as const
const PROMPT_PART_TYPE_FILE = "file" as const
const PROMPT_PART_TYPE_AGENT = "agent" as const
const FILE_MIME_TEXT = "text/plain" as const
const FILE_MIME_DIRECTORY = "application/x-directory" as const

export type WorkspaceFileReferencePart = {
  type: typeof WORKSPACE_FILE_REFERENCE_PART_TYPE
  path: string
}

export async function normalizePromptParts(input: {
  directory: string
  content: string
  parts: unknown[]
  resourcePackService?: ResourcePackService
}): Promise<Record<string, unknown>[]> {
  const resourcePackResolver = input.resourcePackService ?? { ensureResourcePack }
  const normalizedParts: Record<string, unknown>[] = []

  if (input.content.trim().length > 0) {
    normalizedParts.push(...(await expandPromptTextPart({
      directory: input.directory,
      part: {
        type: "text",
        text: input.content,
      },
      resourcePackResolver,
    })))
  }

  for (const part of input.parts) {
    if (isWorkspaceFileReferencePart(part)) {
      normalizedParts.push(...(await expandWorkspaceFileReferencePart({
        directory: input.directory,
        part,
        resourcePackResolver,
      })))
      continue
    }

    if (isPromptTextPart(part)) {
      normalizedParts.push(...(await expandPromptTextPart({
        directory: input.directory,
        part,
        resourcePackResolver,
      })))
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
  resourcePackResolver: ResourcePackService
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
      resourcePackResolver: input.resourcePackResolver,
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
  resourcePackResolver: ResourcePackService
}): Promise<Record<string, unknown>[]> {
  return resolveWorkspaceReference({
    directory: input.directory,
    rawPath: input.part.path,
    source: "explicit",
    resourcePackResolver: input.resourcePackResolver,
  })
}

async function resolveWorkspaceReference(input: {
  directory: string
  rawPath: string
  source: "raw" | "explicit"
  resourcePackResolver: ResourcePackService
}): Promise<Record<string, unknown>[]> {
  const resolvedPath = resolveWorkspacePath(input.directory, input.rawPath)
  const isWorkspaceScopedPath =
    isWorkspaceRelativePath(input.rawPath) &&
    isPathInsideWorkspace(input.directory, resolvedPath)
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

  const classification = classifyResourcePath(resolvedPath, Number(stat.size))
  if (classification.kind === "pack") {
    try {
      const pack = await input.resourcePackResolver.ensureResourcePack({
        directory: input.directory,
        sourcePath: resolvedPath,
      })

      const fileParts = [
        createVendorFilePart({
          filePath: pack.entrypointPath,
          filename: relativeDisplayPath(input.directory, pack.entrypointPath),
          mime: FILE_MIME_TEXT,
        }),
      ]

      if (pack.tocPath) {
        fileParts.push(
          createVendorFilePart({
            filePath: pack.tocPath,
            filename: relativeDisplayPath(input.directory, pack.tocPath),
            mime: FILE_MIME_TEXT,
          }),
        )
      }

      return fileParts
    } catch (error) {
      if (error instanceof Error) {
        throw new SessionTransformValidationError(error.message)
      }
      throw new SessionTransformValidationError(String(error))
    }
  }

  return [
    createVendorFilePart({
      filePath: resolvedPath,
      filename: relativeDisplayPath(input.directory, resolvedPath),
      mime: classification.mime,
    }),
  ]
}

function createVendorFilePart(input: {
  filePath: string
  filename: string
  mime: string
}) {
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
