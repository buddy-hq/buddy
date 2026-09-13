import { toast } from "@buddy/ui"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  SELECTION_CONTEXT_PART_TYPE,
  type PromptComposerPart,
  type PromptMessageSelectionContextPart,
} from "@/components/prompt/prompt-types"
import { language } from "@/context/language"
import { getPromptScopeKey, type PromptDraftState, type PromptStore } from "@/state/prompt-store"

export type SaveComposerNote = (input: {
  text: string
  messageID?: string
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

function quotedMessageID(parts: PromptComposerPart[]) {
  return parts.find(
    (part): part is PromptMessageSelectionContextPart =>
      part.type === SELECTION_CONTEXT_PART_TYPE && part.source === "message",
  )?.quotedMessageID
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
    else if (quoteRemoved && !readDraftRef.current().value.trim()) setActive(false)
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
      if (draft.attachments.length > 0) {
        toast.error(language.t("notes.composer.attachmentsUnsupported"))
        return true
      }

      const noteText = draft.value.trim()
      if (!noteText || saving) return true

      setSaving(true)
      try {
        const initiatingPromptKey = promptKey
        const messageID = quotedMessageID(draft.parts)
        const saved = await saveNote(
          Object.assign({ text: noteText }, messageID ? { messageID } : undefined),
        )
        const destinationPromptKey = getPromptScopeKey(directory, saved.sessionID)
        const currentPromptKey = activePromptKey.current
        const liveDraftStillMatches = readDraft().value.trim() === noteText

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
