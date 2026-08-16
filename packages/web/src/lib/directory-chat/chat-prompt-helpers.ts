import { z } from "zod"
import { serializePromptEditorParts } from "@/components/prompt/prompt-parts"
import {
  BUDDY_PROMPT_PART_METADATA_KEY,
  PROMPT_PART_TYPE_AGENT,
  PROMPT_PART_TYPE_FILE,
  PROMPT_PART_TYPE_SKILL,
  PROMPT_PART_TYPE_TEXT,
  NATIVE_RESOURCE_ATTACHMENT_PART_TYPE,
  TEXT_FILE_ATTACHMENT_PART_TYPE,
  READING_SELECTION_PART_TYPE,
  readPromptReaderTextAnchor,
  readPromptSelectionContextMetadata,
  readPromptNativeResourceAttachmentMetadata,
  readPromptNativeResourceAttachmentPart,
  readPromptTextFileAttachmentMetadata,
  isPromptModelAttachment,
  isPromptNativeResourceAttachment,
  isPromptReadyNativeResourceAttachment,
  RESOURCE_REFERENCE_PART_TYPE,
  SELECTION_CONTEXT_PART_TYPE,
  WORKSPACE_FILE_REFERENCE_PART_TYPE,
} from "@/components/prompt/prompt-types"
import type {
  PromptAttachmentPart,
  PromptComposerAttachment,
  PromptComposerPart,
  PromptFilePart,
  PromptImageEditIntent,
  PromptMarkdownSelectionContextPart,
  PromptModelAttachment,
  PromptNativeResourceAttachmentPart,
  PromptReadingSelectionContextPart,
  PromptReadingSelectionPart,
  PromptSubmissionPart,
  PromptTextFileAttachmentMetadata,
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
const TEXT_FILE_ATTACHMENT_PREFIX = "Attached file (" as const
const TEXT_FILE_ATTACHMENT_SEPARATOR = "):\n" as const

type TConfiguredModel = {
  providerID: string
  modelID: string
}

const stringSchema = z.string()
const stringArraySchema = z.array(z.string())
const fileSourcePathSchema = z.object({ path: z.string().min(1) })
const errorDataSchema = z.looseObject({
  message: z.string().optional(),
  responseBody: z.string().optional(),
})
const sessionErrorSchema = z.looseObject({
  message: z.string().optional(),
  name: z.string().optional(),
  data: errorDataSchema.optional(),
})

function parseTString<T>(value: T): string | undefined {
  const parsed = stringSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

function parseTNonEmptyString<T>(value: T): string | undefined {
  const parsed = parseTString(value)
  if (parsed === undefined) return undefined
  const trimmed = parsed.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function parseTStringArray<T>(value: T): string[] | undefined {
  const parsed = stringArraySchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

function parseTFileSourcePath<T>(value: T): string | undefined {
  const parsed = fileSourcePathSchema.safeParse(value)
  return parsed.success ? parsed.data.path : undefined
}

function textFileAttachmentPromptText(filename: string, content: string) {
  return `${TEXT_FILE_ATTACHMENT_PREFIX}${filename}${TEXT_FILE_ATTACHMENT_SEPARATOR}${content}`
}

function textFileAttachmentContent(text: string, filename: string) {
  const prefix = textFileAttachmentPromptText(filename, "")
  return text.startsWith(prefix) ? text.slice(prefix.length) : text
}

function textFileAttachmentDataUrl(input: PromptTextFileAttachmentMetadata, text: string) {
  const content = textFileAttachmentContent(text, input.filename)
  return `data:${input.mime};charset=utf-8,${encodeURIComponent(content)}`
}

function localPathToFileUrl(path: string): string | undefined {
  if (path.startsWith("file:")) {
    try {
      return new URL(path).href
    } catch {
      return undefined
    }
  }

  const normalized = path.replaceAll("\\", "/")
  if (normalized.startsWith("//")) {
    const [host, ...segments] = normalized.slice(2).split("/")
    if (!host) return undefined
    const url = new URL(`file://${host}/`)
    url.pathname = `/${segments.join("/")}`
    return url.href
  }

  if (!normalized.startsWith("/") && !/^[A-Za-z]:\//u.test(normalized)) {
    return undefined
  }

  const url = new URL("file:///")
  url.pathname = normalized.startsWith("/") ? normalized : `/${normalized}`
  return url.href
}

function promptAttachmentUrl(attachment: PromptModelAttachment): string {
  if (attachment.editTarget) return attachment.dataUrl
  return attachment.localPath
    ? (localPathToFileUrl(attachment.localPath) ?? attachment.dataUrl)
    : attachment.dataUrl
}

function promptAttachmentSource(attachment: PromptModelAttachment) {
  if (!attachment.localPath) return undefined
  return {
    type: "file" as const,
    path: attachment.localPath,
    text: {
      value: attachment.filename,
      start: 0,
      end: attachment.filename.length,
    },
  }
}

export function buildPromptImageEditIntent(
  attachments: PromptComposerAttachment[],
): PromptImageEditIntent | undefined {
  const targetPaths = attachments.flatMap((attachment) =>
    isPromptModelAttachment(attachment) && attachment.editTarget && attachment.localPath
      ? [attachment.localPath]
      : [],
  )
  return targetPaths.length > 0 ? { targetPaths } : undefined
}

export function readSessionErrorMessage<T>(error: T) {
  const asString = parseTNonEmptyString(error)
  if (asString) return normalizeUpstreamProviderErrorMessage(asString)

  const parsed = sessionErrorSchema.safeParse(error)
  if (!parsed.success) return "An error occurred"

  const message = parseTNonEmptyString(parsed.data.message)
  if (message) {
    return normalizeProviderErrorDetails({
      message,
      responseBody: parseTNonEmptyString(parsed.data.data?.responseBody),
    })
  }

  const dataMessage = parseTNonEmptyString(parsed.data.data?.message)
  if (dataMessage) {
    return normalizeProviderErrorDetails({
      message: dataMessage,
      responseBody: parseTNonEmptyString(parsed.data.data?.responseBody),
    })
  }

  const name = parseTNonEmptyString(parsed.data.name)
  if (name) return normalizeUpstreamProviderErrorMessage(name)

  return "An error occurred"
}

export function parseConfiguredModel<T>(value: T): TConfiguredModel | undefined {
  const parsed = parseTNonEmptyString(value)
  if (parsed === undefined) return undefined

  const separator = parsed.indexOf("/")
  if (separator <= 0 || separator >= parsed.length - 1) return undefined

  return {
    providerID: parsed.slice(0, separator),
    modelID: parsed.slice(separator + 1),
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
  useLocalPaths = true,
): PromptAttachmentPart[] {
  return attachments.flatMap((attachment): PromptAttachmentPart[] => {
    if (!isPromptModelAttachment(attachment)) return []
    const textLike =
      (!useLocalPaths || !attachment.localPath) &&
      (attachment.mime === "image/svg+xml" || attachment.mime.startsWith("text/"))
    if (textLike) {
      const content = decodeAttachmentText(attachment.dataUrl)
      if (content !== undefined) {
        return [
          {
            type: PROMPT_PART_TYPE_TEXT,
            text: textFileAttachmentPromptText(attachment.filename, content),
            metadata: {
              [BUDDY_PROMPT_PART_METADATA_KEY]: {
                type: TEXT_FILE_ATTACHMENT_PART_TYPE,
                filename: attachment.filename,
                mime: attachment.mime,
              },
            },
          },
        ]
      }
    }

    const source = promptAttachmentSource(attachment)
    const filePart: PromptFilePart = Object.assign(
      {
        type: PROMPT_PART_TYPE_FILE,
        mime: attachment.mime,
        url: useLocalPaths ? promptAttachmentUrl(attachment) : attachment.dataUrl,
        filename: attachment.filename,
      },
      source ? { source } : undefined,
    )
    return [filePart]
  })
}

function nativeResourcePart(
  attachment: PromptComposerAttachment,
): PromptNativeResourceAttachmentPart | undefined {
  if (!isPromptReadyNativeResourceAttachment(attachment)) return undefined
  return {
    type: NATIVE_RESOURCE_ATTACHMENT_PART_TYPE,
    filename: attachment.filename,
    sourcePath: attachment.localPath,
    format: attachment.format,
    alias: attachment.filename,
    mime: attachment.mime,
  }
}

function buildNativeResourcePreviewParts(
  attachments: PromptComposerAttachment[],
): PromptNativeResourceAttachmentPart[] {
  return attachments.flatMap((attachment) => {
    const part = nativeResourcePart(attachment)
    return part ? [part] : []
  })
}

function buildNativeResourceSubmissionParts(
  attachments: PromptComposerAttachment[],
): PromptSubmissionPart[] {
  return attachments.flatMap((attachment): PromptSubmissionPart[] => {
    const part = nativeResourcePart(attachment)
    if (!part) return []
    if (!isPromptReadyNativeResourceAttachment(attachment)) return [part]
    if (attachment.delivery !== "model-and-resource") return [part]

    const url = localPathToFileUrl(attachment.localPath)
    if (!url) return [part]
    return [
      part,
      {
        type: PROMPT_PART_TYPE_FILE,
        mime: attachment.mime,
        url,
        filename: attachment.filename,
        source: {
          type: "file",
          path: attachment.localPath,
          text: {
            value: attachment.filename,
            start: 0,
            end: attachment.filename.length,
          },
        },
      },
    ]
  })
}

// Skills are an editor-only pill; the backend keeps its start-of-message slash
// contract, so a skill part is flattened to its `/name` text before it leaves
// the composer. (At message start it never reaches here — the slash-command path
// handles it — so this only covers the rarer mid-message case.)
function submissionPartFromComposerPart(part: PromptComposerPart): PromptSubmissionPart {
  if (part.type === PROMPT_PART_TYPE_SKILL) {
    return { type: PROMPT_PART_TYPE_TEXT, text: `/${part.name}` }
  }
  return { ...part }
}

export function buildPromptPreviewParts(
  promptParts: PromptComposerPart[],
  attachments: PromptComposerAttachment[],
): PromptSubmissionPart[] {
  return [
    ...promptParts.map(submissionPartFromComposerPart),
    ...buildPromptAttachmentParts(attachments, false),
    ...buildNativeResourcePreviewParts(attachments),
  ]
}

export function buildPromptSubmissionParts(
  promptParts: PromptComposerPart[],
  attachments: PromptComposerAttachment[],
): PromptSubmissionPart[] {
  return [
    ...promptParts.map(submissionPartFromComposerPart),
    ...buildPromptAttachmentParts(attachments),
    ...buildNativeResourceSubmissionParts(attachments),
  ]
}

export function buildCommandAttachmentParts(attachments: PromptComposerAttachment[]) {
  if (attachments.some(isPromptNativeResourceAttachment)) return undefined

  return attachments.flatMap((attachment) => {
    if (isPromptModelAttachment(attachment)) {
      return [
        {
          type: PROMPT_PART_TYPE_FILE,
          mime: attachment.mime === "text/plain" ? "application/octet-stream" : attachment.mime,
          url: promptAttachmentUrl(attachment),
          filename: attachment.filename,
        },
      ]
    }
    return []
  })
}

function isWorkspaceFileReferencePart(
  part: MessagePart,
): part is MessagePart & { type: typeof WORKSPACE_FILE_REFERENCE_PART_TYPE; path: string } {
  return part.type === WORKSPACE_FILE_REFERENCE_PART_TYPE && parseTString(part.path) !== undefined
}

function isResourceReferencePart(
  part: MessagePart,
): part is MessagePart & { type: typeof RESOURCE_REFERENCE_PART_TYPE; key: string } {
  return part.type === RESOURCE_REFERENCE_PART_TYPE && parseTString(part.key) !== undefined
}

function isReadingSelectionPart(part: MessagePart): part is MessagePart & {
  type: typeof READING_SELECTION_PART_TYPE
  text: string
} {
  return part.type === READING_SELECTION_PART_TYPE && parseTString(part.text) !== undefined
}

function isSelectionContextPart(part: MessagePart): part is MessagePart & {
  type: typeof SELECTION_CONTEXT_PART_TYPE
  source: "reading" | "markdown"
  text: string
  selectionKey: string
} {
  return (
    part.type === SELECTION_CONTEXT_PART_TYPE &&
    (part.source === "reading" || part.source === "markdown") &&
    parseTString(part.text) !== undefined &&
    parseTString(part.selectionKey) !== undefined
  )
}

function toPromptComposerAttachment(part: MessagePart): PromptComposerAttachment | undefined {
  if (!isChatFilePart(part)) return undefined
  if (!part.url.startsWith(DATA_URL_PREFIX)) return undefined
  const filename = parseTString(part.filename)
  if (filename === undefined || filename.length === 0) return undefined

  const localPath = parseTFileSourcePath(part.source)
  const isImage = part.mime.startsWith("image/")
  const hasLocalPath = localPath !== undefined && localPath.length > 0

  const attachment: PromptModelAttachment = Object.assign(
    {
      id: part.id,
      filename,
      mime: part.mime,
      dataUrl: part.url,
      kind: isImage ? ("image" as const) : ("file" as const),
    },
    hasLocalPath
      ? Object.assign({ localPath }, isImage ? ({ editTarget: true } as const) : undefined)
      : undefined,
  )
  return attachment
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

function nativeResourceDraftAttachment(input: {
  id: string
  directory: string
  part: PromptNativeResourceAttachmentPart
}): PromptComposerAttachment {
  return {
    id: input.id,
    filename: input.part.filename,
    mime: input.part.mime,
    kind: "native-resource",
    format: input.part.format,
    delivery: input.part.format === "pdf" ? "model-and-resource" : "resource-only",
    status: "ready",
    uploadID: input.id,
    workspacePath: toRelativeWorkspacePath(input.directory, input.part.sourcePath),
    localPath: input.part.sourcePath,
    sizeBytes: 0,
  }
}

function textFileDraftAttachment(input: {
  id: string
  part: PromptTextFileAttachmentMetadata
  text: string
}): PromptModelAttachment {
  return {
    id: input.id,
    filename: input.part.filename,
    mime: input.part.mime,
    dataUrl: textFileAttachmentDataUrl(input.part, input.text),
    kind: input.part.mime.startsWith("image/") ? "image" : "file",
  }
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

  const sourcePath = parseTFileSourcePath(part.source)
  if (sourcePath !== undefined && sourcePath.length > 0) {
    return toRelativeWorkspacePath(directory, sourcePath)
  }

  const filename = parseTString(part.filename)
  if (filename !== undefined && filename.length > 0) {
    return filename
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
  const nativeResourceSourcePaths = new Set(
    message.parts.flatMap((part) => {
      const attachment =
        readPromptNativeResourceAttachmentPart(part) ??
        readPromptNativeResourceAttachmentMetadata(part.metadata)
      return attachment ? [attachment.sourcePath] : []
    }),
  )

  for (const part of message.parts) {
    if (isChatTextPart(part)) {
      if (part.synthetic === true) continue
      const textFileAttachment = readPromptTextFileAttachmentMetadata(part.metadata)
      if (textFileAttachment) {
        attachments.push(
          textFileDraftAttachment({ id: part.id, part: textFileAttachment, text: part.text }),
        )
        continue
      }
      const nativeResourcePart = readPromptNativeResourceAttachmentMetadata(part.metadata)
      if (nativeResourcePart) {
        attachments.push(
          nativeResourceDraftAttachment({ id: part.id, directory, part: nativeResourcePart }),
        )
        continue
      }
      const selectionContextPart = readPromptSelectionContextMetadata(part.metadata)
      if (selectionContextPart) {
        promptParts.push(selectionContextPart)
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

    const nativeResourcePart = readPromptNativeResourceAttachmentPart(part)
    if (nativeResourcePart) {
      attachments.push(
        nativeResourceDraftAttachment({ id: part.id, directory, part: nativeResourcePart }),
      )
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

    if (isSelectionContextPart(part)) {
      if (part.source === "markdown") {
        const headingPath = parseTStringArray(part.headingPath)
        const markdownPath = parseTString(part.path)
        const markdownVersion = parseTString(part.version)
        const markdownPart: PromptMarkdownSelectionContextPart = Object.assign(
          {
            type: SELECTION_CONTEXT_PART_TYPE,
            source: "markdown" as const,
            text: part.text,
            selectionKey: part.selectionKey,
          },
          markdownPath ? { path: markdownPath } : undefined,
          markdownVersion ? { version: markdownVersion } : undefined,
          headingPath ? { headingPath } : undefined,
        )
        promptParts.push(markdownPart)
        continue
      }

      const anchor = readPromptReaderTextAnchor(part)
      if (!anchor) continue
      const resourceKey = parseTString(part.resourceKey)
      const tocLabel = parseTString(part.tocLabel)
      const pageLabel = parseTString(part.pageLabel)
      const locationLabel = parseTString(part.locationLabel)
      const readingContextPart: PromptReadingSelectionContextPart = Object.assign(
        Object.assign(
          {
            type: SELECTION_CONTEXT_PART_TYPE,
            source: "reading" as const,
            text: part.text,
            selectionKey: part.selectionKey,
          },
          resourceKey ? { resourceKey } : undefined,
          { anchor },
        ),
        tocLabel ? { tocLabel } : undefined,
        pageLabel ? { pageLabel } : undefined,
        locationLabel ? { locationLabel } : undefined,
      )
      promptParts.push(readingContextPart)
      continue
    }

    if (isReadingSelectionPart(part)) {
      const anchor = readPromptReaderTextAnchor(part)
      if (!anchor) continue
      const selectionKey = parseTString(part.selectionKey)
      const resourceKey = parseTString(part.resourceKey)
      const tocLabel = parseTString(part.tocLabel)
      const pageLabel = parseTString(part.pageLabel)
      const locationLabel = parseTString(part.locationLabel)
      const readingPart: PromptReadingSelectionPart = Object.assign(
        Object.assign(
          {
            type: READING_SELECTION_PART_TYPE,
            text: part.text,
          },
          selectionKey ? { selectionKey } : undefined,
          resourceKey ? { resourceKey } : undefined,
          { anchor },
        ),
        tocLabel ? { tocLabel } : undefined,
        pageLabel ? { pageLabel } : undefined,
        locationLabel ? { locationLabel } : undefined,
      )
      promptParts.push(readingPart)
      continue
    }

    const directFileSourcePath = isChatFilePart(part)
      ? parseTFileSourcePath(part.source)
      : undefined
    if (directFileSourcePath && nativeResourceSourcePaths.has(directFileSourcePath)) continue

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
      parseTString(config.default_persona),
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
