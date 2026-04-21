import { useEffect, useState } from "react"
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query"
import { FileTextIcon, HelpCircleIcon, Layers2Icon, LibraryBigIcon } from "lucide-react"
import { Badge, FolderIcon, Skeleton } from "@buddy/ui"
import { FlashcardReviewDialog } from "@/components/flashcard/flashcard-review-dialog"
import { language } from "@/context/language"
import { stringifyError } from "@/lib/api-client"
import {
  getFlashcardDueCount,
  isFlashcardReviewAvailable,
  type FlashcardDueCounts,
} from "@/lib/flashcard"
import { useUiPreferences } from "@/state/ui-preferences"
import {
  resourceCoverQueryOptions,
  resourcesQueryOptions,
  type ResourceListItem,
} from "@/state/resources-query"
import { useWorkspaceQuestionSetPanelStore } from "@/state/workspace-question-set-panel-store"
import {
  workspaceArtifactsQueryKeys,
  workspaceFlashcardDecksQueryOptions,
  workspaceQuestionSetArtifactsQueryOptions,
} from "@/state/workspace-artifacts-query"
import { getFilename } from "../sidebar-helpers"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LibraryTab = "resources" | "flashcards" | "question-sets"

type LibraryResourceTarget = Pick<ResourceListItem, "path" | "name" | "resourceID" | "status">

type LibraryPanelProps = {
  directories: string[]
  onOpenResource: (directory: string, resource: LibraryResourceTarget) => void
  onOpenQuestionSet: (directory: string, artifactID: string, selectedArtifactID?: string) => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SHELF_SKELETON_COUNT = 4

const LIBRARY_TABS: { tab: LibraryTab; labelKey: string }[] = [
  { tab: "resources", labelKey: "sidebar.libraryTabResources" },
  { tab: "flashcards", labelKey: "sidebar.libraryTabFlashcards" },
  { tab: "question-sets", labelKey: "sidebar.libraryTabQuestionSets" },
]

// ---------------------------------------------------------------------------
// Shared shelf skeleton
// ---------------------------------------------------------------------------

function ShelfCardSkeleton() {
  return (
    <div className="flex w-full flex-col gap-2">
      <Skeleton className="aspect-[3/4] w-full rounded-lg" />
      <Skeleton className="h-3.5 w-3/4 rounded" />
    </div>
  )
}

function ShelfRowSkeleton() {
  return (
    <div className="flex w-full flex-col gap-2">
      <Skeleton className="h-16 w-full rounded-lg" />
    </div>
  )
}

function NotebookShelfHeader(props: { label: string; count?: number; loading: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <FolderIcon className="size-4 shrink-0 text-text-weaker" />
      <span className="truncate text-sm font-medium text-text-base">{props.label}</span>
      {!props.loading && props.count !== undefined ? (
        <span className="text-xs text-text-weaker">{props.count}</span>
      ) : null}
    </div>
  )
}

function NotebookShelfError(props: { message: string }) {
  return (
    <p className="rounded-lg border border-border-critical-base/40 bg-surface-critical-base/10 px-3 py-2 text-xs text-icon-critical-base">
      {props.message}
    </p>
  )
}

function LibraryTabErrorState(props: {
  icon: typeof Layers2Icon
  emptyLabel: string
  error?: string
}) {
  const Icon = props.icon

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Icon className="mb-3 size-10 text-text-weaker" />
      <p className="text-sm text-text-weak">{props.error ?? props.emptyLabel}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Resource shelf (existing)
// ---------------------------------------------------------------------------

function ShelfBookCover({
  directory,
  resource,
  onClick,
}: {
  directory: string
  resource: ResourceListItem
  onClick: () => void
}) {
  const coverQuery = useQuery({
    ...resourceCoverQueryOptions(directory, resource.coverRelpath ?? ""),
    enabled: !!resource.coverRelpath,
  })
  const [objectUrl, setObjectUrl] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (!coverQuery.data) {
      setObjectUrl(undefined)
      return
    }

    const nextObjectUrl = URL.createObjectURL(coverQuery.data)
    setObjectUrl(nextObjectUrl)

    return () => {
      URL.revokeObjectURL(nextObjectUrl)
    }
  }, [coverQuery.data])

  const displayName = resource.title || resource.name

  return (
    <button
      type="button"
      title={displayName}
      onClick={onClick}
      className="group flex w-full flex-col gap-2 text-left focus-visible:outline-none"
    >
      <div className="aspect-[3/4] w-full overflow-hidden rounded-lg border border-border-weaker-base bg-surface-base shadow-sm transition-all group-hover:scale-[1.03] group-hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-border-focus">
        {objectUrl ? (
          <img src={objectUrl} alt={displayName} className="size-full object-cover" />
        ) : (
          <div className="flex size-full flex-col items-center justify-center bg-surface-raised-stronger px-3 text-center">
            <FileTextIcon className="mb-1.5 size-6 text-text-weaker" />
            <span className="line-clamp-3 text-xs font-medium leading-tight text-text-base">
              {displayName}
            </span>
          </div>
        )}
      </div>
      <span className="line-clamp-2 px-0.5 text-xs font-medium leading-snug text-text-base">
        {displayName}
      </span>
    </button>
  )
}

function ResourceNotebookShelf({
  directory,
  onOpenResource,
}: {
  directory: string
  onOpenResource: (directory: string, resource: LibraryResourceTarget) => void
}) {
  const resourcesQuery = useQuery(resourcesQueryOptions(directory))
  const resources = resourcesQuery.data?.items ?? []
  const loading = resourcesQuery.isPending
  const label = getFilename(directory)

  if (!loading && resources.length === 0) return null

  return (
    <div data-component="library-shelf" className="space-y-3">
      <NotebookShelfHeader label={label} count={resources.length} loading={loading} />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {loading
          ? Array.from({ length: SHELF_SKELETON_COUNT }, (_, index) => (
              <ShelfCardSkeleton key={index} />
            ))
          : resources.map((resource) => (
              <ShelfBookCover
                key={resource.key}
                directory={directory}
                resource={resource}
                onClick={() =>
                  onOpenResource(directory, {
                    path: resource.path,
                    name: resource.name,
                    ...(resource.resourceID ? { resourceID: resource.resourceID } : {}),
                    status: resource.status,
                  })
                }
              />
            ))}
      </div>
    </div>
  )
}

function ResourcesTab({
  directories,
  onOpenResource,
}: {
  directories: string[]
  onOpenResource: (directory: string, resource: LibraryResourceTarget) => void
}) {
  const shelfQueries = useQueries({
    queries: directories.map((directory) => resourcesQueryOptions(directory)),
  })

  const allLoading = shelfQueries.every((query) => query.isPending)
  const totalResources = shelfQueries.reduce(
    (sum, query) => sum + (query.data?.items.length ?? 0),
    0,
  )
  const allLoaded = shelfQueries.every((query) => !query.isPending)
  const isEmpty = allLoaded && totalResources === 0

  if (allLoading) {
    return (
      <div className="space-y-6">
        {directories.slice(0, 3).map((directory) => (
          <div key={directory} className="space-y-3">
            <div className="flex items-center gap-2">
              <Skeleton className="size-4 rounded" />
              <Skeleton className="h-4 w-24 rounded" />
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {Array.from({ length: SHELF_SKELETON_COUNT }, (_, index) => (
                <ShelfCardSkeleton key={index} />
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <FileTextIcon className="mb-3 size-10 text-text-weaker" />
        <p className="text-sm text-text-weak">{language.t("sidebar.libraryEmpty")}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {directories.map((directory) => (
        <ResourceNotebookShelf
          key={directory}
          directory={directory}
          onOpenResource={onOpenResource}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Flashcard shelf
// ---------------------------------------------------------------------------

function FlashcardDueBadges(props: { dueCounts: FlashcardDueCounts }) {
  const { dueCounts } = props
  const total = getFlashcardDueCount(dueCounts)

  if (total === 0) {
    return (
      <span className="text-[11px] text-text-weaker">{language.t("workspaceFlashcard.noDue")}</span>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      {dueCounts.new > 0 ? (
        <span className="rounded-sm bg-surface-interactive-base/15 px-1.5 py-0.5 text-[11px] font-medium text-text-interactive-base">
          {language.t("workspaceFlashcard.dueNew", { count: dueCounts.new })}
        </span>
      ) : null}
      {dueCounts.learning > 0 ? (
        <span className="rounded-sm bg-surface-warning-base/15 px-1.5 py-0.5 text-[11px] font-medium text-icon-warning-base">
          {language.t("workspaceFlashcard.dueLearning", { count: dueCounts.learning })}
        </span>
      ) : null}
      {dueCounts.review > 0 ? (
        <span className="rounded-sm bg-surface-success-base/15 px-1.5 py-0.5 text-[11px] font-medium text-text-success-base">
          {language.t("workspaceFlashcard.dueReview", { count: dueCounts.review })}
        </span>
      ) : null}
    </div>
  )
}

function FlashcardNotebookShelf({ directory }: { directory: string }) {
  const queryClient = useQueryClient()
  const decksQuery = useQuery(workspaceFlashcardDecksQueryOptions(directory))
  const decks = decksQuery.data?.decks ?? []
  const loading = decksQuery.isPending
  const error = decksQuery.error ? stringifyError(decksQuery.error) : undefined
  const label = getFilename(directory)
  const [reviewDeck, setReviewDeck] = useState<{ deckID: string; title: string } | null>(null)

  if (!loading && decks.length === 0 && !error) return null

  return (
    <>
      <div data-component="library-flashcard-shelf" className="space-y-3">
        <NotebookShelfHeader label={label} count={decks.length} loading={loading} />

        <div className="space-y-2">
          {loading
            ? Array.from({ length: 2 }, (_, index) => <ShelfRowSkeleton key={index} />)
            : decks.map((deck) => {
                const reviewAvailable = isFlashcardReviewAvailable(deck)
                const content = (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-text-base">{deck.title}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-weak">
                          <span>
                            {language.t(
                              deck.noteCount === 1
                                ? "workspaceFlashcard.noteCount.one"
                                : "workspaceFlashcard.noteCount.other",
                              { count: deck.noteCount },
                            )}
                          </span>
                          <span className="text-text-weaker">&middot;</span>
                          <span>
                            {language.t(
                              deck.cardCount === 1
                                ? "workspaceFlashcard.cardCount.one"
                                : "workspaceFlashcard.cardCount.other",
                              { count: deck.cardCount },
                            )}
                          </span>
                        </div>
                      </div>
                      <Layers2Icon className="mt-0.5 size-4 shrink-0 text-text-weaker" />
                    </div>
                    <div className="mt-2">
                      <FlashcardDueBadges dueCounts={deck.dueCounts} />
                    </div>
                  </>
                )

                return reviewAvailable ? (
                  <button
                    key={deck.deckID}
                    type="button"
                    onClick={() => setReviewDeck({ deckID: deck.deckID, title: deck.title })}
                    className="w-full rounded-lg border border-border-weaker-base bg-surface-base p-3 text-left shadow-sm transition-colors hover:border-border-hover hover:bg-surface-raised-base"
                  >
                    {content}
                  </button>
                ) : (
                  <div
                    key={deck.deckID}
                    className="rounded-lg border border-border-weaker-base bg-surface-base p-3 shadow-sm"
                  >
                    {content}
                  </div>
                )
              })}
          {error ? <NotebookShelfError message={error} /> : null}
        </div>
      </div>

      {reviewDeck ? (
        <FlashcardReviewDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setReviewDeck(null)
              void queryClient.invalidateQueries({
                queryKey: workspaceArtifactsQueryKeys.flashcard(directory),
              })
            }
          }}
          directory={directory}
          deckID={reviewDeck.deckID}
          deckTitle={reviewDeck.title}
        />
      ) : null}
    </>
  )
}

function FlashcardsTab({ directories }: { directories: string[] }) {
  const shelfQueries = useQueries({
    queries: directories.map((directory) => workspaceFlashcardDecksQueryOptions(directory)),
  })

  const allLoading = shelfQueries.every((query) => query.isPending)
  const totalDecks = shelfQueries.reduce((sum, query) => sum + (query.data?.decks.length ?? 0), 0)
  const allLoaded = shelfQueries.every((query) => !query.isPending)
  const loadError = shelfQueries.find((query) => query.error)?.error

  if (allLoading) {
    return (
      <div className="space-y-6">
        {directories.slice(0, 3).map((directory) => (
          <div key={directory} className="space-y-3">
            <div className="flex items-center gap-2">
              <Skeleton className="size-4 rounded" />
              <Skeleton className="h-4 w-24 rounded" />
            </div>
            <div className="space-y-2">
              {Array.from({ length: 2 }, (_, index) => (
                <ShelfRowSkeleton key={index} />
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (allLoaded && totalDecks === 0) {
    return (
      <LibraryTabErrorState
        icon={Layers2Icon}
        emptyLabel={language.t("sidebar.libraryFlashcardsEmpty")}
        error={loadError ? stringifyError(loadError) : undefined}
      />
    )
  }

  return (
    <div className="space-y-6">
      {directories.map((directory) => (
        <FlashcardNotebookShelf key={directory} directory={directory} />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Question set shelf
// ---------------------------------------------------------------------------

function QuestionSetNotebookShelf(props: {
  directory: string
  onOpenQuestionSet: (directory: string, artifactID: string, selectedArtifactID?: string) => void
}) {
  const { directory, onOpenQuestionSet } = props
  const setsQuery = useQuery(workspaceQuestionSetArtifactsQueryOptions(directory))
  const sets = setsQuery.data?.artifacts ?? []
  const loading = setsQuery.isPending
  const error = setsQuery.error ? stringifyError(setsQuery.error) : undefined
  const label = getFilename(directory)
  const selectedArtifactID = useWorkspaceQuestionSetPanelStore(
    (store) => store.selectedArtifactIDByDirectory[directory],
  )
  const rightSidebarOpen = useUiPreferences((store) => store.rightSidebarOpen)
  const rightSidebarTab = useUiPreferences((store) => store.rightSidebarTab)

  if (!loading && sets.length === 0 && !error) return null

  return (
    <div data-component="library-question-set-shelf" className="space-y-3">
      <NotebookShelfHeader label={label} count={sets.length} loading={loading} />

      <div className="space-y-2">
        {loading
          ? Array.from({ length: 2 }, (_, index) => <ShelfRowSkeleton key={index} />)
          : sets.map((artifact) => (
              <button
                key={artifact.artifactID}
                type="button"
                onClick={() => {
                  onOpenQuestionSet(directory, artifact.artifactID, selectedArtifactID)
                }}
                className={`w-full rounded-lg border bg-surface-base p-3 text-left shadow-sm transition-colors ${
                  rightSidebarOpen &&
                  rightSidebarTab === "question-set" &&
                  selectedArtifactID === artifact.artifactID
                    ? "border-border-interactive-base bg-surface-raised-base"
                    : "border-border-weaker-base hover:border-border-hover hover:bg-surface-raised-base"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text-base">{artifact.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-weak">
                      <span>
                        {language.t(
                          artifact.questions.length === 1
                            ? "chatTools.questionCount.one"
                            : "chatTools.questionCount.other",
                          { count: artifact.questions.length },
                        )}
                      </span>
                      <span className="text-text-weaker">&middot;</span>
                      <span>{new Date(artifact.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {artifact.groupType}
                  </Badge>
                </div>
              </button>
            ))}
        {error ? <NotebookShelfError message={error} /> : null}
      </div>
    </div>
  )
}

function QuestionSetsTab(props: {
  directories: string[]
  onOpenQuestionSet: (directory: string, artifactID: string, selectedArtifactID?: string) => void
}) {
  const { directories, onOpenQuestionSet } = props
  const shelfQueries = useQueries({
    queries: directories.map((directory) => workspaceQuestionSetArtifactsQueryOptions(directory)),
  })

  const allLoading = shelfQueries.every((query) => query.isPending)
  const totalSets = shelfQueries.reduce(
    (sum, query) => sum + (query.data?.artifacts.length ?? 0),
    0,
  )
  const allLoaded = shelfQueries.every((query) => !query.isPending)
  const loadError = shelfQueries.find((query) => query.error)?.error

  if (allLoading) {
    return (
      <div className="space-y-6">
        {directories.slice(0, 3).map((directory) => (
          <div key={directory} className="space-y-3">
            <div className="flex items-center gap-2">
              <Skeleton className="size-4 rounded" />
              <Skeleton className="h-4 w-24 rounded" />
            </div>
            <div className="space-y-2">
              {Array.from({ length: 2 }, (_, index) => (
                <ShelfRowSkeleton key={index} />
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (allLoaded && totalSets === 0) {
    return (
      <LibraryTabErrorState
        icon={HelpCircleIcon}
        emptyLabel={language.t("sidebar.libraryQuestionSetsEmpty")}
        error={loadError ? stringifyError(loadError) : undefined}
      />
    )
  }

  return (
    <div className="space-y-6">
      {directories.map((directory) => (
        <QuestionSetNotebookShelf
          key={directory}
          directory={directory}
          onOpenQuestionSet={onOpenQuestionSet}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function LibraryPanel({
  directories,
  onOpenResource,
  onOpenQuestionSet,
}: LibraryPanelProps) {
  const [activeTab, setActiveTab] = useState<LibraryTab>("resources")

  return (
    <div data-component="library-panel" className="space-y-6">
      <div className="flex items-center gap-2.5">
        <LibraryBigIcon className="size-5 text-text-weak" />
        <h2 className="text-base font-semibold text-text-strong">
          {language.t("sidebar.library")}
        </h2>
      </div>

      <div className="flex gap-1 border-b border-border-base">
        {LIBRARY_TABS.map(({ tab, labelKey }) => (
          <button
            key={tab}
            type="button"
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === tab
                ? "border-b-2 border-text-interactive-base text-text-interactive-base"
                : "text-text-weak hover:text-text-base"
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {language.t(labelKey)}
          </button>
        ))}
      </div>

      {activeTab === "resources" ? (
        <ResourcesTab directories={directories} onOpenResource={onOpenResource} />
      ) : activeTab === "flashcards" ? (
        <FlashcardsTab directories={directories} />
      ) : (
        <QuestionSetsTab directories={directories} onOpenQuestionSet={onOpenQuestionSet} />
      )}
    </div>
  )
}
