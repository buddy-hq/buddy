import { useEffect, useRef } from "react"
import { SearchIcon } from "@/icons/app-icons"
import { Popover, PopoverContent, PopoverTrigger } from "@buddy/ui"
import type { ReaderSearchScope, ReaderSearchViewModel, ReaderTextAnchor } from "../reader-types"
import { ReaderSearchPanel } from "./reader-search-panel"
import { ReaderPanelHeader } from "./reader-panel"
import { ReaderToolbarButton } from "./reader-toolbar-button"

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
        <ReaderToolbarButton icon={SearchIcon} label="Search  ⌘F" active={Boolean(open)} />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="flex h-[min(32rem,70vh)] w-[340px] flex-col overflow-hidden rounded-lg border border-border-base bg-surface-raised-stronger-non-alpha p-0 shadow-xl"
      >
        <ReaderPanelHeader title="Search" onClose={() => onOpenChange?.(false)} />
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
