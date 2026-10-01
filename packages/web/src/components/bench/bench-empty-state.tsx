import { useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  Button,
  ChevronDownIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  cn,
  toast,
} from "@buddy/ui"
import { PlusIcon } from "@/icons/app-icons"
import { pickResourceFilePath } from "@/lib/resource-file-picker"
import { addResource } from "@/state/resource-actions"
import { invalidateResourcesQueries } from "@/state/resources-query"
import { stringifyError } from "@/lib/api-client"
import { useBenchEmptyTabDrafts } from "@/state/bench-empty-tab-drafts"
import { ResourceCover } from "@/components/resources/resource-cover"
import type { SessionInfo } from "@/state/chat-types"
import { IN_APP_BROWSER_BLANK_URL } from "@buddy/browser-contract"
import {
  BENCH_BOARD_ART,
  BENCH_BROWSER_ART,
  BENCH_FILES_ART,
  BENCH_NEW_NOTE_ART,
  BENCH_NOTES_ART,
  BENCH_RESOURCE_ART,
} from "./bench-action-art"
import {
  BenchSearchField,
  BenchSearchRecents,
  BenchSearchResults,
  useBenchSearch,
  type BenchSearchActions,
} from "./bench-search"

type BenchEmptyStateProps = BenchSearchActions & {
  /** The New tab this page belongs to; it keeps what was typed while the user is away. */
  emptyTabID: string | null
  directory: string
  sessions: readonly SessionInfo[]
}

const SHORTCUT_CLASS =
  "grid h-10 min-w-0 grid-cols-[1.5rem_minmax(0,1fr)] items-center gap-2.5 rounded-lg border border-border-weaker-base px-3 text-left text-sm text-text-base hover:border-border-base hover:bg-surface-raised-base-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-interactive-base"
/** Each shelf slot is a padded hover cell, so a cover's left edge meets the row text below it. */
const SHELF_CELL_CLASS =
  "group min-w-0 rounded-lg p-2 text-left hover:bg-surface-raised-base-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-interactive-base disabled:opacity-50"
const SHELF_CAPTION_CLASS = "mt-2 line-clamp-2 break-words text-xs leading-4"
/** Three books and the Add slot keep the shelf to one row of four. */
const SHELF_BOOK_LIMIT = 3
const SHELF_GHOST_SLOTS = ["ghost-1", "ghost-2", "ghost-3"] as const

/** Search, creation shortcuts, and recents for a Bench with no open surface. */
export function BenchEmptyState(props: BenchEmptyStateProps) {
  const [draft] = useState(() =>
    props.emptyTabID ? useBenchEmptyTabDrafts.getState().drafts[props.emptyTabID] : undefined,
  )
  // No focus on mount: the empty page also appears after closing a tab or switching chats,
  // and the explicit open paths (New tab, Mod+T, Mod+Shift+F, Mod+P) focus the field themselves.
  const pageMounted = useRef(false)
  useEffect(() => {
    pageMounted.current = true
    return () => {
      pageMounted.current = false
    }
  }, [])
  const search = useBenchSearch({
    directory: props.directory,
    sessions: props.sessions,
    initial: draft,
    onOpen: async (request) => (pageMounted.current ? props.onOpen(request) : "blocked"),
    onOpenThread: props.onOpenThread,
    onNewBoard: props.onNewBoard,
    onNewNote: props.onNewNote,
    onOpenDrawer: props.onOpenDrawer,
  })
  const { query, filter, selectedIdentity } = search
  useEffect(() => {
    if (!props.emptyTabID) return
    useBenchEmptyTabDrafts
      .getState()
      .setDraft(props.emptyTabID, { query, filter, selectedIdentity })
  }, [filter, props.emptyTabID, query, selectedIdentity])
  const [addingResource, setAddingResource] = useState(false)
  const queryClient = useQueryClient()

  async function addResourceFromPicker() {
    if (addingResource) return
    setAddingResource(true)
    try {
      const sourcePath = await pickResourceFilePath()
      if (!sourcePath) return
      await addResource(props.directory, { sourcePath })
      await invalidateResourcesQueries(queryClient, props.directory)
      props.onOpenDrawer("sources")
    } catch (error) {
      toast.error(stringifyError(error))
    } finally {
      setAddingResource(false)
    }
  }

  const recentBooks = search.notebook.recents
    .filter((result) => result.kind === "source" && result.resourceVisual)
    .slice(0, SHELF_BOOK_LIMIT)
  // Outlines wait for the catalog, so a notebook with books never flashes an empty shelf.
  const shelfEmpty = recentBooks.length === 0 && !search.notebook.catalogPending
  return (
    <div
      data-component="bench-empty-state"
      className="flex h-full min-h-0 justify-center overflow-y-auto bg-background-base px-5 pt-[min(20vh,160px)]"
    >
      <div className="w-full max-w-[440px] pb-12">
        <BenchSearchField search={search} />
        {search.hasQuery ? (
          <BenchSearchResults search={search} />
        ) : (
          <>
            <div className="mt-6 grid grid-cols-2 gap-2">
              <button type="button" className={SHORTCUT_CLASS} onClick={props.onNewBoard}>
                <img
                  src={BENCH_BOARD_ART}
                  alt=""
                  className="size-6 shrink-0 object-contain"
                  aria-hidden
                />
                <span className="truncate">New board</span>
              </button>
              <button type="button" className={SHORTCUT_CLASS} onClick={props.onNewNote}>
                <img
                  src={BENCH_NEW_NOTE_ART}
                  alt=""
                  className="size-6 shrink-0 object-contain"
                  aria-hidden
                />
                <span className="truncate">New note</span>
              </button>
              {search.browserAvailable ? (
                // The tile opens the default profile; its menu opens any profile, Incognito included.
                <div className="relative min-w-0">
                  <button
                    type="button"
                    className={cn(SHORTCUT_CLASS, "w-full pr-10")}
                    onClick={() => void search.openBrowser(IN_APP_BROWSER_BLANK_URL)}
                  >
                    <img
                      src={BENCH_BROWSER_ART}
                      alt=""
                      className="size-6 shrink-0 object-contain"
                      aria-hidden
                    />
                    <span className="truncate">Browser</span>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Open Browser in a profile"
                        className="absolute top-1/2 right-2 -translate-y-1/2 text-icon-base"
                      >
                        <ChevronDownIcon aria-hidden />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      onCloseAutoFocus={(event) => {
                        event.preventDefault()
                        search.inputRef.current?.focus()
                      }}
                    >
                      {search.browserProfiles.map((profile) => (
                        <DropdownMenuItem
                          key={profile.id}
                          onSelect={() =>
                            void search.openBrowser(IN_APP_BROWSER_BLANK_URL, profile.id)
                          }
                        >
                          {profile.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ) : null}
              <button
                type="button"
                className={SHORTCUT_CLASS}
                onClick={() => props.onOpenDrawer("files")}
              >
                <img
                  src={BENCH_FILES_ART}
                  alt=""
                  className="size-6 shrink-0 object-contain"
                  aria-hidden
                />
                <span className="truncate">Files</span>
              </button>
              <button
                type="button"
                className={SHORTCUT_CLASS}
                onClick={() => props.onOpenDrawer("notes")}
              >
                <img
                  src={BENCH_NOTES_ART}
                  alt=""
                  className="size-6 shrink-0 object-contain"
                  aria-hidden
                />
                <span className="truncate">Notes</span>
              </button>
              <button
                type="button"
                className={SHORTCUT_CLASS}
                onClick={() => props.onOpenDrawer("sources")}
              >
                <img
                  src={BENCH_RESOURCE_ART}
                  alt=""
                  className="size-6 shrink-0 object-contain"
                  aria-hidden
                />
                <span className="truncate">Resources</span>
              </button>
            </div>
            {/* No label: the covers say what the shelf is. The cells' bottom padding is pulled
                back so Recent keeps the page's section gap. */}
            <div role="group" aria-label="Resources" className="-mb-2 mt-5 grid grid-cols-4 gap-1">
              {recentBooks.map((book) =>
                book.resourceVisual ? (
                  <button
                    key={book.id}
                    type="button"
                    title={book.title}
                    className={SHELF_CELL_CLASS}
                    onClick={() => void search.openResult(book)}
                  >
                    <ResourceCover
                      directory={props.directory}
                      title={book.title}
                      extension={book.resourceVisual.extension}
                      coverRelpath={book.resourceVisual.coverRelpath}
                      presentation="shelf"
                      className="aspect-[2/3] w-full"
                    />
                    <span className={cn(SHELF_CAPTION_CLASS, "text-text-base")}>{book.title}</span>
                  </button>
                ) : null,
              )}
              <button
                type="button"
                disabled={addingResource}
                className={SHELF_CELL_CLASS}
                onClick={() => void addResourceFromPicker()}
              >
                <span className="flex aspect-[2/3] w-full items-center justify-center rounded-md border border-dashed border-border-base text-icon-base group-hover:border-border-strong-base group-hover:text-text-base">
                  <PlusIcon className="size-5" aria-hidden />
                </span>
                <span
                  className={cn(SHELF_CAPTION_CLASS, "text-text-weak group-hover:text-text-base")}
                >
                  {addingResource ? "Adding…" : "Add resource"}
                </span>
                {shelfEmpty ? (
                  <span className="block text-[11px] leading-4 text-text-weaker">PDF or EPUB</span>
                ) : null}
              </button>
              {/* Empty: faint outlines finish the row, so a first-run shelf still reads as a shelf. */}
              {shelfEmpty
                ? SHELF_GHOST_SLOTS.map((slot) => (
                    <div key={slot} className="p-2" aria-hidden>
                      <div className="aspect-[2/3] w-full rounded-md border border-border-weaker-base opacity-60" />
                    </div>
                  ))
                : null}
            </div>
            <BenchSearchRecents search={search} className="mt-7" />
          </>
        )}
      </div>
    </div>
  )
}
