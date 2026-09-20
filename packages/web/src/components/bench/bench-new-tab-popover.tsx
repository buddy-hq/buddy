import { useMemo, useRef, useState, type ReactNode } from "react"
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
import {
  IN_APP_BROWSER_BLANK_URL,
  IN_APP_BROWSER_URL_MAX_LENGTH,
  inAppBrowserDisplayUrl,
} from "@buddy/browser-contract"
import type { InAppBrowserProfileID } from "@buddy/browser-contract/profiles"
import { Globe, PlusIcon, SearchIcon } from "@/icons/app-icons"
import { usePlatform } from "@/context/platform"
import { BrowserFaviconImage } from "@/components/bench/surfaces/browser/browser-favicon-image"
import { BENCH_MODE_REQUEST_POLICY } from "@/lib/bench-navigation"
import { createInAppBrowserBenchTarget } from "@/lib/bench-targets"
import {
  benchNewTabNotebookQuery,
  resolveBenchNewTabBrowserInputAction,
  searchBenchNewTabBrowserHistory,
  type BenchNewTabBrowserInputAction,
} from "@/lib/bench-new-tab-browser"
import { inAppBrowserFaviconImageSources } from "@/lib/in-app-browser-favicon"
import { newTabInAppBrowserProfiles } from "@/lib/in-app-browser-settings"
import type { InAppBrowserHistoryEntry } from "@/lib/in-app-browser-history"
import { useInAppBrowserHistoryStore } from "@/state/in-app-browser-history-store"
import {
  useInAppBrowserSettingsHydrated,
  useInAppBrowserSettingsStore,
} from "@/state/in-app-browser-settings-store"
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
  onOpeningChange: (opening: boolean) => void
}

const NEW_TAB_LABEL = "Open in a new tab"
const NEW_TAB_RECENT_LIMIT = 8
const NEW_TAB_SKELETON_ROWS = 4
const NO_BROWSER_HISTORY: readonly InAppBrowserHistoryEntry[] = []

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

function BrowserResultRow(props: {
  readonly title: string
  readonly description: string
  readonly url: string
  readonly profileName: string
  readonly search?: boolean
}) {
  return (
    <>
      {props.search ? (
        <SearchIcon className="size-3.5 shrink-0 text-icon-base" aria-hidden />
      ) : (
        <BrowserFaviconImage
          sources={inAppBrowserFaviconImageSources({ capturedDataUrl: null, pageUrl: props.url })}
          fallback={<Globe className="size-3.5 shrink-0 text-icon-base" />}
          className="size-3.5 shrink-0 rounded-sm object-contain"
        />
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-text-strong">{props.title}</span>
        <span className="truncate text-xs text-text-weaker">{props.description}</span>
      </span>
      <CommandShortcut className="shrink-0 text-[11px] tracking-normal text-text-weaker">
        {props.profileName}
      </CommandShortcut>
    </>
  )
}

function notebookResultsContent(input: {
  readonly search: ReturnType<typeof useNotebookSearch>
  readonly results: readonly NotebookSearchResult[]
  readonly directory: string
  readonly queryTooLong: boolean
  readonly opening: boolean
  readonly openResult: (result: NotebookSearchResult) => void
}): ReactNode {
  if (input.queryTooLong) {
    return <BenchNewTabMessage>Query is too long to search this notebook.</BenchNewTabMessage>
  }
  if (!input.search.hasQuery && input.search.catalogPending) {
    return (
      <div className="flex flex-col gap-1 p-1">
        {Array.from({ length: NEW_TAB_SKELETON_ROWS }, (_, index) => (
          <Skeleton key={index} className="h-8 w-full" />
        ))}
      </div>
    )
  }
  if (input.search.hasQuery && !input.search.canSearch) {
    return <BenchNewTabMessage>Keep typing to search this notebook.</BenchNewTabMessage>
  }
  if (input.search.searching) {
    return <BenchNewTabMessage>Searching…</BenchNewTabMessage>
  }
  if (input.results.length === 0) {
    return (
      <BenchNewTabMessage>
        {input.search.hasQuery ? "No matches in this notebook." : "Nothing to open yet."}
      </BenchNewTabMessage>
    )
  }

  return (
    <>
      {input.results.map((result) => {
        const model = describeNotebookSearchResult({ result, directory: input.directory })
        const Glyph = model.glyph

        return (
          <CommandItem
            key={result.id}
            value={result.id}
            data-action="bench-new-tab-open"
            disabled={input.opening}
            onSelect={() => input.openResult(result)}
          >
            <Glyph className="size-3.5 shrink-0 text-icon-base" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{model.title}</span>
            <CommandShortcut className="shrink-0 text-[11px] tracking-normal text-text-weaker">
              {model.kindLabel}
            </CommandShortcut>
          </CommandItem>
        )
      })}
      {input.search.incomplete ? (
        <p className="px-2 py-1.5 text-[11px] text-text-weaker">
          {input.search.failedProviders.length > 0
            ? "Some result types could not be searched."
            : "Showing the best matches from a bounded file scan."}
        </p>
      ) : null}
    </>
  )
}

/**
 * The picker itself, mounted only while the popover is open — the notebook
 * catalog is fetched when someone asks for it, never behind a closed popover.
 *
 * General chats are absent by construction: `useNotebookSearch` without `sessions`
 * drops them from both halves of the search. Subagent transcript tabs enter through
 * owner-aware subagent links, not this content picker.
 */
function BenchNewTabSearch(props: BenchNewTabSearchProps) {
  const platform = usePlatform()
  const [query, setQuery] = useState("")
  const [opening, setOpening] = useState(false)
  const openingRef = useRef(false)
  const normalizedQuery = query.trim()
  const notebookQuery = benchNewTabNotebookQuery({ directory: props.directory, query })
  const notebookQueryTooLong = notebookQuery.length > NOTEBOOK_SEARCH_MAX_QUERY_LENGTH
  const search = useNotebookSearch({
    directory: props.directory,
    query: notebookQuery,
    filter: NOTEBOOK_SEARCH_FILTER_ALL,
    recentLimit: NEW_TAB_RECENT_LIMIT,
    enabled: !notebookQueryTooLong,
  })
  // The strip exists in both layouts, so a new tab keeps the one it opened from
  // rather than dropping an immersive Bench back into the docked chat.
  const openTarget = useRightWorkspaceOpen({ mode: BENCH_MODE_REQUEST_POLICY })
  const showingRecents = !search.hasQuery
  const results = showingRecents ? search.recents : search.results
  const userProfiles = useInAppBrowserSettingsStore((state) => state.userProfiles)
  const defaultProfileID = useInAppBrowserSettingsStore((state) => state.defaultProfileID)
  const defaultSearchEngine = useInAppBrowserSettingsStore((state) => state.defaultSearchEngine)
  const settingsHydrated = useInAppBrowserSettingsHydrated()
  const browserAvailable = platform.inAppBrowser !== undefined
  const browserProfiles = useMemo(
    () =>
      browserAvailable && settingsHydrated && normalizedQuery.length === 0
        ? newTabInAppBrowserProfiles(userProfiles, defaultProfileID)
        : [],
    [browserAvailable, defaultProfileID, normalizedQuery.length, settingsHydrated, userProfiles],
  )
  const defaultProfileName =
    newTabInAppBrowserProfiles(userProfiles, defaultProfileID).find(
      (profile) => profile.id === defaultProfileID,
    )?.name ?? "Default"
  const history = useInAppBrowserHistoryStore(
    (state) => state.byDirectory[props.directory] ?? NO_BROWSER_HISTORY,
  )
  const browserInputAction = useMemo(
    () =>
      browserAvailable && settingsHydrated && normalizedQuery
        ? resolveBenchNewTabBrowserInputAction(query, defaultSearchEngine)
        : undefined,
    [browserAvailable, defaultSearchEngine, normalizedQuery, query, settingsHydrated],
  )
  const browserHistory = useMemo(
    () =>
      browserAvailable && settingsHydrated
        ? searchBenchNewTabBrowserHistory(history, query).filter(
            (entry) => entry.url !== browserInputAction?.url,
          )
        : NO_BROWSER_HISTORY,
    [browserAvailable, browserInputAction?.url, history, query, settingsHydrated],
  )

  // The picker outlives the request: dismissing it up front would throw away
  // the query along with the popover on an open that never landed a tab.
  async function openRequest(request: Parameters<typeof openTarget>[0] | null): Promise<void> {
    if (!request || openingRef.current) return
    openingRef.current = true
    setOpening(true)
    props.onOpeningChange(true)
    const outcome = await openTarget(request)
    if (rightWorkspaceOpenSettled(outcome)) {
      props.onOpened()
      return
    }
    openingRef.current = false
    setOpening(false)
    props.onOpeningChange(false)
  }

  function openResult(result: NotebookSearchResult): void {
    void openRequest(notebookSearchOpenRequest({ result, directory: props.directory }))
  }

  function openBrowser(url: string, profileID: InAppBrowserProfileID): void {
    void openRequest({
      type: "object",
      directory: props.directory,
      target: createInAppBrowserBenchTarget(url, profileID),
    })
  }

  const primaryBrowserItems: ReactNode[] = []
  for (const profile of browserProfiles) {
    primaryBrowserItems.push(
      <CommandItem
        key={profile.id}
        value={`new-browser-tab:${profile.id}`}
        data-action="bench-new-browser-tab"
        disabled={opening}
        onSelect={() => openBrowser(IN_APP_BROWSER_BLANK_URL, profile.id)}
      >
        <Globe className="size-3.5 shrink-0 text-icon-base" aria-hidden />
        <span className="min-w-0 flex-1 truncate">Browser</span>
        <CommandShortcut className="text-[11px] tracking-normal text-text-weaker">
          {profile.name}
        </CommandShortcut>
      </CommandItem>,
    )
  }

  function inputActionItem(action: BenchNewTabBrowserInputAction): ReactNode {
    return (
      <CommandItem
        key="browser-input"
        value="browser-input"
        data-action="bench-new-browser-input"
        disabled={opening}
        onSelect={() => openBrowser(action.url, defaultProfileID)}
      >
        <BrowserResultRow
          title={action.title}
          description={action.description}
          url={action.url}
          profileName={defaultProfileName}
          search={action.kind === "search"}
        />
      </CommandItem>
    )
  }

  const historyItems = browserHistory.map((entry) => (
    <CommandItem
      key={entry.url}
      value={`browser-history:${entry.url}`}
      data-action="bench-new-browser-history"
      disabled={opening}
      onSelect={() => openBrowser(entry.url, defaultProfileID)}
    >
      <BrowserResultRow
        title={entry.title || inAppBrowserDisplayUrl(entry.url)}
        description={inAppBrowserDisplayUrl(entry.url)}
        url={entry.url}
        profileName={defaultProfileName}
      />
    </CommandItem>
  ))

  if (browserInputAction?.placement === "primary") {
    primaryBrowserItems.push(inputActionItem(browserInputAction))
  }
  primaryBrowserItems.push(...historyItems)
  const fallbackBrowserItem =
    browserInputAction?.placement === "fallback" && !search.searching
      ? inputActionItem(browserInputAction)
      : null

  const notebookContent = notebookResultsContent({
    search,
    results,
    directory: props.directory,
    queryTooLong: notebookQueryTooLong,
    opening,
    openResult,
  })

  return (
    <Command
      label={NEW_TAB_LABEL}
      // The notebook search owns ranking and matching; cmdk is only the keyboard.
      shouldFilter={false}
      loop
      aria-busy={search.searching || opening}
      className="h-auto w-full rounded-none bg-transparent p-0 shadow-none"
    >
      <CommandInput
        value={query}
        maxLength={IN_APP_BROWSER_URL_MAX_LENGTH}
        placeholder="Open a file or URL…"
        disabled={opening}
        onValueChange={setQuery}
      />
      <CommandList className="max-h-80 px-1 pb-1">
        {primaryBrowserItems.length > 0 ? (
          <>
            <BenchNewTabSectionLabel>Browser</BenchNewTabSectionLabel>
            {primaryBrowserItems}
          </>
        ) : null}
        {notebookContent ? (
          <>
            <BenchNewTabSectionLabel>
              {showingRecents ? "Recent in this notebook" : "Notebook"}
            </BenchNewTabSectionLabel>
            {notebookContent}
          </>
        ) : null}
        {fallbackBrowserItem ? (
          <>
            <BenchNewTabSectionLabel>Web</BenchNewTabSectionLabel>
            {fallbackBrowserItem}
          </>
        ) : null}
      </CommandList>
    </Command>
  )
}

/**
 * The tab strip's new-tab affordance: search the notebook, and whatever gets
 * picked opens as a tab beside the ones already open.
 */
export function BenchNewTabPopover(props: BenchNewTabPopoverProps) {
  const [open, setOpen] = useState(false)
  const [opening, setOpening] = useState(false)
  /** Set when a pick closed the popover, so focus is not thrown back at the trigger. */
  const openedTabRef = useRef(false)

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && opening) return
        setOpen(nextOpen)
      }}
    >
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
        onEscapeKeyDown={(event) => {
          if (opening) event.preventDefault()
        }}
        onPointerDownOutside={(event) => {
          if (opening) event.preventDefault()
        }}
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
          onOpeningChange={setOpening}
          onOpened={() => {
            openedTabRef.current = true
            setOpening(false)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
