import { useQuery } from "@tanstack/react-query"
import { Badge, Card, CardContent } from "@buddy/ui"
import { language } from "@/context/language"
import { stringifyError } from "@/lib/api-client"
import {
  objectQuestionSetPayloadQueryOptions,
  workspaceObjectsQueryKeys,
  workspaceQuestionSetObjectsQueryOptions,
} from "@/state/workspace-objects-query"
import {
  createBenchObjectTarget,
  selectQuestionSetObjects,
  workspaceObjectLoadErrorKey,
  type QuestionSetLibraryObject,
} from "@/components/layout/chat-left-sidebar/library-object-selectors"
import { useInvalidateQueryOnChatIdle } from "@/components/layout/use-invalidate-query-on-chat-idle"
import { BENCH_MODE_REQUEST_POLICY, useOpenBench } from "@/lib/bench-navigation"

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

function WorkspaceQuestionSetPanelItem(props: {
  directory: string
  objectStub: QuestionSetLibraryObject
}) {
  const openBenchRoute = useOpenBench()
  const detailQuery = useQuery({
    ...objectQuestionSetPayloadQueryOptions({
      directory: props.directory,
      objectID: props.objectStub.objectID,
    }),
    refetchOnMount: false,
  })
  const questionSet = detailQuery.data
  const questionCount = questionSet?.questions.length

  return (
    <>
      <Card
        size="sm"
        className="gap-0 overflow-hidden border-border-base/60 bg-surface-raised-base/70"
      >
        <button
          type="button"
          className="w-full cursor-pointer text-left transition-colors hover:bg-surface-raised-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-50"
          onClick={() => {
            void openBenchRoute({
              directory: props.directory,
              target: createBenchObjectTarget("question-set", props.objectStub.objectID),
              mode: BENCH_MODE_REQUEST_POLICY,
              autoOpen: null,
            })
          }}
        >
          <CardContent className="space-y-2 px-3 py-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-text-base">
                {questionSet?.title ?? props.objectStub.title}
              </p>
              {questionSet ? (
                <Badge variant="outline" className="shrink-0">
                  {questionSet.groupType}
                </Badge>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-text-weak">
              {questionCount !== undefined ? (
                <>
                  <span>{questionCountLabel(questionCount)}</span>
                  <span>•</span>
                </>
              ) : null}
              <span>{formatTimestamp(questionSet?.createdAt ?? props.objectStub.updatedAt)}</span>
            </div>
            {detailQuery.error ? (
              <p className="text-xs text-icon-critical-base">{stringifyError(detailQuery.error)}</p>
            ) : null}
          </CardContent>
        </button>
      </Card>
    </>
  )
}

export function WorkspaceQuestionSetPanel(props: {
  directory: string
  selectedPersonaDefaultSurface: "curriculum" | "editor" | "question-set"
}) {
  const objectsQuery = useQuery(workspaceQuestionSetObjectsQueryOptions(props.directory))
  const objects = selectQuestionSetObjects(objectsQuery)
  const loadErrors = objectsQuery.data?.loadErrors ?? []
  const loading = objectsQuery.isPending
  const error = objectsQuery.error ? stringifyError(objectsQuery.error) : undefined

  useInvalidateQueryOnChatIdle({
    directory: props.directory,
    queryKey: workspaceObjectsQueryKeys.questionSet(props.directory),
  })

  return (
    <div data-component="workspace-question-set-panel" className="flex min-h-0 flex-1 flex-col p-3">
      {loading ? (
        <div className="text-sm text-text-weak">{language.t("workspaceQuestionSet.loading")}</div>
      ) : null}

      {!loading && objects.length === 0 && loadErrors.length === 0 ? (
        <div className="flex w-full min-h-0 flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border-base/40 bg-surface-weak/5 px-4 py-10 text-center">
          <h3 className="text-[13px] font-medium text-text-base">
            {language.t("workspaceQuestionSet.title")}
          </h3>
          <p className="mt-1.5 max-w-[220px] text-[12px] leading-relaxed text-text-weak">
            {language.t("workspaceQuestionSet.emptyState")}
          </p>
        </div>
      ) : null}

      {objects.length > 0 ? (
        <div className="scrollbar-hover flex-1 min-h-0 overflow-y-auto space-y-3">
          {objects.map((object) => (
            <WorkspaceQuestionSetPanelItem
              key={object.objectID}
              directory={props.directory}
              objectStub={object}
            />
          ))}
        </div>
      ) : null}

      {error ? (
        <p className="mt-2 rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 px-2 py-1.5 text-xs text-icon-critical-base">
          {error}
        </p>
      ) : null}

      {loadErrors.map((loadError) => (
        <p
          key={workspaceObjectLoadErrorKey(loadError)}
          className="mt-2 rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 px-2 py-1.5 text-xs text-icon-critical-base"
        >
          {loadError.message}
        </p>
      ))}
    </div>
  )
}
