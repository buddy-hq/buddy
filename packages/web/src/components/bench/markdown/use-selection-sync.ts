import { useCallback, useRef } from "react"
import type { MarkdownBenchDocumentSelection } from "@/components/bench/markdown/editor"
import {
  appendSelectionContextToDraft,
  removeSelectionContextFromDraft,
} from "@/components/readers/utils/reading-selection-draft"
import { getPromptDraft, usePromptStore } from "@/state/prompt-store"

function createMarkdownSelectionKey() {
  const random = Math.random().toString(36).slice(2, 10)
  return `md_sel_${Date.now().toString(36)}_${random}`
}

export function useMarkdownBenchSelectionSync(input: {
  path: string
  promptKey: string | undefined
  version: string
}): (selection: MarkdownBenchDocumentSelection) => void {
  const { path, promptKey, version } = input
  const setPromptDraft = usePromptStore((state) => state.replaceDraft)
  const stagedSelectionKeyRef = useRef<string | undefined>(undefined)

  return useCallback(
    (selection: MarkdownBenchDocumentSelection) => {
      if (!promptKey) return
      const text = selection.text.trim()
      const currentDraft = getPromptDraft(usePromptStore.getState(), promptKey)
      const stagedSelectionKey = stagedSelectionKeyRef.current
      const draftWithoutPreviousSelection = stagedSelectionKey
        ? (removeSelectionContextFromDraft(currentDraft, stagedSelectionKey) ?? currentDraft)
        : currentDraft

      if (!text) {
        stagedSelectionKeyRef.current = undefined
        if (draftWithoutPreviousSelection !== currentDraft) {
          setPromptDraft(promptKey, draftWithoutPreviousSelection)
        }
        return
      }

      const selectionKey = createMarkdownSelectionKey()
      stagedSelectionKeyRef.current = selectionKey
      setPromptDraft(
        promptKey,
        appendSelectionContextToDraft(
          draftWithoutPreviousSelection,
          Object.assign(
            { source: "markdown" as const, text, selectionKey, path, version },
            selection.headingPath ? { headingPath: selection.headingPath } : undefined,
          ),
        ),
      )
    },
    [path, promptKey, setPromptDraft, version],
  )
}
