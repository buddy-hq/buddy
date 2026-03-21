import { PROMPT_PART_TYPE_FILE, PROMPT_PART_TYPE_TEXT } from '@/components/prompt/prompt-types'
import type {
  PromptAttachmentPart,
  PromptComposerAttachment,
  PromptComposerPart,
  PromptSubmissionPart,
} from '@/components/prompt/prompt-types'
import {
  type PersonaConfigOption,
  type PromptCommandOption,
  loadCommandCatalog,
  loadPersonaCatalog,
  loadProjectConfig,
  resolveDefaultPersonaID,
} from '@/state/chat-actions'
import type { TeachingIntent } from '@/state/teaching-runtime'

export function readSessionErrorMessage(error: unknown) {
  if (typeof error === 'string' && error.trim()) return error
  if (!error || typeof error !== 'object') return 'An error occurred'

  const message = 'message' in error ? (error as { message?: unknown }).message : undefined
  if (typeof message === 'string' && message.trim()) return message

  const dataMessage =
    'data' in error && error.data && typeof error.data === 'object'
      ? (error.data as { message?: unknown }).message
      : undefined
  if (typeof dataMessage === 'string' && dataMessage.trim()) return dataMessage

  const name = 'name' in error ? (error as { name?: unknown }).name : undefined
  if (typeof name === 'string' && name.trim()) return name

  return 'An error occurred'
}

export function parseConfiguredModel(value: unknown) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined

  const separator = trimmed.indexOf('/')
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
  const separator = dataUrl.indexOf(',')
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
    const textLike = attachment.mime === 'image/svg+xml' || attachment.mime.startsWith('text/')
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
    mime: attachment.mime === 'text/plain' ? 'application/octet-stream' : attachment.mime,
    url: attachment.dataUrl,
    filename: attachment.filename,
  }))
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
      typeof config.default_persona === 'string' ? config.default_persona : undefined,
    ) ?? 'buddy'

  return {
    personas,
    commands,
    configuredDefault,
    configuredModel: parseConfiguredModel(config.model),
    configuredIntent:
      config.default_intent === 'learn' ||
      config.default_intent === 'practice' ||
      config.default_intent === 'assess'
        ? config.default_intent
        : ('auto' as const),
  } satisfies {
    personas: PersonaConfigOption[]
    commands: PromptCommandOption[]
    configuredDefault: string
    configuredModel: { providerID: string; modelID: string } | undefined
    configuredIntent: TeachingIntent
  }
}
