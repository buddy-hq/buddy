import { useEffect, type MutableRefObject, type RefObject } from "react"
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
  mirrorInputRef: MutableRefObject<boolean>
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
  const { draft, editorRef, knownAgents, mirrorInputRef, setCursorOffset, skillPresentation } =
    props

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return

    if (mirrorInputRef.current) {
      mirrorInputRef.current = false
      return
    }

    const nextParts =
      draft.parts.length > 0 ? draft.parts : createPromptPartsFromValue(draft.value, knownAgents)
    const nextCursor = Math.max(0, Math.min(draft.cursor, draft.value.length))
    const domParts = collectPromptParts(editor)
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
    draft.cursor,
    draft.parts,
    draft.value,
    editorRef,
    knownAgents,
    mirrorInputRef,
    setCursorOffset,
    skillPresentation,
  ])
}
