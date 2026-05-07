import { useEffect, type MutableRefObject, type RefObject } from "react"
import { collectPromptParts, createPromptPartsFromValue, renderPromptParts } from "./prompt-parts"
import { getCursorPosition, setCursorPosition } from "./editor-dom"
import type { PromptComposerPart } from "./prompt-types"

function arePromptPartsEqual(left: PromptComposerPart[], right: PromptComposerPart[]) {
  if (left.length !== right.length) return false

  for (let index = 0; index < left.length; index += 1) {
    const leftPart = left[index]
    const rightPart = right[index]
    if (!leftPart || !rightPart) return false
    if (leftPart.type !== rightPart.type) return false
    if ("text" in leftPart && "text" in rightPart && leftPart.text !== rightPart.text) return false
    if ("name" in leftPart && "name" in rightPart && leftPart.name !== rightPart.name) return false
    if ("path" in leftPart && "path" in rightPart && leftPart.path !== rightPart.path) return false
    if ("key" in leftPart && "key" in rightPart && leftPart.key !== rightPart.key) return false
    if ("resourceKey" in leftPart && "resourceKey" in rightPart) {
      if (leftPart.resourceKey !== rightPart.resourceKey) return false
    }
    if ("cfi" in leftPart && "cfi" in rightPart && leftPart.cfi !== rightPart.cfi) return false
    if ("index" in leftPart && "index" in rightPart && leftPart.index !== rightPart.index) {
      return false
    }
    if ("tocLabel" in leftPart && "tocLabel" in rightPart) {
      if (leftPart.tocLabel !== rightPart.tocLabel) return false
    }
    if ("pageLabel" in leftPart && "pageLabel" in rightPart) {
      if (leftPart.pageLabel !== rightPart.pageLabel) return false
    }
    if ("locationLabel" in leftPart && "locationLabel" in rightPart) {
      if (leftPart.locationLabel !== rightPart.locationLabel) return false
    }
  }

  return true
}

type UsePromptEditorSyncProps = {
  editorRef: RefObject<HTMLDivElement | null>
  mirrorInputRef: MutableRefObject<boolean>
  draft: {
    value: string
    parts: PromptComposerPart[]
    cursor: number
  }
  knownAgents: Set<string>
  setCursorOffset: (cursor: number) => void
}

export function usePromptEditorSync(props: UsePromptEditorSyncProps) {
  const { draft, editorRef, knownAgents, mirrorInputRef, setCursorOffset } = props

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

    if (arePromptPartsEqual(domParts, nextParts)) {
      if (document.activeElement === editor) {
        const currentCursor = getCursorPosition(editor)
        if (currentCursor !== nextCursor) {
          setCursorPosition(editor, nextCursor)
        }
      }
      setCursorOffset(nextCursor)
      return
    }

    renderPromptParts(editor, nextParts)
    if (document.activeElement === editor) {
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
  ])
}
