import { useQuery } from "@tanstack/react-query"
import { Badge, Card, CardContent } from "@buddy/ui"
import { language } from "@/context/language"
import { stringifyError } from "@/lib/api-client"
import { useQuestionSetSidebarActions } from "@/components/question-set/use-question-set-sidebar-actions"
import { useUiPreferences } from "@/state/ui-preferences"
import { useWorkspaceQuestionSetPanelStore } from "@/state/workspace-question-set-panel-store"
import {
  workspaceArtifactsQueryKeys,
  workspaceQuestionSetArtifactsQueryOptions,
} from "@/state/workspace-artifacts-query"
import { useInvalidateQueryOnChatIdle } from "@/components/layout/use-invalidate-query-on-chat-idle"

function questionCountLabel(count: number): string {
  return language.t(count === 1 ? "chatTools.questionCount.one" : "chatTools.questionCount.other", {
    count,
  })
}

function formatTimestamp(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return parsed.toLocaleString()
}

export function WorkspaceQuestionSetPanel(props: {
  directory: string
  selectedPersonaDefaultSurface: "curriculum" | "editor" | "figure" | "question-set"
}) {
  const artifactsQuery = useQuery(workspaceQuestionSetArtifactsQueryOptions(props.directory))
  const artifacts = artifactsQuery.data?.artifacts ?? []
  const loading = artifactsQuery.isPending
  const error = artifactsQuery.error ? stringifyError(artifactsQuery.error) : undefined
  const selectedArtifactID = useWorkspaceQuestionSetPanelStore(
    (state) => state.selectedArtifactIDByDirectory[props.directory],
  )
  const rightSidebarOpen = useUiPreferences((state) => state.rightSidebarOpen)
  const rightSidebarTab = useUiPreferences((state) => state.rightSidebarTab)
  const { openWorkspaceQuestionSet } = useQuestionSetSidebarActions()

  useInvalidateQueryOnChatIdle({
    directory: props.directory,
    queryKey: workspaceArtifactsQueryKeys.questionSet(props.directory),
  })

  function toggleQuestionSet(artifactID: string) {
    openWorkspaceQuestionSet({
      directory: props.directory,
      artifactID,
      selectedArtifactID,
      fallbackTab: props.selectedPersonaDefaultSurface,
    })
  }

  return (
    <div data-component="workspace-question-set-panel" className="flex min-h-0 flex-1 flex-col p-3">
      {loading ? (
        <div className="text-sm text-text-weak">{language.t("workspaceQuestionSet.loading")}</div>
      ) : null}

      {!loading && artifacts.length === 0 ? (
        <div className="flex w-full min-h-0 flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border-base/40 bg-surface-weak/5 px-4 py-10 text-center">
          <h3 className="text-[13px] font-medium text-text-base">
            {language.t("workspaceQuestionSet.title")}
          </h3>
          <p className="mt-1.5 max-w-[220px] text-[12px] leading-relaxed text-text-weak">
            {language.t("workspaceQuestionSet.emptyState")}
          </p>
        </div>
      ) : null}

      {artifacts.length > 0 ? (
        <div className="scrollbar-hover flex-1 min-h-0 overflow-y-auto space-y-3">
          {artifacts.map((artifact) => (
            <Card
              key={artifact.artifactID}
              size="sm"
              className="gap-0 overflow-hidden border-border-base/60 bg-surface-raised-base/70"
            >
              <button
                type="button"
                className={`w-full cursor-pointer text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${
                  selectedArtifactID === artifact.artifactID &&
                  rightSidebarOpen &&
                  rightSidebarTab === "question-set"
                    ? "bg-surface-raised-base"
                    : "hover:bg-surface-raised-base"
                }`}
                onClick={() => toggleQuestionSet(artifact.artifactID)}
              >
                <CardContent className="space-y-2 px-3 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-text-base">{artifact.title}</p>
                    <Badge variant="outline" className="shrink-0">
                      {artifact.groupType}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-text-weak">
                    <span>{questionCountLabel(artifact.questions.length)}</span>
                    <span>•</span>
                    <span>{formatTimestamp(artifact.createdAt)}</span>
                  </div>
                </CardContent>
              </button>
            </Card>
          ))}
        </div>
      ) : null}

      {error ? (
        <p className="mt-2 rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 px-2 py-1.5 text-xs text-icon-critical-base">
          {error}
        </p>
      ) : null}
    </div>
  )
}
