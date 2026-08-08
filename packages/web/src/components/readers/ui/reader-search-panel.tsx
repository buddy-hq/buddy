import {
  ChevronDownIcon,
  ChevronUpIcon,
  SearchIcon,
} from "@/icons/app-icons"
import {
  Button,
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  ScrollArea,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  cn,
} from "@buddy/ui"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@buddy/ui/components/ui/input-group"
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
import {
  READER_EMPTY_SEARCH_MESSAGE,
  READER_VIRTUALIZE_ROW_THRESHOLD,
} from "./reader-ui-constants"

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

function isReaderSearchScope(value: string): value is ReaderSearchScope {
  return value === READER_SEARCH_SCOPE_DOCUMENT || value === READER_SEARCH_SCOPE_SECTION
}

function ReaderSearchExcerptText({ excerpt }: { excerpt: ReaderSearchExcerpt }) {
  return (
    <span>
      <span>{excerpt.pre}</span>
      <strong className="font-semibold text-text-strong">{excerpt.match}</strong>
      <span>{excerpt.post}</span>
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

  const renderRow = (row: ReaderSearchRow) => {
    if (row.kind === "section") {
      return (
        <div className="pb-1 pt-2.5 text-xs font-medium uppercase tracking-wide text-text-weaker">
          {row.label}
        </div>
      )
    }
    const active = row.result.id === search.activeResultId
    return (
      <Button
        type="button"
        variant={active ? "secondary" : "ghost"}
        aria-current={active ? "true" : undefined}
        onClick={() => onShowResult(row.result.anchor)}
        className="mb-1 h-auto w-full justify-start whitespace-normal px-2 py-2 text-left"
      >
        <span className="min-w-0 flex-1">
          {row.result.label ? (
            <span className="mb-0.5 block font-mono text-xs text-text-weaker">
              {row.result.label}
            </span>
          ) : null}
          <span className="line-clamp-3 block">
            <ReaderSearchExcerptText excerpt={row.result.excerpt} />
          </span>
        </span>
      </Button>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <form
        className="border-b px-3 py-3"
        onSubmit={(event) => {
          event.preventDefault()
          onRunSearch()
        }}
      >
        <FieldGroup className="gap-2">
          <Field>
            <FieldLabel htmlFor="reader-search-input" className="sr-only">
              Search this document
            </FieldLabel>
            <div className="flex items-center gap-1.5">
              <InputGroup>
                <InputGroupAddon>
                  <SearchIcon />
                </InputGroupAddon>
                <InputGroupInput
                  ref={inputRef}
                  id="reader-search-input"
                  value={search.query}
                  onChange={(event) => onQueryChange(event.target.value)}
                  placeholder="Search this document"
                />
              </InputGroup>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                onClick={() => onCycleResults(-1)}
                disabled={results.length === 0}
                aria-label="Previous result"
              >
                <ChevronUpIcon />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                onClick={() => onCycleResults(1)}
                disabled={results.length === 0}
                aria-label="Next result"
              >
                <ChevronDownIcon />
              </Button>
            </div>
          </Field>

          <Field orientation="horizontal">
            <FieldLabel htmlFor="reader-search-scope" className="sr-only">
              Search scope
            </FieldLabel>
            <Select
              value={search.scope}
              onValueChange={(value) => {
                if (isReaderSearchScope(value)) onScopeChange(value)
              }}
            >
              <SelectTrigger id="reader-search-scope" size="sm" className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={READER_SEARCH_SCOPE_DOCUMENT}>Whole document</SelectItem>
                  <SelectItem value={READER_SEARCH_SCOPE_SECTION} disabled={!canSearchSection}>
                    Current section
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button type="submit" size="sm" disabled={!ready || search.query.trim().length === 0}>
              Search
            </Button>
          </Field>

          <FieldSet>
            <FieldLegend className="sr-only" variant="label">
              Match options
            </FieldLegend>
            <div className="flex items-center gap-3">
              {[
                {
                  id: "reader-search-match-case",
                  label: "Match case",
                  shortLabel: "Aa",
                  checked: search.matchCase,
                  onChange: onMatchCaseChange,
                },
                {
                  id: "reader-search-whole-words",
                  label: "Whole words",
                  shortLabel: "\\b",
                  checked: search.matchWholeWords,
                  onChange: onMatchWholeWordsChange,
                },
                {
                  id: "reader-search-diacritics",
                  label: "Match diacritics",
                  shortLabel: "ä",
                  checked: search.matchDiacritics,
                  onChange: onMatchDiacriticsChange,
                },
              ].map((option) => (
                <Field key={option.id} orientation="horizontal" className="w-auto gap-1">
                  <Switch
                    id={option.id}
                    size="sm"
                    checked={option.checked}
                    onCheckedChange={option.onChange}
                    aria-label={option.label}
                  />
                  <FieldLabel
                    htmlFor={option.id}
                    title={option.label}
                    className={cn(
                      "font-mono text-xs",
                      option.checked ? "text-text-base" : "text-text-weaker",
                    )}
                  >
                    {option.shortLabel}
                  </FieldLabel>
                </Field>
              ))}
              {results.length > 0 ? (
                <span className="ml-auto font-mono text-xs tabular-nums text-text-weaker">
                  {results.length} results
                </span>
              ) : null}
            </div>
          </FieldSet>
        </FieldGroup>

        {search.running && search.progress !== null ? (
          <div
            role="progressbar"
            aria-label="Search progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(search.progress * 100)}
            className="mt-2 h-0.5 bg-surface-weak"
          >
            <div
              className="h-full bg-surface-interactive-base"
              style={{ width: `${Math.round(search.progress * 100)}%` }}
            />
          </div>
        ) : null}
      </form>

      <ScrollArea className="min-h-0 flex-1 px-3 py-2" viewportRef={viewportRef}>
        {search.rows.length === 0 ? (
          <p className="px-1 py-4 text-sm text-text-weaker">{READER_EMPTY_SEARCH_MESSAGE}</p>
        ) : search.rows.length >= READER_VIRTUALIZE_ROW_THRESHOLD ? (
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
          <div>{search.rows.map((row) => <div key={row.id}>{renderRow(row)}</div>)}</div>
        )}
      </ScrollArea>
    </div>
  )
}
