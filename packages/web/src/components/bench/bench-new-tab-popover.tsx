import { useRef, useState } from "react"
import {
  Button,
  Command,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Skeleton,
  cn,
} from "@buddy/ui"
import { PlusIcon } from "@/icons/app-icons"
import { BENCH_MODE_REQUEST_POLICY } from "@/lib/bench-navigation"
import {
  NOTEBOOK_SEARCH_FILTER_ALL,
  NOTEBOOK_SEARCH_MAX_QUERY_LENGTH,
  type NotebookSearchResult,
} from "@/state/notebook-search"
import { useNotebookSearch } from "@/state/use-notebook-search"
import { describeNotebookSearchResult } from "@/components/objects/describe-search-result"
import {
  notebookSearchOpenRequest,
  rightWorkspaceOpenSettled,
  useRightWorkspaceOpen,
} from "@/components/directory-chat/right-workspace-open"

type BenchNewTabPopoverProps = {
  directory: string
}

type BenchNewTabSearchProps = {
  directory: string
  onOpened: () => void
}

const NEW_TAB_LABEL = "Open in a new tab"
const NEW_TAB_RECENT_LIMIT = 8
const NEW_TAB_SKELETON_ROWS = 4

function BenchNewTabMessage(props: { children: string }) {
  return <p className="px-2 py-6 text-center text-xs text-text-weaker">{props.children}</p>
}

function BenchNewTabSectionLabel(props: { children: string }) {
  return (
    <p className="px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wider text-text-weaker">
      {props.children}
    </p>
  )
}

/**
 * The picker itself, mounted only while the popover is open — the notebook
 * catalog is fetched when someone asks for it, never behind a closed popover.
 *
 * Chats are absent by construction: `useNotebookSearch` without `sessions` drops
 * them from both halves of the search, because a chat is not a Bench target and
 * so cannot become a tab.
 */
function BenchNewTabSearch(props: BenchNewTabSearchProps) {
  const [query, setQuery] = useState("")
  const search = useNotebookSearch({
    directory: props.directory,
    query,
    filter: NOTEBOOK_SEARCH_FILTER_ALL,
    recentLimit: NEW_TAB_RECENT_LIMIT,
  })
  // The strip exists in both layouts, so a new tab keeps the one it opened from
  // rather than dropping an immersive Bench back into the docked chat.
  const openTarget = useRightWorkspaceOpen({ mode: BENCH_MODE_REQUEST_POLICY })
  const showingRecents = !search.hasQuery
  const results = showingRecents ? search.recents : search.results

  // The picker outlives the request: dismissing it up front would throw away
  // the query along with the popover on an open that never landed a tab.
  async function openResult(result: NotebookSearchResult) {
    const request = notebookSearchOpenRequest({ result, directory: props.directory })
    if (!request) return
    const outcome = await openTarget(request)
    if (rightWorkspaceOpenSettled(outcome)) props.onOpened()
  }

  function renderBody() {
    if (showingRecents && search.catalogPending) {
      return (
        <div className="flex flex-col gap-1 p-1">
          {Array.from({ length: NEW_TAB_SKELETON_ROWS }, (_, index) => (
            <Skeleton key={index} className="h-8 w-full" />
          ))}
        </div>
      )
    }
    if (!showingRecents && !search.canSearch) {
      return <BenchNewTabMessage>Keep typing to search this notebook.</BenchNewTabMessage>
    }
    if (search.searching) {
      return <BenchNewTabMessage>Searching…</BenchNewTabMessage>
    }
    if (results.length === 0) {
      return (
        <BenchNewTabMessage>
          {showingRecents ? "Nothing to open yet." : "No matches in this notebook."}
        </BenchNewTabMessage>
      )
    }

    return (
      <>
        <BenchNewTabSectionLabel>
          {showingRecents ? "Recent in this notebook" : "Results"}
        </BenchNewTabSectionLabel>
        {results.map((result) => {
          const model = describeNotebookSearchResult({ result, directory: props.directory })
          const Glyph = model.glyph

          return (
            <CommandItem
              key={result.id}
              value={result.id}
              data-action="bench-new-tab-open"
              onSelect={() => void openResult(result)}
            >
              <Glyph className="size-3.5 shrink-0 text-icon-base" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{model.title}</span>
              <CommandShortcut className="shrink-0 text-[11px] tracking-normal text-text-weaker">
                {model.kindLabel}
              </CommandShortcut>
            </CommandItem>
          )
        })}
        {search.incomplete ? (
          <p className="px-2 py-1.5 text-[11px] text-text-weaker">
            {search.failedProviders.length > 0
              ? "Some result types could not be searched."
              : "Showing the best matches from a bounded file scan."}
          </p>
        ) : null}
      </>
    )
  }

  return (
    <Command
      label={NEW_TAB_LABEL}
      // The notebook search owns ranking and matching; cmdk is only the keyboard.
      shouldFilter={false}
      loop
      className="h-auto w-full rounded-none bg-transparent p-0 shadow-none"
    >
      <CommandInput
        value={query}
        maxLength={NOTEBOOK_SEARCH_MAX_QUERY_LENGTH}
        placeholder="Search this notebook…"
        onValueChange={setQuery}
      />
      <CommandList className="max-h-80 px-1 pb-1">{renderBody()}</CommandList>
    </Command>
  )
}

/**
 * The tab strip's new-tab affordance: search the notebook, and whatever gets
 * picked opens as a tab beside the ones already open.
 */
export function BenchNewTabPopover(props: BenchNewTabPopoverProps) {
  const [open, setOpen] = useState(false)
  /** Set when a pick closed the popover, so focus is not thrown back at the trigger. */
  const openedTabRef = useRef(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={NEW_TAB_LABEL}
          title={NEW_TAB_LABEL}
          data-component="bench-new-tab-trigger"
          className={cn(
            "size-6 rounded-md text-icon-base hover:bg-surface-base-hover hover:text-text-strong [-webkit-app-region:no-drag]",
            open && "bg-surface-base-hover text-text-strong",
          )}
        >
          <PlusIcon className="size-3.5" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={6}
        data-component="bench-new-tab-popover"
        className="w-80 gap-0 p-0"
        onCloseAutoFocus={(event) => {
          // A pick hands the room to the tab it just opened. Radix would send
          // focus back to the trigger, which — after a keyboard pick — lands
          // there wearing a focus ring. Escape still returns focus normally.
          if (!openedTabRef.current) return
          openedTabRef.current = false
          event.preventDefault()
        }}
      >
        {/* Mounted with the popover, so closing it also drops the search. */}
        <BenchNewTabSearch
          directory={props.directory}
          onOpened={() => {
            openedTabRef.current = true
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
