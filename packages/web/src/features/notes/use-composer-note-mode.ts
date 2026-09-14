import { toast } from "@buddy/ui"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  SELECTION_CONTEXT_PART_TYPE,
  type PromptComposerAttachment,
  type PromptComposerPart,
  type PromptMessageSelectionContextPart,
} from "@/components/prompt/prompt-types"
import { language } from "@/context/language"
import { getPromptScopeKey, type PromptDraftState, type PromptStore } from "@/state/prompt-store"
import type { NoteCaptureImage } from "./api"

export type SaveComposerNote = (input: {
  text: string
  messageID?: string
  images?: NoteCaptureImage[]
}) => Promise<{ sessionID: string }>

type ComposerNoteDraft = Omit<PromptDraftState, "updatedAt">

type ComposerNoteModeInput = {
  directory: string
  promptKey: string
  activePromptKey: { readonly current: string }
  quotedMessage?: PromptMessageSelectionContextPart
  saveNote?: SaveComposerNote
  clearDraft: PromptStore["clearDraft"]
  clearComposer(): void
  readDraft(): ComposerNoteDraft
  removeQuotedMessage(): void
}

const NOTE_IMAGE_MIME_TYPES: ReadonlySet<string> = new Set<NoteCaptureImage["mime"]>([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
])
const NOTE_CAPTURE_MAX_IMAGES = 10
const NOTE_CAPTURE_MAX_IMAGE_BYTES = 20 * 1024 * 1024
const NOTE_CAPTURE_MAX_IMAGE_BASE64_CHARACTERS = Math.ceil(NOTE_CAPTURE_MAX_IMAGE_BYTES / 3) * 4
const NOTE_CAPTURE_MAX_IMAGE_FILENAME_CHARACTERS = 255
const BASE64_DATA_URL_SEPARATOR = ";base64,"
const BASE64_PAYLOAD_PATTERN = /^[a-zA-Z0-9+/]*={0,2}$/u

type ComposerNoteImagesResult =
  | { readonly status: "ok"; readonly images: NoteCaptureImage[] }
  | { readonly status: "error"; readonly message: string }

function quotedMessageID(parts: PromptComposerPart[]) {
  return parts.find(
    (part): part is PromptMessageSelectionContextPart =>
      part.type === SELECTION_CONTEXT_PART_TYPE && part.source === "message",
  )?.quotedMessageID
}

function isNoteImageMime(mime: string): mime is NoteCaptureImage["mime"] {
  return NOTE_IMAGE_MIME_TYPES.has(mime)
}

function decodedBase64ByteLength(payload: string) {
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0
  return Math.floor((payload.length * 3) / 4) - padding
}

/** Parses composer attachments into bounded note images or a user-facing validation error. */
export function parseComposerNoteImages(
  attachments: PromptComposerAttachment[],
): ComposerNoteImagesResult {
  const images: NoteCaptureImage[] = []
  for (const attachment of attachments) {
    if (attachment.kind !== "image" || !isNoteImageMime(attachment.mime)) {
      return { status: "error", message: language.t("notes.composer.attachmentsUnsupported") }
    }
    const separator = attachment.dataUrl.indexOf(BASE64_DATA_URL_SEPARATOR)
    if (separator === -1) {
      return { status: "error", message: language.t("notes.composer.imageInvalid") }
    }
    const data = attachment.dataUrl.slice(separator + BASE64_DATA_URL_SEPARATOR.length)
    if (!data || data.length % 4 !== 0) {
      return { status: "error", message: language.t("notes.composer.imageInvalid") }
    }
    if (attachment.filename.length > NOTE_CAPTURE_MAX_IMAGE_FILENAME_CHARACTERS) {
      return { status: "error", message: language.t("notes.composer.imageFilenameTooLong") }
    }
    if (
      data.length > NOTE_CAPTURE_MAX_IMAGE_BASE64_CHARACTERS ||
      decodedBase64ByteLength(data) > NOTE_CAPTURE_MAX_IMAGE_BYTES
    ) {
      return { status: "error", message: language.t("notes.composer.imageTooLarge") }
    }
    if (!BASE64_PAYLOAD_PATTERN.test(data)) {
      return { status: "error", message: language.t("notes.composer.imageInvalid") }
    }
    images.push({
      filename: attachment.filename,
      mime: attachment.mime,
      data,
    })
  }
  if (images.length > NOTE_CAPTURE_MAX_IMAGES) {
    return { status: "error", message: language.t("notes.composer.tooManyImages") }
  }
  return { status: "ok", images }
}

function isComposerNoteEmpty(draft: ComposerNoteDraft) {
  return !draft.value.trim() && draft.attachments.length === 0
}

function hasSameAttachments(left: PromptComposerAttachment[], right: PromptComposerAttachment[]) {
  return (
    left.length === right.length &&
    left.every((attachment, index) => attachment.id === right[index]?.id)
  )
}

export function useComposerNoteMode(input: ComposerNoteModeInput) {
  const {
    directory,
    promptKey,
    activePromptKey,
    quotedMessage,
    saveNote,
    clearDraft,
    clearComposer,
    readDraft,
    removeQuotedMessage,
  } = input
  const [active, setActive] = useState(false)
  const [saving, setSaving] = useState(false)
  const hadQuotedMessage = useRef(false)
  const readDraftRef = useRef(readDraft)
  readDraftRef.current = readDraft

  useEffect(() => {
    setActive(false)
  }, [promptKey])

  useEffect(() => {
    const quoteRemoved = hadQuotedMessage.current && !quotedMessage
    hadQuotedMessage.current = !!quotedMessage
    if (quotedMessage) setActive(true)
    // Quoting is what opened Note mode, so dropping the quote closes it unless a note is underway.
    else if (quoteRemoved && isComposerNoteEmpty(readDraftRef.current())) setActive(false)
  }, [quotedMessage])

  const changeActive = useCallback(
    (nextActive: boolean) => {
      if (!nextActive && quotedMessage) removeQuotedMessage()
      setActive(nextActive)
    },
    [quotedMessage, removeQuotedMessage],
  )

  const submit = useCallback(
    async (draft: ComposerNoteDraft) => {
      if (!active || !saveNote) return false
      const parsedImages = parseComposerNoteImages(draft.attachments)
      if (parsedImages.status === "error") {
        toast.error(parsedImages.message)
        return true
      }
      const { images } = parsedImages

      const noteText = draft.value.trim()
      if ((!noteText && images.length === 0) || saving) return true

      setSaving(true)
      try {
        const initiatingPromptKey = promptKey
        const messageID = quotedMessageID(draft.parts)
        const saved = await saveNote(
          Object.assign(
            { text: noteText },
            messageID ? { messageID } : undefined,
            images.length > 0 ? { images } : undefined,
          ),
        )
        const destinationPromptKey = getPromptScopeKey(directory, saved.sessionID)
        const currentPromptKey = activePromptKey.current
        const liveDraft = readDraft()
        const liveDraftStillMatches =
          liveDraft.value.trim() === noteText &&
          hasSameAttachments(liveDraft.attachments, draft.attachments)

        for (const completedPromptKey of new Set([initiatingPromptKey, destinationPromptKey])) {
          if (completedPromptKey !== currentPromptKey || liveDraftStillMatches) {
            clearDraft(completedPromptKey)
          }
        }

        if (
          liveDraftStillMatches &&
          (currentPromptKey === initiatingPromptKey || currentPromptKey === destinationPromptKey)
        ) {
          clearComposer()
          setActive(false)
        }
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : language.t("notes.composer.saveFailed"),
        )
      } finally {
        setSaving(false)
      }
      return true
    },
    [
      active,
      activePromptKey,
      clearComposer,
      clearDraft,
      directory,
      promptKey,
      readDraft,
      saveNote,
      saving,
    ],
  )

  return {
    active,
    saving,
    changeActive,
    enter: () => setActive(true),
    submit,
  }
}
