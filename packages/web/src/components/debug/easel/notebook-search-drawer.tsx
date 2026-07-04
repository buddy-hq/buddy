import { useEffect, useRef, useState } from "react"
import {
  Badge,
  BookOpenIcon,
  BrainIcon,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Input,
  Skeleton,
  SlidersHorizontalIcon,
  Spinner,
  XIcon,
} from "@buddy/ui"
import {
  ChevronDownIcon,
  FileIcon,
  MessageSquareTextIcon,
  PresentationIcon,
  SearchIcon,
  ShapesIcon,
  type LucideIcon,
} from "lucide-react"

type EaselSearchResultKind = "thread" | "source" | "creation" | "practice" | "board" | "file"

type EaselSearchFilter = "all" | EaselSearchResultKind

export type EaselSearchResult = {
  id: string
  kind: EaselSearchResultKind
  title: string
  metadata: string
  keywords: string
}

type NotebookSearchDrawerProps = {
  lotsOfContent: boolean
  onClose: () => void
  onOpenResult: (result: EaselSearchResult) => void
}

type SearchKindDefinition = {
  kind: EaselSearchResultKind
  label: string
  singularLabel: string
  icon: LucideIcon
}

const SEARCH_SETTLE_DELAY_MS = 550
const STRESS_RESULTS_PER_KIND = 28
const PRE_SEARCH_RESULT_LIMIT = 6
const SEARCHING_ROW_COUNT = 5

const SEARCH_KIND_DEFINITIONS: SearchKindDefinition[] = [
  {
    kind: "thread",
    label: "Threads",
    singularLabel: "Thread",
    icon: MessageSquareTextIcon,
  },
  {
    kind: "source",
    label: "Sources",
    singularLabel: "Source",
    icon: BookOpenIcon,
  },
  {
    kind: "creation",
    label: "Creations",
    singularLabel: "Creation",
    icon: ShapesIcon,
  },
  {
    kind: "practice",
    label: "Practice",
    singularLabel: "Practice",
    icon: BrainIcon,
  },
  {
    kind: "board",
    label: "Boards",
    singularLabel: "Board",
    icon: PresentationIcon,
  },
  {
    kind: "file",
    label: "Files",
    singularLabel: "File",
    icon: FileIcon,
  },
]

const BASE_SEARCH_RESULTS: EaselSearchResult[] = [
  {
    id: "thread-industrial-revolution",
    kind: "thread",
    title: "Industrial Revolution study plan",
    metadata: "Thread · Updated 8 minutes ago",
    keywords: "factory history lesson discussion",
  },
  {
    id: "source-history-western-education",
    kind: "source",
    title: "The History of Western Education",
    metadata: "Source · EPUB · John William Adamson",
    keywords: "book education history reading",
  },
  {
    id: "creation-industrial-timeline",
    kind: "creation",
    title: "Industrial Revolution timeline",
    metadata: "Creation · Media · 3 days ago",
    keywords: "diagram widget visual history",
  },
  {
    id: "practice-industrial-review",
    kind: "practice",
    title: "Industrial Revolution review",
    metadata: "Practice · 12 questions · Not started",
    keywords: "question set quiz history",
  },
  {
    id: "board-industrial-map",
    kind: "board",
    title: "Industrial Revolution concept map",
    metadata: "Board · Edited yesterday",
    keywords: "whiteboard map history",
  },
  {
    id: "file-industrial-notes",
    kind: "file",
    title: "industrial-revolution-notes.md",
    metadata: "File · notes/history",
    keywords: "markdown lesson notes",
  },
  {
    id: "thread-learning-theories",
    kind: "thread",
    title: "Learning theories and classroom practice",
    metadata: "Thread · Updated yesterday",
    keywords: "pedagogy education discussion",
  },
  {
    id: "source-make-it-stick",
    kind: "source",
    title: "Make It Stick",
    metadata: "Source · EPUB · Ready",
    keywords: "book learning memory reading",
  },
  {
    id: "creation-cell-structure",
    kind: "creation",
    title: "Cell structure",
    metadata: "Creation · Diagram · Yesterday",
    keywords: "biology visual",
  },
  {
    id: "practice-western-education",
    kind: "practice",
    title: "Western education",
    metadata: "Practice · 84 cards · 12 due",
    keywords: "flashcards history",
  },
  {
    id: "board-notebook",
    kind: "board",
    title: "Notebook board",
    metadata: "Board · Edited today",
    keywords: "whiteboard working notes",
  },
  {
    id: "file-agents",
    kind: "file",
    title: "AGENTS.md",
    metadata: "File · Notebook root",
    keywords: "instructions agents markdown",
  },
]

const STRESS_SEARCH_RESULTS: EaselSearchResult[] = SEARCH_KIND_DEFINITIONS.flatMap((definition) =>
  Array.from({ length: STRESS_RESULTS_PER_KIND }, (_, index) => ({
    id: `stress-${definition.kind}-${index + 1}`,
    kind: definition.kind,
    title: `Industrial learning ${definition.singularLabel.toLocaleLowerCase()} ${index + 1}`,
    metadata: `${definition.singularLabel} · Updated ${index + 1} hours ago`,
    keywords: "industrial revolution education history notebook",
  })),
)

const RECENT_RESULT_IDS = [
  "thread-industrial-revolution",
  "source-history-western-education",
  "creation-cell-structure",
  "practice-western-education",
  "board-notebook",
  "file-agents",
] as const

function searchKindDefinition(kind: EaselSearchResultKind): SearchKindDefinition {
  const definition = SEARCH_KIND_DEFINITIONS.find((candidate) => candidate.kind === kind)
  if (!definition) {
    throw new Error(`Unknown Easel search result kind: ${kind}`)
  }
  return definition
}

function isEaselSearchFilter(value: string): value is EaselSearchFilter {
  return value === "all" || SEARCH_KIND_DEFINITIONS.some((definition) => definition.kind === value)
}

function searchFilterLabel(filter: EaselSearchFilter): string {
  if (filter === "all") return "All types"
  return searchKindDefinition(filter).label
}

function normalizedSearchText(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function resultMatchesQuery(result: EaselSearchResult, query: string): boolean {
  const tokens = normalizedSearchText(query).split(/\s+/u).filter(Boolean)
  const searchableText = normalizedSearchText(
    `${result.title} ${result.metadata} ${result.keywords}`,
  )
  return tokens.every((token) => searchableText.includes(token))
}

function resultMatchesFilter(result: EaselSearchResult, filter: EaselSearchFilter): boolean {
  return filter === "all" || result.kind === filter
}

function SearchResultRow(props: {
  result: EaselSearchResult
  onOpen: (result: EaselSearchResult) => void
}) {
  const definition = searchKindDefinition(props.result.kind)
  const Icon = definition.icon

  return (
    <Button
      type="button"
      variant="ghost"
      className="h-auto w-full justify-start px-2 py-2 text-left"
      onClick={() => props.onOpen(props.result)}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border-weaker-base bg-surface-raised-base text-icon-base">
        <Icon aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
        <span className="w-full truncate text-sm text-text-base">{props.result.title}</span>
        <span className="w-full truncate text-xs font-normal text-text-weaker">
          {props.result.metadata}
        </span>
      </span>
    </Button>
  )
}

function SearchLoadingRows() {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      {Array.from({ length: SEARCHING_ROW_COUNT }, (_, index) => (
        <div key={index} className="flex items-center gap-3 px-2 py-2">
          <Skeleton className="size-9 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-2.5 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function NotebookSearchDrawer(props: NotebookSearchDrawerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState("")
  const [settledQuery, setSettledQuery] = useState("")
  const [filter, setFilter] = useState<EaselSearchFilter>("all")
  const [isSearching, setIsSearching] = useState(false)
  const searchResults = props.lotsOfContent
    ? [...BASE_SEARCH_RESULTS, ...STRESS_SEARCH_RESULTS]
    : BASE_SEARCH_RESULTS
  const hasQuery = normalizedSearchText(query).length > 0
  const visibleResults = searchResults.filter(
    (result) => resultMatchesFilter(result, filter) && resultMatchesQuery(result, settledQuery),
  )
  const recentResults = RECENT_RESULT_IDS.map((id) =>
    searchResults.find((result) => result.id === id),
  )
    .filter((result): result is EaselSearchResult => result !== undefined)
    .slice(0, PRE_SEARCH_RESULT_LIMIT)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!hasQuery) {
      setIsSearching(false)
      setSettledQuery("")
      return
    }

    setIsSearching(true)
    const timeout = setTimeout(() => {
      setSettledQuery(query)
      setIsSearching(false)
    }, SEARCH_SETTLE_DELAY_MS)

    return () => clearTimeout(timeout)
  }, [hasQuery, props.lotsOfContent, query])

  return (
    <div className="flex h-full min-h-0 flex-col bg-background-base">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border-weaker-base px-3">
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-text-strong">Search</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Close Search"
          onClick={props.onClose}
        >
          <XIcon aria-hidden />
        </Button>
      </div>

      <div className="shrink-0 border-b border-border-weaker-base p-3">
        <div className="relative">
          {isSearching ? (
            <Spinner className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-icon-base" />
          ) : (
            <SearchIcon
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-icon-base"
              aria-hidden
            />
          )}
          <Input
            ref={inputRef}
            value={query}
            aria-label="Search this notebook"
            placeholder="Search this notebook…"
            className="pl-9"
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
        {!hasQuery ? (
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3 px-1">
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-weaker">
                Recently opened
              </p>
              {props.lotsOfContent ? (
                <Badge variant="outline">{searchResults.length} searchable</Badge>
              ) : null}
            </div>
            <div className="flex flex-col gap-1">
              {recentResults.map((result) => (
                <SearchResultRow key={result.id} result={result} onOpen={props.onOpenResult} />
              ))}
            </div>
          </section>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex shrink-0 items-center justify-between gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="sm">
                    <SlidersHorizontalIcon data-icon="inline-start" aria-hidden />
                    {searchFilterLabel(filter)}
                    <ChevronDownIcon data-icon="inline-end" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuGroup>
                    <DropdownMenuRadioGroup
                      value={filter}
                      onValueChange={(value) => {
                        if (isEaselSearchFilter(value)) setFilter(value)
                      }}
                    >
                      <DropdownMenuRadioItem value="all">All types</DropdownMenuRadioItem>
                      {SEARCH_KIND_DEFINITIONS.map((definition) => (
                        <DropdownMenuRadioItem key={definition.kind} value={definition.kind}>
                          {definition.label}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <p className="text-xs text-text-weaker" aria-live="polite">
                {isSearching
                  ? "Searching…"
                  : `${visibleResults.length} ${visibleResults.length === 1 ? "result" : "results"}`}
              </p>
            </div>

            {isSearching ? (
              <SearchLoadingRows />
            ) : visibleResults.length > 0 ? (
              <section className="flex flex-col gap-1">
                {visibleResults.map((result) => (
                  <SearchResultRow key={result.id} result={result} onOpen={props.onOpenResult} />
                ))}
              </section>
            ) : (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <SearchIcon aria-hidden />
                  </EmptyMedia>
                  <EmptyTitle>No notebook matches</EmptyTitle>
                  <EmptyDescription>
                    Try another title, filename, or a different result type.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
