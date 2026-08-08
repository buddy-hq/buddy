import { useEffect, useRef } from "react"
import { SearchIcon } from "@/icons/app-icons"
import { Button, Popover, PopoverContent, PopoverTrigger } from "@buddy/ui"
import type {
  ReaderSearchScope,
  ReaderSearchViewModel,
  ReaderTextAnchor,
} from "../reader-types"
import { ReaderSearchPanel } from "./reader-search-panel"

type ReaderSearchPopoverProps = {
  search: ReaderSearchViewModel
  onQueryChange: (query: string) => void
  onRunSearch: () => void
  onCycleResults: (direction: 1 | -1) => void
  onScopeChange: (scope: ReaderSearchScope) => void
  onMatchCaseChange: (matchCase: boolean) => void
  onMatchWholeWordsChange: (matchWholeWords: boolean) => void
  onMatchDiacriticsChange: (matchDiacritics: boolean) => void
  onShowResult: (target: ReaderTextAnchor) => void
  ready: boolean
  canSearchSection?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function ReaderSearchPopover({
  search,
  onQueryChange,
  onRunSearch,
  onCycleResults,
  onScopeChange,
  onMatchCaseChange,
  onMatchWholeWordsChange,
  onMatchDiacriticsChange,
  onShowResult,
  ready,
  canSearchSection,
  open,
  onOpenChange,
}: ReaderSearchPopoverProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Search in document">
          <SearchIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="h-[min(32rem,70vh)] w-[22.5rem] p-0">
        <ReaderSearchPanel
          search={search}
          onQueryChange={onQueryChange}
          onRunSearch={onRunSearch}
          onCycleResults={onCycleResults}
          onScopeChange={onScopeChange}
          onMatchCaseChange={onMatchCaseChange}
          onMatchWholeWordsChange={onMatchWholeWordsChange}
          onMatchDiacriticsChange={onMatchDiacriticsChange}
          onShowResult={onShowResult}
          inputRef={inputRef}
          viewportRef={viewportRef}
          ready={ready}
          canSearchSection={canSearchSection}
        />
      </PopoverContent>
    </Popover>
  )
}
