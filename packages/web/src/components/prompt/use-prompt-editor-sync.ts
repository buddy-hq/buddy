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
  useEffect(() => {
    const editor = props.editorRef.current
    if (!editor) return

    if (props.mirrorInputRef.current) {
      props.mirrorInputRef.current = false
      return
    }

    const nextParts =
      props.draft.parts.length > 0 ? props.draft.parts : createPromptPartsFromValue(props.draft.value, props.knownAgents)
    const nextCursor = Math.max(0, Math.min(props.draft.cursor, props.draft.value.length))
    const domParts = collectPromptParts(editor)

    if (arePromptPartsEqual(domParts, nextParts)) {
      if (document.activeElement === editor) {
        const currentCursor = getCursorPosition(editor)
        if (currentCursor !== nextCursor) {
          setCursorPosition(editor, nextCursor)
        }
      }
      props.setCursorOffset(nextCursor)
      return
    }

    renderPromptParts(editor, nextParts)
    if (document.activeElement === editor) {
      setCursorPosition(editor, nextCursor)
    }
    props.setCursorOffset(nextCursor)
  }, [props.draft.cursor, props.draft.parts, props.draft.value, props.editorRef, props.knownAgents, props.mirrorInputRef, props.setCursorOffset])
}
