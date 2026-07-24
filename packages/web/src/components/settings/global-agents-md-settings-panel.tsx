import { useCallback } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { MarkdownWysiwygFileEditor } from "@/components/markdown/markdown-wysiwyg-file-editor"
import { language } from "@/context/language"
import {
  GlobalAgentsMdVersionConflictError,
  saveGlobalAgentsMd,
} from "@/state/global-agents-md-actions"
import { globalAgentsMdQueryOptions, setGlobalAgentsMdQueryData } from "@/state/agents-md-query"

const DEFAULT_GLOBAL_AGENTS_MD_CONTENT = "# AGENTS.md\n\nAdd global instructions for Buddy here.\n"

export function GlobalAgentsMdSettingsPanel(props: { active: boolean }) {
  const queryClient = useQueryClient()
  const load = useCallback(
    () => queryClient.ensureQueryData(globalAgentsMdQueryOptions()),
    [queryClient],
  )
  const save = useCallback(
    async (input: { content: string; expectedVersion?: string | null }) => {
      const saved = await saveGlobalAgentsMd({
        content: input.content,
        expectedVersion: input.expectedVersion,
      })
      setGlobalAgentsMdQueryData(queryClient, {
        path: saved.path,
        exists: true,
        content: saved.content,
        version: saved.version,
      })
      return saved
    },
    [queryClient],
  )

  return (
    <MarkdownWysiwygFileEditor
      active={props.active}
      className="h-full min-h-0 flex-1"
      fallbackPath="global/AGENTS.md"
      emptyTitle={language.t("agentsMd.globalEmptyTitle")}
      emptyDescription={language.t("agentsMd.globalEmptyDescription")}
      createLabel={language.t("agentsMd.createLabel")}
      defaultContent={DEFAULT_GLOBAL_AGENTS_MD_CONTENT}
      load={load}
      save={save}
      isVersionConflictError={(error) => error instanceof GlobalAgentsMdVersionConflictError}
    />
  )
}
