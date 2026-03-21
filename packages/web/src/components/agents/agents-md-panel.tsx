import type { CSSProperties } from "react"
import { useCallback } from "react"
import { MarkdownFileEditor } from "@/components/markdown/markdown-file-editor"
import {
  loadNotebookAgentsMd,
  NotebookAgentsMdVersionConflictError,
  saveNotebookAgentsMd,
} from "@/state/agents-md-actions"

type AgentsMdPanelProps = {
  directory: string
  refreshToken?: number
  className?: string
  style?: CSSProperties
}

const DEFAULT_AGENTS_MD_CONTENT = "# AGENTS.md\n\nAdd notebook-specific instructions for Buddy here.\n"

export function AgentsMdPanel(props: AgentsMdPanelProps) {
  const load = useCallback(() => loadNotebookAgentsMd(props.directory), [props.directory])
  const save = useCallback(
    (input: { content: string; expectedVersion?: string | null }) =>
      saveNotebookAgentsMd({
        directory: props.directory,
        content: input.content,
        expectedVersion: input.expectedVersion,
      }),
    [props.directory],
  )
  const reloadKey = `${props.directory}:${props.refreshToken ?? 0}`

  return (
    <MarkdownFileEditor
      reloadKey={reloadKey}
      className={props.className}
      style={props.style}
      fallbackPath={`${props.directory}/AGENTS.md`}
      headerTitle="AGENTS.md"
      headerDescription="Notebook-specific instructions loaded before each session. Autosaves after 1s."
      emptyTitle="No AGENTS.md file"
      emptyDescription="Create one to add notebook-local behavior and constraints."
      createLabel="Create AGENTS.md"
      defaultContent={DEFAULT_AGENTS_MD_CONTENT}
      load={load}
      save={save}
      isVersionConflictError={(error) => error instanceof NotebookAgentsMdVersionConflictError}
    />
  )
}
