import * as React from "react"
import { SearchIcon } from "@/icons/app-icons"
import { Button, Popover, PopoverContent, PopoverTrigger } from "@buddy/ui"
import { FoliateSearchPanel } from "./foliate-search-panel"
import type { FoliateReaderSearchScope, ReaderSearchState } from "../foliate-reader-types"

export interface FoliateSearchPopoverProps {
  searchState: ReaderSearchState
  onQueryChange: (query: string) => void
  onRunSearch: () => void
  onCycleResults: (direction: 1 | -1) => void
  onScopeChange: (scope: string) => void
  onMatchCaseChange: (matchCase: boolean) => void
  onMatchWholeWordsChange: (matchWholeWords: boolean) => void
  onMatchDiacriticsChange: (matchDiacritics: boolean) => void
  onShowResult: (cfi: string) => void
  status: "idle" | "loading" | "ready" | "error"
  isReaderSearchScope: (value: string) => value is FoliateReaderSearchScope
}

export function FoliateSearchPopover({
  searchState,
  onQueryChange,
  onRunSearch,
  onCycleResults,
  onScopeChange,
  onMatchCaseChange,
  onMatchWholeWordsChange,
  onMatchDiacriticsChange,
  onShowResult,
  status,
  isReaderSearchScope,
}: FoliateSearchPopoverProps) {
  const searchInputRef = React.useRef<HTMLInputElement>(null)
  const searchViewportRef = React.useRef<HTMLDivElement>(null)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Search in book"
          className="shrink-0 text-text-weaker hover:text-text-base"
        >
          <SearchIcon className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[360px] max-h-[70vh] overflow-hidden p-0"
      >
        <FoliateSearchPanel
          searchState={searchState}
          onQueryChange={onQueryChange}
          onRunSearch={onRunSearch}
          onCycleResults={onCycleResults}
          onScopeChange={onScopeChange}
          onMatchCaseChange={onMatchCaseChange}
          onMatchWholeWordsChange={onMatchWholeWordsChange}
          onMatchDiacriticsChange={onMatchDiacriticsChange}
          onShowResult={onShowResult}
          searchInputRef={searchInputRef}
          searchViewportRef={searchViewportRef}
          status={status}
          isReaderSearchScope={isReaderSearchScope}
        />
      </PopoverContent>
    </Popover>
  )
}
