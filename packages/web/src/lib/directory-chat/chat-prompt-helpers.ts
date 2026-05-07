import { serializePromptEditorParts } from "@/components/prompt/prompt-parts"
import {
  PROMPT_PART_TYPE_AGENT,
  PROMPT_PART_TYPE_FILE,
  PROMPT_PART_TYPE_TEXT,
  READING_SELECTION_PART_TYPE,
  readPromptReadingSelectionMetadata,
  RESOURCE_REFERENCE_PART_TYPE,
  WORKSPACE_FILE_REFERENCE_PART_TYPE,
} from "@/components/prompt/prompt-types"
import type {
  PromptAttachmentPart,
  PromptComposerAttachment,
  PromptComposerPart,
  PromptSubmissionPart,
} from "@/components/prompt/prompt-types"
import {
  isChatAgentPart,
  isChatFilePart,
  isChatTextPart,
} from "@/components/chat/utils/part-guards"
import {
  normalizeProviderErrorDetails,
  normalizeUpstreamProviderErrorMessage,
} from "@/lib/upstream-provider-error"
import type { MessagePart, MessageWithParts } from "@/state/chat-types"
import {
  type PersonaConfigOption,
  type PromptCommandOption,
  loadCommandCatalog,
  loadPersonaCatalog,
  loadProjectConfig,
  resolveDefaultPersonaID,
} from "@/state/chat-actions"

const DATA_URL_PREFIX = "data:" as const

export function readSessionErrorMessage(error: unknown) {
  if (typeof error === "string" && error.trim()) {
    return normalizeUpstreamProviderErrorMessage(error)
  }
  if (!error || typeof error !== "object") return "An error occurred"

  const message = "message" in error ? error.message : undefined
  if (typeof message === "string" && message.trim()) {
    const responseBody = readErrorResponseBody(error)
    return normalizeProviderErrorDetails({ message, responseBody })
  }

  const dataMessage = readErrorDataMessage(error)
  if (typeof dataMessage === "string" && dataMessage.trim()) {
    const responseBody = readErrorResponseBody(error)
    return normalizeProviderErrorDetails({ message: dataMessage, responseBody })
  }

  const name = "name" in error ? error.name : undefined
  if (typeof name === "string" && name.trim()) return normalizeUpstreamProviderErrorMessage(name)

  return "An error occurred"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function readErrorDataMessage(error: object): unknown {
  if (!("data" in error) || !isRecord(error.data)) return undefined
  return error.data.message
}

function readErrorResponseBody(error: object): string | undefined {
  if (!("data" in error) || !isRecord(error.data)) return undefined
  const responseBody = "responseBody" in error.data ? error.data.responseBody : undefined
  return typeof responseBody === "string" && responseBody.trim().length > 0
    ? responseBody
    : undefined
}

export function parseConfiguredModel(value: unknown) {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined

  const separator = trimmed.indexOf("/")
  if (separator <= 0 || separator >= trimmed.length - 1) return undefined

  return {
    providerID: trimmed.slice(0, separator),
    modelID: trimmed.slice(separator + 1),
  }
}

export function modelSelectionKey(input: { providerID: string; modelID: string }) {
  return `${input.providerID}/${input.modelID}`
}

function decodeAttachmentDataUrl(dataUrl: string) {
  const separator = dataUrl.indexOf(",")
  if (separator === -1) return undefined

  const metadata = dataUrl.slice(0, separator)
  const payload = dataUrl.slice(separator + 1)

  if (/;base64$/i.test(metadata)) {
    const binary = window.atob(payload)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    return bytes
  }

  return new TextEncoder().encode(decodeURIComponent(payload))
}

function decodeAttachmentText(dataUrl: string) {
  const bytes = decodeAttachmentDataUrl(dataUrl)
  if (!bytes) return undefined

  try {
    return new TextDecoder().decode(bytes)
  } catch {
    return undefined
  }
}

function buildPromptAttachmentParts(
  attachments: PromptComposerAttachment[],
): PromptAttachmentPart[] {
  return attachments.flatMap((attachment): PromptAttachmentPart[] => {
    const textLike = attachment.mime === "image/svg+xml" || attachment.mime.startsWith("text/")
    if (textLike) {
      const content = decodeAttachmentText(attachment.dataUrl)
      if (content !== undefined) {
        return [
          {
            type: PROMPT_PART_TYPE_TEXT,
            text: `Attached file (${attachment.filename}):\n${content}`,
          },
        ]
      }
    }

    return [
      {
        type: PROMPT_PART_TYPE_FILE,
        mime: attachment.mime,
        url: attachment.dataUrl,
        filename: attachment.filename,
      },
    ]
  })
}

export function buildPromptSubmissionParts(
  promptParts: PromptComposerPart[],
  attachments: PromptComposerAttachment[],
): PromptSubmissionPart[] {
  return [...promptParts.map((part) => ({ ...part })), ...buildPromptAttachmentParts(attachments)]
}

export function buildCommandAttachmentParts(attachments: PromptComposerAttachment[]) {
  return attachments.map((attachment) => ({
    type: PROMPT_PART_TYPE_FILE,
    mime: attachment.mime === "text/plain" ? "application/octet-stream" : attachment.mime,
    url: attachment.dataUrl,
    filename: attachment.filename,
  }))
}

function isWorkspaceFileReferencePart(
  part: MessagePart,
): part is MessagePart & { type: typeof WORKSPACE_FILE_REFERENCE_PART_TYPE; path: string } {
  return part.type === WORKSPACE_FILE_REFERENCE_PART_TYPE && typeof part.path === "string"
}

function isResourceReferencePart(
  part: MessagePart,
): part is MessagePart & { type: typeof RESOURCE_REFERENCE_PART_TYPE; key: string } {
  return part.type === RESOURCE_REFERENCE_PART_TYPE && typeof part.key === "string"
}

function isReadingSelectionPart(part: MessagePart): part is MessagePart & {
  type: typeof READING_SELECTION_PART_TYPE
  text: string
  resourceKey?: string
  cfi?: string
  index?: number
  tocLabel?: string
  pageLabel?: string
  locationLabel?: string
} {
  return part.type === READING_SELECTION_PART_TYPE && typeof part.text === "string"
}

function toPromptComposerAttachment(part: MessagePart): PromptComposerAttachment | undefined {
  if (!isChatFilePart(part)) return undefined
  if (!part.url.startsWith(DATA_URL_PREFIX)) return undefined
  if (typeof part.filename !== "string" || part.filename.length === 0) return undefined

  return {
    id: part.id,
    filename: part.filename,
    mime: part.mime,
    dataUrl: part.url,
    kind: part.mime.startsWith("image/") ? "image" : "file",
  }
}

function toRelativeWorkspacePath(directory: string, filePath: string) {
  const normalizedDirectory =
    directory.endsWith("/") || directory.endsWith("\\") ? directory : `${directory}/`
  if (filePath.startsWith(normalizedDirectory)) {
    return filePath.slice(normalizedDirectory.length)
  }

  if (filePath.startsWith(directory)) {
    return filePath.slice(directory.length).replace(/^[\\/]/, "")
  }

  return filePath
}

function readFileUrlPath(url: string) {
  if (!url.startsWith("file:")) return undefined

  try {
    const pathname = decodeURIComponent(new URL(url).pathname)
    if (!pathname) return undefined
    if (/^\/[A-Za-z]:\//.test(pathname)) {
      return pathname.slice(1).replaceAll("/", "\\")
    }
    return pathname
  } catch {
    return undefined
  }
}

function readInlineReferencePath(part: MessagePart, directory: string) {
  if (!isChatFilePart(part) || part.url.startsWith(DATA_URL_PREFIX)) return undefined

  const sourcePath =
    part.source && typeof part.source === "object" && "path" in part.source
      ? part.source.path
      : undefined
  if (typeof sourcePath === "string" && sourcePath.length > 0) {
    return toRelativeWorkspacePath(directory, sourcePath)
  }

  if (typeof part.filename === "string" && part.filename.length > 0) {
    return part.filename
  }

  const fileUrlPath = readFileUrlPath(part.url)
  if (fileUrlPath) {
    return toRelativeWorkspacePath(directory, fileUrlPath)
  }

  return undefined
}

export function buildPromptDraftFromUserMessage(
  message: MessageWithParts | undefined,
  directory: string,
) {
  if (!message || message.info.role !== "user") return undefined

  const promptParts: PromptComposerPart[] = []
  const attachments: PromptComposerAttachment[] = []

  for (const part of message.parts) {
    if (isChatTextPart(part)) {
      if (part.synthetic === true) continue
      const readingSelectionPart = readPromptReadingSelectionMetadata(part.metadata)
      if (readingSelectionPart) {
        promptParts.push(readingSelectionPart)
        continue
      }
      promptParts.push({
        type: PROMPT_PART_TYPE_TEXT,
        text: part.text,
      })
      continue
    }

    if (isChatAgentPart(part)) {
      promptParts.push({
        type: PROMPT_PART_TYPE_AGENT,
        name: part.name,
      })
      continue
    }

    if (isWorkspaceFileReferencePart(part)) {
      promptParts.push({
        type: WORKSPACE_FILE_REFERENCE_PART_TYPE,
        path: part.path,
      })
      continue
    }

    if (isResourceReferencePart(part)) {
      promptParts.push({
        type: RESOURCE_REFERENCE_PART_TYPE,
        key: part.key,
      })
      continue
    }

    if (isReadingSelectionPart(part)) {
      promptParts.push({
        type: READING_SELECTION_PART_TYPE,
        text: part.text,
        ...(typeof part.resourceKey === "string" ? { resourceKey: part.resourceKey } : {}),
        ...(typeof part.cfi === "string" ? { cfi: part.cfi } : {}),
        ...(typeof part.index === "number" ? { index: part.index } : {}),
        ...(typeof part.tocLabel === "string" ? { tocLabel: part.tocLabel } : {}),
        ...(typeof part.pageLabel === "string" ? { pageLabel: part.pageLabel } : {}),
        ...(typeof part.locationLabel === "string" ? { locationLabel: part.locationLabel } : {}),
      })
      continue
    }

    const attachment = toPromptComposerAttachment(part)
    if (attachment) {
      attachments.push(attachment)
      continue
    }

    const referencePath = readInlineReferencePath(part, directory)
    if (referencePath) {
      promptParts.push({
        type: WORKSPACE_FILE_REFERENCE_PART_TYPE,
        path: referencePath,
      })
    }
  }

  const value = serializePromptEditorParts(promptParts)

  return {
    value,
    parts: promptParts,
    attachments,
    cursor: value.length,
  }
}

export async function loadComposerConfiguration(directory: string) {
  const [personas, config, commands] = await Promise.all([
    loadPersonaCatalog(directory),
    loadProjectConfig(directory),
    loadCommandCatalog(directory),
  ])
  const configuredDefault =
    resolveDefaultPersonaID(
      personas,
      typeof config.default_persona === "string" ? config.default_persona : undefined,
    ) ?? "buddy"

  return {
    personas,
    commands,
    configuredDefault,
    configuredModel: parseConfiguredModel(config.model),
  } satisfies {
    personas: PersonaConfigOption[]
    commands: PromptCommandOption[]
    configuredDefault: string
    configuredModel: { providerID: string; modelID: string } | undefined
  }
}
