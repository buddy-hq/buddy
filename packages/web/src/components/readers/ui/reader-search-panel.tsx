import { ChevronDownIcon, ChevronUpIcon, SearchIcon } from "@/icons/app-icons"
import { Button, ScrollArea, ToggleGroup, ToggleGroupItem, cn } from "@buddy/ui"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@buddy/ui/components/ui/input-group"
import { VirtualizedRows } from "@/components/virtualization/virtualized-rows"
import {
  READER_SEARCH_SCOPE_DOCUMENT,
  READER_SEARCH_SCOPE_SECTION,
  type ReaderSearchExcerpt,
  type ReaderSearchRow,
  type ReaderSearchScope,
  type ReaderSearchViewModel,
  type ReaderTextAnchor,
} from "../reader-types"
import { READER_EMPTY_SEARCH_MESSAGE, READER_VIRTUALIZE_ROW_THRESHOLD } from "./reader-ui-constants"
import { ReaderPanelLabel } from "./reader-panel"

const SEARCH_MATCH_CASE = "case"
const SEARCH_MATCH_WORD = "word"
const SEARCH_MATCH_DIACRITICS = "diacritics"

const SEARCH_MATCH_OPTIONS = [
  { id: SEARCH_MATCH_CASE, glyph: "Aa", label: "Match case" },
  { id: SEARCH_MATCH_WORD, glyph: "ab|", label: "Whole words" },
  { id: SEARCH_MATCH_DIACRITICS, glyph: "ä", label: "Match diacritics" },
] as const

type ReaderSearchPanelProps = {
  search: ReaderSearchViewModel
  onQueryChange: (query: string) => void
  onRunSearch: () => void
  onCycleResults: (direction: 1 | -1) => void
  onScopeChange: (scope: ReaderSearchScope) => void
  onMatchCaseChange: (matchCase: boolean) => void
  onMatchWholeWordsChange: (matchWholeWords: boolean) => void
  onMatchDiacriticsChange: (matchDiacritics: boolean) => void
  onShowResult: (target: ReaderTextAnchor) => void
  inputRef: React.RefObject<HTMLInputElement>
  viewportRef: React.RefObject<HTMLDivElement>
  ready: boolean
  canSearchSection?: boolean
}
function ReaderSearchExcerptText({ excerpt }: { excerpt: ReaderSearchExcerpt }) {
  return (
    <span>
      {excerpt.pre}
      <strong className="font-semibold text-text-strong">{excerpt.match}</strong>
      {excerpt.post}
    </span>
  )
}

export function ReaderSearchPanel({
  search,
  onQueryChange,
  onRunSearch,
  onCycleResults,
  onScopeChange,
  onMatchCaseChange,
  onMatchWholeWordsChange,
  onMatchDiacriticsChange,
  onShowResult,
  inputRef,
  viewportRef,
  ready,
  canSearchSection = true,
}: ReaderSearchPanelProps) {
  const results = search.rows.filter((row) => row.kind === "result")
  const matchValues = [
    ...(search.matchCase ? [SEARCH_MATCH_CASE] : []),
    ...(search.matchWholeWords ? [SEARCH_MATCH_WORD] : []),
    ...(search.matchDiacritics ? [SEARCH_MATCH_DIACRITICS] : []),
  ]

  const renderRow = (row: ReaderSearchRow) => {
    if (row.kind === "section") {
      return (
        <p className="px-1 pb-1.5 pt-3 text-[10px] font-medium uppercase tracking-wide text-text-weaker first:pt-0">
          {row.label}
        </p>
      )
    }
    const active = row.result.id === search.activeResultId
    return (
      <button
        type="button"
        aria-current={active ? "true" : undefined}
        onClick={() => onShowResult(row.result.anchor)}
        className={cn(
          "w-full rounded-md px-2.5 py-2 text-left hover:bg-surface-base-hover",
          active && "bg-surface-raised-strong text-text-strong hover:bg-surface-raised-strong",
        )}
      >
        {row.result.label ? (
          <span className="mb-1 block font-mono text-[10px] text-text-weaker">
            {row.result.label}
          </span>
        ) : null}
        <span className="line-clamp-3 block text-xs leading-relaxed text-text-weak">
          <ReaderSearchExcerptText excerpt={row.result.excerpt} />
        </span>
      </button>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <form
        className="flex shrink-0 flex-col gap-4 p-4"
        onSubmit={(event) => {
          event.preventDefault()
          onRunSearch()
        }}
      >
        <div className="flex items-center gap-1">
          <InputGroup className="min-w-0 flex-1 rounded-md bg-background-base">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              ref={inputRef}
              value={search.query}
              onChange={(event) => onQueryChange(event.currentTarget.value)}
              placeholder="Search this document"
              aria-label="Search this document"
              disabled={!ready}
              className="text-xs"
            />
          </InputGroup>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Previous result"
            onClick={() => onCycleResults(-1)}
            disabled={results.length === 0}
          >
            <ChevronUpIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Next result"
            onClick={() => onCycleResults(1)}
            disabled={results.length === 0}
          >
            <ChevronDownIcon />
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={search.scope}
            aria-label="Search scope"
            className="flex-1"
            onValueChange={(value) => {
              if (value === READER_SEARCH_SCOPE_DOCUMENT || value === READER_SEARCH_SCOPE_SECTION) {
                onScopeChange(value)
              }
            }}
          >
            <ToggleGroupItem value={READER_SEARCH_SCOPE_DOCUMENT} className="min-w-0 flex-1">
              <span className="truncate">Document</span>
            </ToggleGroupItem>
            <ToggleGroupItem
              value={READER_SEARCH_SCOPE_SECTION}
              className="min-w-0 flex-1"
              disabled={!canSearchSection}
            >
              <span className="truncate">Section</span>
            </ToggleGroupItem>
          </ToggleGroup>

          <ToggleGroup
            type="multiple"
            variant="outline"
            size="sm"
            value={matchValues}
            aria-label="Match options"
            onValueChange={(values) => {
              onMatchCaseChange(values.includes(SEARCH_MATCH_CASE))
              onMatchWholeWordsChange(values.includes(SEARCH_MATCH_WORD))
              onMatchDiacriticsChange(values.includes(SEARCH_MATCH_DIACRITICS))
            }}
          >
            {SEARCH_MATCH_OPTIONS.map((option) => (
              <ToggleGroupItem
                key={option.id}
                value={option.id}
                aria-label={option.label}
                title={option.label}
                className="font-mono text-[11px]"
              >
                {option.glyph}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {search.running && search.progress !== null ? (
          <div className="flex items-center gap-2">
            <div
              role="progressbar"
              aria-label="Search progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(search.progress * 100)}
              className="h-0.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-weak"
            >
              <div
                className="h-full bg-surface-interactive-base"
                style={{ width: `${Math.round(search.progress * 100)}%` }}
              />
            </div>
            <span className="shrink-0 font-mono text-[10px] text-text-weaker">searching…</span>
          </div>
        ) : null}
      </form>

      {search.rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-xs leading-relaxed text-text-weaker">
          {READER_EMPTY_SEARCH_MESSAGE}
        </p>
      ) : (
        <div className="mx-4 flex min-h-0 flex-1 flex-col border-t border-border-weaker-base pt-3">
          <div className="flex items-baseline justify-between pb-1.5">
            <ReaderPanelLabel>{search.running ? "Found so far" : "Results"}</ReaderPanelLabel>
            <span className="font-mono text-[10px] tabular-nums text-text-weaker">
              {results.length}
            </span>
          </div>
          <ScrollArea className="min-h-0 flex-1" viewportRef={viewportRef}>
            {search.rows.length >= READER_VIRTUALIZE_ROW_THRESHOLD ? (
              <VirtualizedRows
                items={search.rows}
                getItemKey={(item) => item.id}
                estimateSize={(item) => (item.kind === "section" ? 28 : 64)}
                getScrollElement={() => viewportRef.current}
                overscan={8}
                measure
                renderItem={renderRow}
              />
            ) : (
              <div className="flex flex-col gap-1 pb-4">
                {search.rows.map((row) => (
                  <div key={row.id}>{renderRow(row)}</div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      )}
    </div>
  )
}
