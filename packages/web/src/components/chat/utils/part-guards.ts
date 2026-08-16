import type {
  AgentPart as SdkAgentPart,
  FilePart as SdkFilePart,
  ReasoningPart as SdkReasoningPart,
  TextPart as SdkTextPart,
  ToolPart as SdkToolPart,
} from "@buddy/sdk"
import type { ReaderTextAnchor } from "@buddy/reader-contract"
import type { MessagePart } from "@/state/chat-types"
import {
  READING_SELECTION_PART_TYPE,
  readPromptReaderTextAnchor,
  readPromptSelectionContextMetadata,
  SELECTION_CONTEXT_PART_TYPE,
  type PromptReadingSelectionPart,
  type PromptReadingSelectionContextPart,
  type PromptMarkdownSelectionContextPart,
  type PromptSelectionContextPart,
} from "@/components/prompt/prompt-types"

type TReadingSelectionBase = Pick<PromptReadingSelectionPart, "type" | "text" | "anchor">
type TMarkdownSelectionContextBase = Pick<
  PromptMarkdownSelectionContextPart,
  "type" | "source" | "text" | "selectionKey"
>
type TReadingSelectionContextBase = Pick<
  PromptReadingSelectionContextPart,
  "type" | "source" | "text" | "selectionKey" | "anchor"
>

export type ChatFilePart = MessagePart & SdkFilePart
export type ChatAgentPart = MessagePart & SdkAgentPart
export type ChatTextPart = MessagePart & SdkTextPart
export type ChatReasoningPart = MessagePart & SdkReasoningPart
export type ChatToolPart = MessagePart & SdkToolPart
export type ChatReadingSelectionPart = MessagePart & {
  type: typeof READING_SELECTION_PART_TYPE | typeof SELECTION_CONTEXT_PART_TYPE
  text: string
  source?: "reading" | "markdown"
  selectionKey?: string
  path?: string
  version?: string
  headingPath?: string[]
  resourceKey?: string
  anchor?: ReaderTextAnchor
  tocLabel?: string
  pageLabel?: string
  locationLabel?: string
}

export function isChatFilePart(part: MessagePart): part is ChatFilePart {
  return part.type === "file" && typeof part.mime === "string" && typeof part.url === "string"
}

export function isChatAgentPart(part: MessagePart): part is ChatAgentPart {
  return part.type === "agent" && typeof part.name === "string"
}

export function isChatTextPart(part: MessagePart): part is ChatTextPart {
  return part.type === "text" && typeof part.text === "string"
}

export function isChatReasoningPart(part: MessagePart): part is ChatReasoningPart {
  return part.type === "reasoning" && typeof part.text === "string"
}

export function isChatToolPart(part: MessagePart): part is ChatToolPart {
  return part.type === "tool" && typeof part.tool === "string"
}

export function isChatReadingSelectionPart(part: MessagePart): boolean {
  return (
    (part.type === READING_SELECTION_PART_TYPE || part.type === SELECTION_CONTEXT_PART_TYPE) &&
    typeof part.text === "string"
  )
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    return undefined
  }
  return value
}

function addMessageIdentity(
  part: MessagePart,
  normalized: PromptReadingSelectionPart | PromptSelectionContextPart,
): ChatReadingSelectionPart {
  return {
    id: part.id,
    sessionID: part.sessionID,
    messageID: part.messageID,
    ...normalized,
  }
}

export function readChatReadingSelectionPart(
  part: MessagePart,
): ChatReadingSelectionPart | undefined {
  if (isChatReadingSelectionPart(part)) {
    if (part.type === READING_SELECTION_PART_TYPE && typeof part.text === "string") {
      const anchor = readPromptReaderTextAnchor(part)
      if (!anchor) return undefined
      const selectionKey = readOptionalString(part.selectionKey)
      const resourceKey = readOptionalString(part.resourceKey)
      const tocLabel = readOptionalString(part.tocLabel)
      const pageLabel = readOptionalString(part.pageLabel)
      const locationLabel = readOptionalString(part.locationLabel)
      const readingSelection: TReadingSelectionBase = {
        type: READING_SELECTION_PART_TYPE,
        text: part.text,
        anchor,
      }
      return addMessageIdentity(
        part,
        Object.assign(
          readingSelection,
          selectionKey ? { selectionKey } : undefined,
          resourceKey ? { resourceKey } : undefined,
          Object.assign(
            {},
            tocLabel ? { tocLabel } : undefined,
            pageLabel ? { pageLabel } : undefined,
            locationLabel ? { locationLabel } : undefined,
          ),
        ),
      )
    }

    if (
      part.type === SELECTION_CONTEXT_PART_TYPE &&
      typeof part.text === "string" &&
      typeof part.selectionKey === "string" &&
      part.source === "markdown"
    ) {
      const path = readOptionalString(part.path)
      const version = readOptionalString(part.version)
      const headingPath = readOptionalStringArray(part.headingPath)
      const markdownSelection: TMarkdownSelectionContextBase = {
        type: SELECTION_CONTEXT_PART_TYPE,
        source: "markdown",
        text: part.text,
        selectionKey: part.selectionKey,
      }
      return addMessageIdentity(
        part,
        Object.assign(
          markdownSelection,
          path ? { path } : undefined,
          version ? { version } : undefined,
          headingPath ? { headingPath } : undefined,
        ),
      )
    }

    if (
      part.type === SELECTION_CONTEXT_PART_TYPE &&
      typeof part.text === "string" &&
      typeof part.selectionKey === "string" &&
      part.source === "reading"
    ) {
      const anchor = readPromptReaderTextAnchor(part)
      if (!anchor) return undefined
      const resourceKey = readOptionalString(part.resourceKey)
      const tocLabel = readOptionalString(part.tocLabel)
      const pageLabel = readOptionalString(part.pageLabel)
      const locationLabel = readOptionalString(part.locationLabel)
      const readingContext: TReadingSelectionContextBase = {
        type: SELECTION_CONTEXT_PART_TYPE,
        source: "reading",
        text: part.text,
        selectionKey: part.selectionKey,
        anchor,
      }
      return addMessageIdentity(
        part,
        Object.assign(
          readingContext,
          resourceKey ? { resourceKey } : undefined,
          Object.assign(
            {},
            tocLabel ? { tocLabel } : undefined,
            pageLabel ? { pageLabel } : undefined,
            locationLabel ? { locationLabel } : undefined,
          ),
        ),
      )
    }
  }

  const metadataPart = readPromptSelectionContextMetadata(part.metadata)
  if (metadataPart) {
    return addMessageIdentity(part, metadataPart)
  }

  return undefined
}
