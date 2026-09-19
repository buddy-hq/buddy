import { useCallback } from "react"
import { CITATION_SCHEMA_VERSION, type Citation } from "@buddy/citation-contract"
import type { MarkdownBenchDocumentSelection } from "@/components/bench/markdown/editor"
import { appendCitationToDraft } from "@/components/readers/utils/reading-selection-draft"
import { readPromptComposerLiveDraft } from "@/components/prompt/prompt-composer-live-draft"
import { usePromptStore } from "@/state/prompt-store"
import { requestCitationComment, type CitationCommentSource } from "@/lib/citations/comment-request"

function createMarkdownSelectionKey() {
  const random = Math.random().toString(36).slice(2, 10)
  return `md_sel_${Date.now().toString(36)}_${random}`
}

export function useMarkdownBenchSelectionSync(input: {
  directory: string
  path: string
  promptKey: string | undefined
  version: string
}): (selection: MarkdownBenchDocumentSelection, commentSource?: CitationCommentSource) => void {
  const { directory, path, promptKey, version } = input
  const setPromptDraft = usePromptStore((state) => state.replaceDraft)
  return useCallback(
    (selection: MarkdownBenchDocumentSelection, commentSource?: CitationCommentSource) => {
      if (!promptKey) return
      const text = selection.text
      if (!text.trim()) return
      const currentDraft = readPromptComposerLiveDraft(promptKey)
      const selectionKey = createMarkdownSelectionKey()
      const citation: Citation = Object.assign(
        {
          schemaVersion: CITATION_SCHEMA_VERSION,
          id: selectionKey,
          excerpt: text,
          source: {
            kind: "document" as const,
            directory,
            path,
            revision: version,
            selector: selection.selector,
          },
        },
        selection.headingPath
          ? { presentation: { headingPath: selection.headingPath } }
          : undefined,
      )
      requestCitationComment(citation.id, commentSource)
      setPromptDraft(promptKey, appendCitationToDraft(currentDraft, citation))
    },
    [directory, path, promptKey, setPromptDraft, version],
  )
}
