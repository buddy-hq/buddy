import { Fragment, useEffect, useId, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  SlidersHorizontalIcon,
  cn,
  toast,
} from "@buddy/ui"
import {
  Books02Icon,
  FolderIcon,
  Globe,
  NoteAddIcon,
  NotesIcon,
  PresentationIcon,
  SearchIcon,
} from "@/icons/app-icons"
import { useUiPreferences } from "@/state/ui-preferences"
import type { BenchEmptyTabDraft } from "@/state/bench-empty-tab-drafts"
import type { SessionInfo } from "@/state/chat-types"
import type { DrawerKind } from "@/state/directory-workspace-store"
import {
  NOTEBOOK_SEARCH_FILTER_ALL,
  NOTEBOOK_SEARCH_MAX_QUERY_LENGTH,
  NOTEBOOK_SEARCH_MIN_QUERY_LENGTH,
  type NotebookSearchResult,
  type NotebookSearchFilter,
  NOTEBOOK_SEARCH_COMMANDS,
  type NotebookSearchCommand,
  type NotebookSearchCommandID,
  scoreNotebookSearchText,
} from "@/state/notebook-search"
import { useNotebookSearch } from "@/state/use-notebook-search"
import { confirmNotebookFileAvailable } from "@/state/notebook-files-changed"
import { workspaceFileMissingMessage } from "@/lib/workspace-file-media"
import { useInAppBrowserHistoryStore } from "@/state/in-app-browser-history-store"
import {
  useInAppBrowserSettingsStore,
  waitForInAppBrowserSettingsHydration,
  useInAppBrowserSettingsHydrated,
} from "@/state/in-app-browser-settings-store"
import { usePlatform } from "@/context/platform"
import { IN_APP_BROWSER_BLANK_URL, IN_APP_BROWSER_URL_MAX_LENGTH } from "@buddy/browser-contract"
import {
  INCOGNITO_IN_APP_BROWSER_PROFILE_ID,
  type InAppBrowserProfileID,
} from "@buddy/browser-contract/profiles"
import { newTabInAppBrowserProfiles } from "@/lib/in-app-browser-settings"
import { createInAppBrowserBenchTarget, type BenchTabTarget } from "@/lib/bench-targets"
import { existingBrowserTabTarget } from "@/lib/bench-tabs"
import { workspacePresentationSlotForChat } from "@/state/directory-workspace-store"
import { useInAppBrowserTabsStore } from "@/state/in-app-browser-tabs-store"
import { useDirectoryWorkspaceOptional } from "@/components/directory-chat/directory-workspace-context"
import type { InAppBrowserHistoryEntry } from "@/lib/in-app-browser-history"
import {
  benchNewTabNotebookQuery,
  resolveBenchNewTabBrowserInputAction,
  searchBenchNewTabBrowserHistory,
} from "@/lib/bench-new-tab-browser"
import { fileExtensionFromPath } from "@/lib/workspace-file-paths"
import {
  findProcessedResourceByPath,
  processedResourcesQueryOptions,
} from "@/state/resources-query"
import { notebookSearchResultFromResource } from "@/state/notebook-search-results"
import { describeNotebookSearchResult } from "@/components/objects/describe-search-result"
import { BENCH_BROWSER_ART, benchCommandArt } from "./bench-action-art"
import { BenchItemIcon, searchResultIconSubject } from "./bench-item-icon"
import {
  notebookSearchOpenRequest,
  type RightWorkspaceOpener,
} from "@/components/directory-chat/right-workspace-open"

/** The drawers a search command or New tab tile can open. */
export type BenchSearchDrawer = Extract<
  DrawerKind,
  "files" | "notes" | "sources" | "boards" | "practice" | "creations"
>

/**
 * What choosing a row does. The New tab page replaces its own tab; Quick open adds a tab and
 * closes its dialog. Everything else about searching is shared.
 */
export type BenchSearchActions = {
  onOpen: RightWorkspaceOpener
  onOpenThread: (sessionID: string) => Promise<boolean>
  onNewBoard: () => void
  onNewNote: () => void
  onOpenDrawer: (drawer: BenchSearchDrawer) => void
}

type BenchSearchInput = BenchSearchActions & {
  directory: string
  sessions: readonly SessionInfo[]
  /** What the field held when this search was last shown. */
  initial?: BenchEmptyTabDraft
}

type BrowserSearchResult = { id: string; title: string; url: string }
/** Opens a blank Browser tab in one profile; there is one per profile, Incognito included. */
type BrowserProfileAction = {
  kind: "browser-profile"
  id: string
  title: string
  profileID: InAppBrowserProfileID
  profileName: string
}
type BenchSearchResult =
  | NotebookSearchResult
  | (Omit<NotebookSearchCommand, "kind"> & { kind: "command" })
  | (BrowserSearchResult & { kind: "browser" })
  | (BrowserSearchResult & { kind: "browser-command" })
  | BrowserProfileAction
const SEARCH_FILTERS = [
  ["all", "All types"],
  ["thread", "Chats"],
  ["source", "Sources"],
  ["creation", "Creations"],
  ["practice", "Practice"],
  ["board", "Boards"],
  ["note", "Notes"],
  ["file", "Files"],
  ["tab", "Open tabs"],
] as const

const NO_BROWSER_HISTORY: readonly InAppBrowserHistoryEntry[] = []
const RESULT_CLASS =
  "flex h-9 w-full min-w-0 items-center gap-2.5 rounded-lg px-2 text-left text-sm text-text-base hover:bg-surface-raised-base-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-interactive-base"

function searchGroupOf(result: BenchSearchResult): "Commands" | "Browser" | "Items" {
  if (result.kind === "command" || result.kind === "browser-profile") return "Commands"
  return result.kind === "browser-command" ? "Browser" : "Items"
}

/** Notebook items carry a target; commands and Browser rows do not. */
function notebookResultOf(result: BenchSearchResult): NotebookSearchResult | undefined {
  return "target" in result ? result : undefined
}

function resultPathLabel(result: NotebookSearchResult): string | undefined {
  const target = result.target
  if (target.type !== "file" && target.type !== "note" && target.type !== "resource")
    return undefined
  const path = target.type === "note" ? target.relativePath : target.path
  const slash = path.lastIndexOf("/")
  const name = slash >= 0 ? path.slice(slash + 1) : path
  const titleMatchesName =
    result.title === name ||
    (target.type === "note" && result.title === name.replace(/\.md$/iu, ""))
  if (!titleMatchesName) return path
  return slash >= 0 ? path.slice(0, slash) : undefined
}

/**
 * The notebook search behind the New tab page and Quick open: chats, notebook items, open tabs,
 * commands, and Browser rows in one ranked list, with a highlight the field's arrow keys move.
 */
export function useBenchSearch(input: BenchSearchInput) {
  const [query, setQuery] = useState(input.initial?.query ?? "")
  const [filter, setFilter] = useState<NotebookSearchFilter>(
    input.initial?.filter ?? NOTEBOOK_SEARCH_FILTER_ALL,
  )
  // The highlight follows a result, not a position: undefined tracks the top row, and a row the
  // user moved to stays highlighted when late results arrive.
  const [selectedIdentity, setSelectedIdentity] = useState<string | undefined>(
    input.initial?.selectedIdentity,
  )
  // Focus never leaves the field: the arrow keys move a highlight the field points at, so typing
  // and Backspace keep editing the query, as in a command palette.
  const inputRef = useRef<HTMLInputElement>(null)
  const listboxID = useId()
  const resultRefs = useRef<Array<HTMLButtonElement | null>>([])
  const queryClient = useQueryClient()
  const workspace = useDirectoryWorkspaceOptional()
  const browserAvailable = usePlatform().inAppBrowser !== undefined
  const notebookQuery = benchNewTabNotebookQuery({ directory: input.directory, query })
  const notebook = useNotebookSearch({
    directory: input.directory,
    query: notebookQuery,
    filter,
    sessions: input.sessions,
    recentLimit: 30,
    commands: NOTEBOOK_SEARCH_COMMANDS.map((command) => command.id),
    enabled: notebookQuery.length <= NOTEBOOK_SEARCH_MAX_QUERY_LENGTH,
  })
  const settingsHydrated = useInAppBrowserSettingsHydrated()
  const searchEngine = useInAppBrowserSettingsStore((state) => state.defaultSearchEngine)
  const userProfiles = useInAppBrowserSettingsStore((state) => state.userProfiles)
  const defaultProfileID = useInAppBrowserSettingsStore((state) => state.defaultProfileID)
  // The default profile first and Incognito last, in the Browser tile's menu and in search alike.
  const browserProfiles = newTabInAppBrowserProfiles(userProfiles, defaultProfileID)
  const browserHistory = useInAppBrowserHistoryStore(
    (state) => state.byDirectory[input.directory] ?? NO_BROWSER_HISTORY,
  )

  const browserAction =
    browserAvailable && settingsHydrated && filter === "all"
      ? resolveBenchNewTabBrowserInputAction(query, searchEngine)
      : undefined
  const historyMatches =
    browserAvailable && filter === "all"
      ? searchBenchNewTabBrowserHistory(browserHistory, query).filter(
          (page) => page.url !== browserAction?.url,
        )
      : []
  const browserResult: BenchSearchResult[] = browserAction
    ? [
        {
          kind: "browser-command",
          id: "browser-input",
          title: browserAction.title,
          url: browserAction.url,
        },
      ]
    : []
  // A profile's name finds its own Browser row, so "incognito" offers an Incognito tab.
  const browserProfileResults: BrowserProfileAction[] =
    browserAvailable && filter === "all"
      ? browserProfiles.flatMap((profile) => {
          const keywords =
            profile.id === INCOGNITO_IN_APP_BROWSER_PROFILE_ID
              ? `${profile.name} private`
              : profile.name
          const score = scoreNotebookSearchText({
            query,
            title: "Browser",
            keywords: `open web page tab ${keywords}`,
          })
          return score === undefined
            ? []
            : [
                {
                  kind: "browser-profile" as const,
                  id: `browser-profile:${profile.id}`,
                  title: "Browser",
                  profileID: profile.id,
                  profileName: profile.name,
                },
              ]
        })
      : []

  const commandActions = {
    "new-note": input.onNewNote,
    "open-notes": () => {
      useUiPreferences.getState().setNotesScope("all")
      input.onOpenDrawer("notes")
    },
    "new-board": input.onNewBoard,
    "open-boards": () => input.onOpenDrawer("boards"),
    "open-files": () => input.onOpenDrawer("files"),
    "open-resources": () => input.onOpenDrawer("sources"),
    "open-practice": () => input.onOpenDrawer("practice"),
    "open-creations": () => input.onOpenDrawer("creations"),
  } satisfies Record<NotebookSearchCommandID, () => void>

  const searchPending = notebook.searching || notebook.catalogPending
  const pickGenerationRef = useRef(0)

  function supersedePendingPick(): number {
    pickGenerationRef.current += 1
    return pickGenerationRef.current
  }

  function awaitsResourceCatalog(result: BenchSearchResult): boolean {
    const item = notebookResultOf(result)
    if (item?.target.type !== "resource" || item.target.status !== "unprocessed") return false
    const extension = fileExtensionFromPath(item.target.path)
    return notebook.resourcesPending && (extension === "pdf" || extension === "epub")
  }

  function canOpenWithKeyboard(result: BenchSearchResult, index: number): boolean {
    if (!hasQuery) return true
    if (result.kind === "command" || result.kind === "browser-profile") return true
    if (result.kind === "browser-command" && index === 0 && browserAction?.placement === "primary")
      return true
    return (
      !notebook.searching &&
      !awaitsResourceCatalog(result) &&
      (notebook.canSearch || browserAction !== undefined)
    )
  }

  async function openResult(result: BenchSearchResult) {
    if (awaitsResourceCatalog(result)) return
    const pickGeneration = supersedePendingPick()
    if (result.kind === "command") {
      commandActions[result.id]()
      return
    }
    if (result.kind === "browser-profile") {
      void openBrowser(IN_APP_BROWSER_BLANK_URL, result.profileID)
      return
    }
    if (result.kind === "browser" || result.kind === "browser-command") {
      void openBrowser(result.url)
      return
    }
    if (result.target.type === "thread") {
      void input.onOpenThread(result.target.sessionID)
      return
    }
    // An unprocessed PDF or EPUB is still a notebook file. Processed resources come from the catalog.
    if (
      result.target.type === "file" ||
      (result.target.type === "resource" && result.target.status === "unprocessed")
    ) {
      const available = await confirmNotebookFileAvailable({
        queryClient,
        directory: input.directory,
        path: result.target.path,
      })
      if (pickGenerationRef.current !== pickGeneration) return
      if (!available) {
        toast.error(workspaceFileMissingMessage(result.target.path))
        return
      }
    }
    let resolved = result
    if (result.target.type === "resource" && result.target.status === "unprocessed") {
      try {
        const records = await queryClient.fetchQuery({
          ...processedResourcesQueryOptions(input.directory),
          staleTime: 0,
        })
        const processed = findProcessedResourceByPath(records, result.target.path)
        if (processed) resolved = notebookSearchResultFromResource(processed)
      } catch {
        // An unprocessed PDF or EPUB can still open when the catalog is unavailable.
      }
      if (pickGenerationRef.current !== pickGeneration) return
    }
    const request = notebookSearchOpenRequest({ result: resolved, directory: input.directory })
    if (request) void input.onOpen(request)
  }

  async function openBrowser(url: string, profileID?: InAppBrowserProfileID) {
    if (!(await waitForInAppBrowserSettingsHydration())) return
    const target = createInAppBrowserBenchTarget(
      url,
      profileID ?? useInAppBrowserSettingsStore.getState().defaultProfileID,
    )
    void input.onOpen({
      type: "object",
      directory: input.directory,
      target: openBrowserTabFor(target) ?? target,
    })
  }

  /** A page already open in this chat's Bench switches to its tab, as a browser's address bar does. */
  function openBrowserTabFor(target: Extract<BenchTabTarget, { type: "browser" }>) {
    if (workspace?.directory !== input.directory) return undefined
    const state = workspace.store.getState()
    return existingBrowserTabTarget({
      tabs: workspacePresentationSlotForChat(state.slots, state.activeChatKey).tabs,
      target,
      runtimeUrls: useInAppBrowserTabsStore.getState().byTabID,
    })
  }

  const hasQuery = query.trim().length > 0
  const results: BenchSearchResult[] = hasQuery
    ? [
        ...(browserAction?.placement === "primary" ? browserResult : []),
        ...notebook.commands.map((command) => ({ ...command, kind: "command" as const })),
        ...browserProfileResults,
        ...notebook.results.filter((result) => !awaitsResourceCatalog(result)),
        ...historyMatches.map((page) => ({
          kind: "browser" as const,
          id: `browser:${page.url}`,
          title: page.title || page.url,
          url: page.url,
        })),
        ...(browserAction?.placement === "fallback" ? browserResult : []),
      ]
    : notebook.recents.filter((result) => result.kind !== "source").slice(0, 5)
  const visibleCount = hasQuery ? Math.min(results.length, 12) : results.length
  // Only rows on screen can hold the highlight, so one pushed past the last row falls back to the top.
  // Recents stay unhighlighted until the arrow keys pick one.
  const highlightedIndex = results
    .slice(0, visibleCount)
    .findIndex((result) => result.id === selectedIdentity)
  const selectedIndex = hasQuery ? Math.max(0, highlightedIndex) : highlightedIndex
  const selectedResult = selectedIndex >= 0 ? results[selectedIndex] : undefined
  const resultsSettling = notebook.searching || notebook.catalogPending

  // Enter while results are still arriving opens the highlighted row once they settle. Typing,
  // changing the filter, moving the highlight, or clicking a row drops it.
  const [submitPending, setSubmitPending] = useState(false)
  const openSettledRef = useRef(() => {})
  openSettledRef.current = () => {
    if (selectedResult && canOpenWithKeyboard(selectedResult, selectedIndex))
      void openResult(selectedResult)
  }
  useEffect(() => {
    if (!submitPending || resultsSettling) return
    setSubmitPending(false)
    openSettledRef.current()
  }, [resultsSettling, submitPending])

  /** Opens the highlighted row for Enter, or waits for results still arriving; false if nothing to do. */
  function submit(): boolean {
    if (selectedResult && canOpenWithKeyboard(selectedResult, selectedIndex)) {
      setSubmitPending(false)
      void openResult(selectedResult)
      return true
    }
    if (!hasQuery || !resultsSettling) return false
    setSubmitPending(true)
    return true
  }

  return {
    directory: input.directory,
    query,
    filter,
    selectedIdentity,
    hasQuery,
    results,
    visibleCount,
    selectedIndex,
    selectedResult,
    notebook,
    notebookQuery,
    searchPending,
    browserAvailable,
    browserProfiles,
    browserHistory,
    inputRef,
    listboxID,
    resultRefs,
    submit,
    // A click supersedes an Enter still waiting on results.
    openResult: (result: BenchSearchResult) => {
      setSubmitPending(false)
      return openResult(result)
    },
    openBrowser,
    changeQuery(nextQuery: string) {
      supersedePendingPick()
      setQuery(nextQuery)
      setSelectedIdentity(undefined)
      setSubmitPending(false)
    },
    changeFilter(nextFilter: NotebookSearchFilter) {
      supersedePendingPick()
      setFilter(nextFilter)
      setSelectedIdentity(undefined)
      setSubmitPending(false)
    },
    highlight(index: number) {
      const next = results[index]
      if (!next) return
      supersedePendingPick()
      setSubmitPending(false)
      setSelectedIdentity(next.id)
      resultRefs.current[index]?.scrollIntoView?.({ block: "nearest" })
    },
  }
}

export type BenchSearch = ReturnType<typeof useBenchSearch>

/** The search field with its type filter. Arrow keys move the highlight; Enter opens it. */
export function BenchSearchField(props: { search: BenchSearch; autoFocus?: boolean }) {
  const search = props.search
  return (
    <div className="flex h-11 items-center gap-3 rounded-xl border border-border-base bg-surface-raised-base px-3 focus-within:border-border-interactive-base">
      <SearchIcon className="size-4 shrink-0 text-icon-base" aria-hidden />
      <input
        ref={search.inputRef}
        type="search"
        role="combobox"
        aria-label="Search this notebook"
        aria-autocomplete="list"
        aria-expanded={search.visibleCount > 0}
        aria-controls={search.visibleCount > 0 ? search.listboxID : undefined}
        aria-activedescendant={
          search.selectedResult ? `${search.listboxID}-${search.selectedIndex}` : undefined
        }
        placeholder="Search or run a command"
        maxLength={IN_APP_BROWSER_URL_MAX_LENGTH}
        value={search.query}
        autoFocus={props.autoFocus}
        className="min-w-0 flex-1 bg-transparent text-sm text-text-strong outline-none placeholder:text-text-weaker"
        onChange={(event) => search.changeQuery(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return
          if ((event.key === "ArrowDown" || event.key === "ArrowUp") && search.visibleCount > 0) {
            event.preventDefault()
            search.highlight(
              Math.min(
                Math.max(search.selectedIndex + (event.key === "ArrowDown" ? 1 : -1), 0),
                search.visibleCount - 1,
              ),
            )
            return
          }
          if (event.key === "Enter" && search.submit()) event.preventDefault()
        }}
      />
      {search.hasQuery ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Filter search types">
              <SlidersHorizontalIcon aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            onCloseAutoFocus={(event) => {
              event.preventDefault()
              search.inputRef.current?.focus()
            }}
          >
            <DropdownMenuRadioGroup value={search.filter}>
              {SEARCH_FILTERS.map(([kind, label]) => (
                <DropdownMenuRadioItem
                  key={kind}
                  value={kind}
                  onSelect={() => search.changeFilter(kind)}
                >
                  {label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  )
}

function BenchSearchResultRow(props: {
  search: BenchSearch
  result: BenchSearchResult
  index: number
}) {
  const { search, result, index } = props
  const item = notebookResultOf(result)
  const model =
    result.kind === "command"
      ? {
          glyph:
            result.id === "new-note"
              ? NoteAddIcon
              : result.id === "open-notes"
                ? NotesIcon
                : result.id.includes("board")
                  ? PresentationIcon
                  : result.id === "open-resources"
                    ? Books02Icon
                    : FolderIcon,
          title: result.title,
          kindLabel: "Action",
        }
      : result.kind === "browser-profile"
        ? { glyph: Globe, title: result.title, kindLabel: "Action" }
        : result.kind === "browser" || result.kind === "browser-command"
          ? { glyph: Globe, title: result.title, kindLabel: "Browser" }
          : describeNotebookSearchResult({ result, directory: search.directory })
  const Icon = model.glyph
  const art =
    result.kind === "command"
      ? benchCommandArt(result.id)
      : result.kind === "browser-profile"
        ? BENCH_BROWSER_ART
        : undefined
  const pathLabel =
    result.kind === "browser-profile"
      ? result.profileName
      : item
        ? resultPathLabel(item)
        : undefined
  const selected = search.selectedIndex === index
  return (
    <button
      type="button"
      id={`${search.listboxID}-${index}`}
      role="option"
      aria-selected={selected}
      tabIndex={-1}
      data-search-kind={result.kind}
      className={cn(RESULT_CLASS, selected && "bg-surface-raised-base")}
      ref={(node) => {
        search.resultRefs.current[index] = node
      }}
      // Clicking a row must not pull focus out of the field.
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => void search.openResult(result)}
    >
      <span className="flex size-6 shrink-0 items-center justify-center">
        {item ? (
          <BenchItemIcon
            subject={searchResultIconSubject(item)}
            className="size-5 object-contain"
            artClassName="size-6 object-contain"
          />
        ) : result.kind === "browser" || result.kind === "browser-command" ? (
          <BenchItemIcon
            subject={{ type: "browser", url: result.url }}
            className="size-5 object-contain"
          />
        ) : art ? (
          <img src={art} alt="" className="size-6 object-contain" aria-hidden />
        ) : (
          <Icon className="size-4 text-icon-base" aria-hidden />
        )}
      </span>
      <span className="min-w-0 flex-1 truncate" title={model.title}>
        {model.title}
      </span>
      {pathLabel ? (
        <span className="max-w-[35%] truncate text-xs text-text-weaker" title={pathLabel}>
          {pathLabel}
        </span>
      ) : null}
      <span className="shrink-0 text-xs text-text-weaker">{model.kindLabel}</span>
    </button>
  )
}

/** Ranked matches for a typed query, grouped into commands, Browser, and items. */
export function BenchSearchResults(props: { search: BenchSearch }) {
  const search = props.search
  const notebook = search.notebook
  const results = search.results
  return (
    <div className="mt-3 flex flex-col gap-0.5">
      <span className="sr-only" role="status">
        {search.notebookQuery.length > NOTEBOOK_SEARCH_MAX_QUERY_LENGTH
          ? "Search is limited to 200 characters"
          : results.length > 0
            ? `${results.length} results${search.searchPending ? ", searching" : notebook.incomplete ? ", results may be incomplete" : ""}`
            : notebook.query.length < NOTEBOOK_SEARCH_MIN_QUERY_LENGTH
              ? "Keep typing"
              : search.searchPending
                ? "Searching"
                : notebook.incomplete
                  ? "Results may be incomplete. Try again"
                  : "No matches"}
      </span>
      {search.notebookQuery.length > NOTEBOOK_SEARCH_MAX_QUERY_LENGTH && results.length === 0 ? (
        <p className="px-2 py-3 text-xs text-text-weaker">Search is limited to 200 characters.</p>
      ) : notebook.query.length < NOTEBOOK_SEARCH_MIN_QUERY_LENGTH && results.length === 0 ? (
        <p className="px-2 py-3 text-xs text-text-weaker">Keep typing…</p>
      ) : results.length > 0 ? (
        <>
          <div
            role="listbox"
            id={search.listboxID}
            aria-label="Search results"
            className="flex flex-col gap-0.5"
          >
            {results.slice(0, search.visibleCount).map((result, index) => {
              const group = searchGroupOf(result)
              const previous = results[index - 1]
              const previousGroup = previous ? searchGroupOf(previous) : undefined
              return (
                <Fragment key={result.id}>
                  {index === 0 || group !== previousGroup ? (
                    <div
                      className={cn(
                        "px-2 pb-1 pt-2 text-xs text-text-weaker",
                        index > 0 && "mt-2 border-t border-border-weaker-base pt-3",
                      )}
                      data-search-group={group}
                    >
                      {group}
                    </div>
                  ) : null}
                  <BenchSearchResultRow search={search} result={result} index={index} />
                </Fragment>
              )
            })}
          </div>
          {search.searchPending ? (
            <p className="px-2 py-2 text-xs text-text-weaker">Searching…</p>
          ) : null}
        </>
      ) : (
        <p className="px-2 py-3 text-xs text-text-weaker">
          {search.searchPending
            ? "Searching…"
            : notebook.incomplete
              ? "Results may be incomplete. Try again."
              : "No matches"}
        </p>
      )}
      {results.length > 0 && notebook.incomplete ? (
        <p className="px-2 py-2 text-xs text-text-weaker">Results may be incomplete.</p>
      ) : null}
      {(notebook.filesPartial || notebook.filesError) && !notebook.filesSearching ? (
        <button
          type="button"
          className="self-start px-2 py-1 text-xs text-text-base underline"
          onClick={() => void notebook.refreshFiles().catch(() => undefined)}
        >
          Retry file scan
        </button>
      ) : null}
    </div>
  )
}

/** Whether an empty field has recent items or pages to show. */
export function benchSearchHasRecents(search: BenchSearch): boolean {
  return search.results.length > 0 || (search.browserAvailable && search.browserHistory.length > 0)
}

/** Recent notebook items, then recently visited Browser pages, for an empty field. */
export function BenchSearchRecents(props: { search: BenchSearch; className?: string }) {
  const search = props.search
  if (!benchSearchHasRecents(search)) return null
  return (
    <div className={props.className}>
      <p className="mb-2 px-2 text-xs text-text-weaker">Recent</p>
      <div className="flex flex-col gap-0.5">
        {search.results.length > 0 ? (
          <div
            role="listbox"
            id={search.listboxID}
            aria-label="Recent"
            className="flex flex-col gap-0.5"
          >
            {search.results.map((result, index) => (
              <BenchSearchResultRow key={result.id} search={search} result={result} index={index} />
            ))}
          </div>
        ) : null}
        {search.browserAvailable
          ? search.browserHistory.slice(0, 3).map((page) => (
              <button
                key={page.url}
                type="button"
                className={cn(RESULT_CLASS, "text-text-weak")}
                onClick={() => void search.openBrowser(page.url)}
              >
                <span className="flex size-6 shrink-0 items-center justify-center">
                  <BenchItemIcon
                    subject={{ type: "browser", url: page.url }}
                    className="size-4 object-contain"
                    artClassName="size-5 object-contain"
                  />
                </span>
                <span className="min-w-0 flex-1 truncate">{page.title || page.url}</span>
                <span className="shrink-0 text-xs text-text-weaker">Page</span>
              </button>
            ))
          : null}
      </div>
    </div>
  )
}
