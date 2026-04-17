import { useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Badge, Card, CardContent } from "@buddy/ui"
import { language } from "@/context/language"
import { stringifyError } from "@/lib/api-client"
import { useChatStore } from "@/state/chat-store"
import {
  workspaceArtifactsQueryKeys,
  workspaceQuestionSetArtifactsQueryOptions,
} from "@/state/workspace-artifacts-query"

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

export function WorkspaceQuestionSetPanel(props: { directory: string }) {
  const queryClient = useQueryClient()
  const artifactsQuery = useQuery(workspaceQuestionSetArtifactsQueryOptions(props.directory))
  const artifacts = artifactsQuery.data?.artifacts ?? []
  const loading = artifactsQuery.isPending
  const error = artifactsQuery.error ? stringifyError(artifactsQuery.error) : undefined

  useEffect(() => {
    let previousBusy = useChatStore.getState().directories[props.directory]?.isBusy ?? false

    const unsubscribe = useChatStore.subscribe((state) => {
      const nextBusy = state.directories[props.directory]?.isBusy ?? false

      if (previousBusy && !nextBusy) {
        void queryClient.invalidateQueries({
          queryKey: workspaceArtifactsQueryKeys.questionSet(props.directory),
        })
      }
      previousBusy = nextBusy
    })

    return () => unsubscribe()
  }, [props.directory, queryClient])

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
