import { useCallback, useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { MarkdownFileEditor } from "@/components/markdown/markdown-file-editor"
import { language } from "@/context/language"
import {
  NotebookAgentsMdVersionConflictError,
  saveNotebookAgentsMd,
} from "@/state/agents-md-actions"
import {
  agentsMdQueryKeys,
  notebookAgentsMdQueryOptions,
  setNotebookAgentsMdQueryData,
} from "@/state/agents-md-query"
import { DEFAULT_NOTEBOOK_AGENTS_MD_CONTENT } from "@/lib/ensure-notebook-agents-md"

type AgentsMdPanelProps = {
  directory: string
  refreshToken?: number
  className?: string
}

export function AgentsMdPanel(props: AgentsMdPanelProps) {
  const queryClient = useQueryClient()
  const previousRefreshTokenRef = useRef<number | undefined>(props.refreshToken)

  useEffect(() => {
    if (previousRefreshTokenRef.current === props.refreshToken) {
      return
    }

    previousRefreshTokenRef.current = props.refreshToken
    void queryClient.invalidateQueries({
      queryKey: agentsMdQueryKeys.notebook(props.directory),
    })
  }, [props.directory, props.refreshToken, queryClient])

  const load = useCallback(
    () => queryClient.ensureQueryData(notebookAgentsMdQueryOptions(props.directory)),
    [props.directory, queryClient],
  )
  const save = useCallback(
    async (input: { content: string; expectedVersion?: string | null }) => {
      const saved = await saveNotebookAgentsMd({
        directory: props.directory,
        content: input.content,
        expectedVersion: input.expectedVersion,
      })
      setNotebookAgentsMdQueryData(queryClient, props.directory, {
        path: saved.path,
        exists: true,
        content: saved.content,
        version: saved.version,
      })
      return saved
    },
    [props.directory, queryClient],
  )
  const reloadKey = `${props.directory}:${props.refreshToken ?? 0}`

  return (
    <MarkdownFileEditor
      reloadKey={reloadKey}
      className={props.className}
      fallbackPath={`${props.directory}/AGENTS.md`}
      emptyTitle={language.t("agentsMd.notebookEmptyTitle")}
      emptyDescription={language.t("agentsMd.notebookEmptyDescription")}
      createLabel={language.t("agentsMd.createLabel")}
      defaultContent={DEFAULT_NOTEBOOK_AGENTS_MD_CONTENT}
      load={load}
      save={save}
      isVersionConflictError={(error) => error instanceof NotebookAgentsMdVersionConflictError}
    />
  )
}
