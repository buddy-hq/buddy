import { useEffect, type RefObject } from "react"
import {
  arePromptPartsEqual,
  collectPromptParts,
  createPromptPartsFromValue,
  renderPromptParts,
} from "./prompt-parts"
import { getCursorPosition, setCursorPosition } from "./editor-dom"
import type { SkillPresentationLookup } from "../skills/skill-presentation"
import type { PromptComposerPart } from "./prompt-types"

type UsePromptEditorSyncProps = {
  editorRef: RefObject<HTMLDivElement | null>
  /**
   * Whether this exact draft snapshot came from the editor itself. Composer-originated
   * drafts are already on screen, so the contenteditable — not the draft — is the live
   * truth and must not be rebuilt under the caret.
   */
  composerOriginated: boolean
  draft: {
    value: string
    parts: PromptComposerPart[]
    cursor: number
  }
  knownAgents: Set<string>
  skillPresentation: SkillPresentationLookup
  setCursorOffset: (cursor: number) => void
}

export function usePromptEditorSync(props: UsePromptEditorSyncProps) {
  const { composerOriginated, draft, editorRef, knownAgents, setCursorOffset, skillPresentation } =
    props

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return

    // Draft state lands behind the editor on purpose (debounced writes, transitions), so a
    // composer-originated snapshot routinely describes text the typist has already moved past.
    // Rendering it would rebuild the DOM from stale parts and drop the caret at a stale offset.
    if (composerOriginated) return

    const nextParts =
      draft.parts.length > 0 ? draft.parts : createPromptPartsFromValue(draft.value, knownAgents)
    const domParts = collectPromptParts(editor)
    const nextCursor = Math.max(0, Math.min(draft.cursor, draft.value.length))
    const editorFocused = document.activeElement === editor

    if (arePromptPartsEqual(domParts, nextParts)) {
      if (editorFocused) {
        const currentCursor = getCursorPosition(editor)
        setCursorOffset(currentCursor)
        return
      }

      setCursorOffset(nextCursor)
      return
    }

    // Parts genuinely differ (clear after submit, store sync, etc.) — render.
    renderPromptParts(editor, nextParts, skillPresentation)
    if (editorFocused) {
      setCursorPosition(editor, nextCursor)
    }
    setCursorOffset(nextCursor)
  }, [
    composerOriginated,
    draft.cursor,
    draft.parts,
    draft.value,
    editorRef,
    knownAgents,
    setCursorOffset,
    skillPresentation,
  ])
}
