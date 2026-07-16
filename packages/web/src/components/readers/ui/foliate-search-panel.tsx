import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  ScrollArea,
  cn,
  // Icons from @buddy/ui
  ChevronDownIcon,
} from "@buddy/ui"
import { SearchIcon, ChevronUpIcon } from "@/icons/app-icons"
import {
  SEARCH_EMPTY_MESSAGE,
  SEARCH_SCOPE_BOOK,
  SEARCH_SCOPE_SECTION,
  VIRTUALIZE_ROW_THRESHOLD,
} from "../foliate-reader-constants"
import { renderSearchExcerpt } from "../utils/foliate-formatters"
import type { ReaderSearchState } from "../foliate-reader-types"
import { VirtualizedRows } from "@/components/virtualization/virtualized-rows"

export interface FoliateSearchPanelProps {
  searchState: ReaderSearchState
  onQueryChange: (query: string) => void
  onRunSearch: () => void
  onCycleResults: (direction: 1 | -1) => void
  onScopeChange: (scope: string) => void
  onMatchCaseChange: (matchCase: boolean) => void
  onMatchWholeWordsChange: (matchWholeWords: boolean) => void
  onMatchDiacriticsChange: (matchDiacritics: boolean) => void
  onShowResult: (cfi: string) => void
  searchInputRef: React.RefObject<HTMLInputElement>
  searchViewportRef: React.RefObject<HTMLDivElement>
  status: "idle" | "loading" | "ready" | "error"
  isReaderSearchScope: (value: string) => value is any
}

export function FoliateSearchPanel({
  searchState,
  onQueryChange,
  onRunSearch,
  onCycleResults,
  onScopeChange,
  onMatchCaseChange,
  onMatchWholeWordsChange,
  onMatchDiacriticsChange,
  onShowResult,
  searchInputRef,
  searchViewportRef,
  status,
  isReaderSearchScope,
}: FoliateSearchPanelProps) {
  const searchResults = searchState.rows.filter((row) => row.kind === "result")
  const resultCount = searchResults.length

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Search controls */}
      <div className="space-y-2 border-b border-border-base/40 px-3 py-3">
        {/* Input + nav buttons */}
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-text-weaker" />
            <Input
              ref={searchInputRef}
              value={searchState.query}
              onChange={(e) => onQueryChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  onRunSearch()
                }
              }}
              className="h-8 pl-8 text-[12px]"
              placeholder="Search this book…"
            />
          </div>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => onCycleResults(-1)}
            disabled={resultCount === 0}
            aria-label="Previous result"
            className="text-text-weaker"
          >
            <ChevronUpIcon className="size-3.5" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => onCycleResults(1)}
            disabled={resultCount === 0}
            aria-label="Next result"
            className="text-text-weaker"
          >
            <ChevronDownIcon className="size-3.5" />
          </Button>
        </div>

        {/* Scope + run */}
        <div className="flex items-center gap-1.5">
          <Select
            value={searchState.scope}
            onValueChange={(value) => {
              if (isReaderSearchScope(value)) {
                onScopeChange(value)
              }
            }}
          >
            <SelectTrigger className="h-7 flex-1 text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEARCH_SCOPE_BOOK}>Whole book</SelectItem>
              <SelectItem value={SEARCH_SCOPE_SECTION}>Current section</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="h-7 text-[11px]"
            onClick={onRunSearch}
            disabled={status !== "ready"}
          >
            Search
          </Button>
        </div>

        {/* Match options — compact row */}
        <div className="flex items-center gap-3">
          {[
            {
              label: "Aa",
              checked: searchState.matchCase,
              onChange: onMatchCaseChange,
              title: "Match case",
            },
            {
              label: "\\b",
              checked: searchState.matchWholeWords,
              onChange: onMatchWholeWordsChange,
              title: "Whole words",
            },
            {
              label: "ä",
              checked: searchState.matchDiacritics,
              onChange: onMatchDiacriticsChange,
              title: "Match diacritics",
            },
          ].map(({ label, checked, onChange, title }) => (
            <label key={title} title={title} className="flex cursor-pointer items-center gap-1.5">
              <Switch checked={checked} onCheckedChange={onChange} className="scale-75" />
              <span
                className={cn(
                  "font-mono text-[10px]",
                  checked ? "text-text-base" : "text-text-weaker",
                )}
              >
                {label}
              </span>
            </label>
          ))}
          {resultCount > 0 ? (
            <span className="ml-auto font-mono text-[10px] tabular-nums text-text-weaker">
              {resultCount} results
            </span>
          ) : null}
        </div>

        {/* Progress bar */}
        {searchState.running && searchState.progress !== null ? (
          <div className="h-0.5 bg-border-base/40">
            <div
              className="h-full bg-text-interactive-base/60 transition-[width]"
              style={{ width: `${Math.round(searchState.progress * 100)}%` }}
            />
          </div>
        ) : null}
      </div>

      {/* Results list */}
      <ScrollArea className="h-full px-3 py-2" viewportRef={searchViewportRef}>
        {searchState.rows.length === 0 ? (
          <p className="px-1 py-4 text-[12px] text-text-weaker">{SEARCH_EMPTY_MESSAGE}</p>
        ) : searchState.rows.length >= VIRTUALIZE_ROW_THRESHOLD ? (
          <VirtualizedRows
            items={searchState.rows}
            getItemKey={(item) => item.key}
            estimateSize={(item) => (item.kind === "section" ? 28 : 64)}
            getScrollElement={() => searchViewportRef.current}
            overscan={8}
            measure
            renderItem={(row) =>
              row.kind === "section" ? (
                <div className="pb-1 pt-2.5 text-[10px] font-medium uppercase tracking-[0.12em] text-text-weaker">
                  {row.label}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onShowResult(row.cfi)}
                  className={cn(
                    "mb-1 w-full px-2 py-2 text-left text-[12px] leading-snug transition-colors",
                    searchState.activeResultCfi === row.cfi
                      ? "bg-surface-interactive-weak text-text-strong"
                      : "text-text-weak hover:bg-surface-weak/60 hover:text-text-base",
                  )}
                >
                  <div className="line-clamp-3">{renderSearchExcerpt(row.excerpt)}</div>
                </button>
              )
            }
          />
        ) : (
          <div>
            {searchState.rows.map((row) =>
              row.kind === "section" ? (
                <div
                  key={row.key}
                  className="pb-1 pt-2.5 text-[10px] font-medium uppercase tracking-[0.12em] text-text-weaker"
                >
                  {row.label}
                </div>
              ) : (
                <button
                  key={row.key}
                  type="button"
                  onClick={() => onShowResult(row.cfi)}
                  className={cn(
                    "mb-1 w-full px-2 py-2 text-left text-[12px] leading-snug transition-colors",
                    searchState.activeResultCfi === row.cfi
                      ? "bg-surface-interactive-weak text-text-strong"
                      : "text-text-weak hover:bg-surface-weak/60 hover:text-text-base",
                  )}
                >
                  <div className="line-clamp-3">{renderSearchExcerpt(row.excerpt)}</div>
                </button>
              ),
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
