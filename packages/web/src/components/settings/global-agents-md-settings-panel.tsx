import { useCallback } from "react"
import { MarkdownFileEditor } from "@/components/markdown/markdown-file-editor"
import {
  GlobalAgentsMdVersionConflictError,
  loadGlobalAgentsMd,
  saveGlobalAgentsMd,
} from "@/state/global-agents-md-actions"

const DEFAULT_GLOBAL_AGENTS_MD_CONTENT = "# AGENTS.md\n\nAdd global instructions for Buddy here.\n"

export function GlobalAgentsMdSettingsPanel(props: { active: boolean }) {
  const load = useCallback(() => loadGlobalAgentsMd(), [])
  const save = useCallback(
    (input: { content: string; expectedVersion?: string | null }) =>
      saveGlobalAgentsMd({
        content: input.content,
        expectedVersion: input.expectedVersion,
      }),
    [],
  )

  return (
    <MarkdownFileEditor
      active={props.active}
      className="h-full min-h-0 flex-1 rounded-lg border border-border-base/70 bg-background-base"
      fallbackPath="global/AGENTS.md"
      emptyTitle="No global AGENTS.md file"
      emptyDescription="Create one to define baseline instructions for Buddy across notebooks."
      createLabel="Create AGENTS.md"
      defaultContent={DEFAULT_GLOBAL_AGENTS_MD_CONTENT}
      load={load}
      save={save}
      isVersionConflictError={(error) => error instanceof GlobalAgentsMdVersionConflictError}
    />
  )
}
