import { useState, type ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import { ToggleGroup, ToggleGroupItem, cn } from "@buddy/ui"
import { PlusIcon, SearchIcon, XIcon } from "@/icons/app-icons"
import {
  BENCH_BOARD_ART,
  BENCH_BROWSER_ART,
  BENCH_CHAT_ART,
  BENCH_FILES_ART,
  BENCH_NEW_NOTE_ART,
  BENCH_NOTES_ART,
  BENCH_RESOURCE_ART,
} from "@/components/bench/bench-action-art"
import { ResourceCover } from "@/components/resources/resource-cover"
import { processedResourcesQueryOptions } from "@/state/resources-query"
import { notebookSearchResultFromResource } from "@/state/notebook-search-results"
import { COVER_TONES, type CoverTone } from "./bench-home/mock"

// ---------------------------------------------------------------------------
// The shelf: covers stay the hero, and follow the page's rules. Plain (or no)
// label, covers inset to the same edge as every row, row hover around each
// book, and Add resource as the last book on the shelf. Shown empty, partly
// filled and full. Shipped without the label in bench-empty-state.tsx.
// ---------------------------------------------------------------------------

// Copied from bench-empty-state.tsx so the prototype matches the shipped page exactly.
const SHORTCUT_CLASS =
  "grid h-10 min-w-0 grid-cols-[1.5rem_minmax(0,1fr)] items-center gap-2.5 rounded-lg border border-border-weaker-base px-3 text-left text-sm text-text-base hover:border-border-base hover:bg-surface-raised-base-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-interactive-base"
const RESULT_CLASS =
  "flex h-9 w-full min-w-0 items-center gap-2.5 rounded-lg px-2 text-left text-sm text-text-base hover:bg-surface-raised-base-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-interactive-base"
const SECTION_LABEL_CLASS = "mb-2 px-2 text-xs text-text-weaker"

/** Each shelf slot is a padded hover cell, so the cover's left edge meets the row text. */
const SHELF_CELL_CLASS =
  "group min-w-0 rounded-lg p-2 text-left hover:bg-surface-raised-base-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-interactive-base"
const SHELF_CAPTION_CLASS = "mt-2 line-clamp-2 break-words text-xs leading-4"
/** Three books and the Add slot: the shelf is always exactly one row of four. */
const SHELF_BOOK_LIMIT = 3
const GHOST_SLOTS = ["ghost-1", "ghost-2", "ghost-3"] as const

export type Book = {
  readonly id: string
  readonly title: string
  readonly extension: string
  readonly coverRelpath?: string
  readonly tone?: CoverTone
}

// The first mock has no cover on purpose: the full state shows the fallback.
const MOCK_BOOKS: readonly Book[] = [
  { id: "mock:1", title: "lecture-notes-week-3-spaced-retrieval", extension: "pdf" },
  { id: "mock:2", title: "Learning to Learn", extension: "epub", tone: "clay" },
  { id: "mock:3", title: "Memory Palaces", extension: "epub", tone: "ink" },
]

const SHORTCUTS = [
  { label: "New board", art: BENCH_BOARD_ART },
  { label: "New note", art: BENCH_NEW_NOTE_ART },
  { label: "Browser", art: BENCH_BROWSER_ART },
  { label: "Files", art: BENCH_FILES_ART },
  { label: "Notes", art: BENCH_NOTES_ART },
  { label: "Resources", art: BENCH_RESOURCE_ART },
] as const

const RECENTS = [
  { id: "r1", title: "Whiteboard", art: BENCH_BOARD_ART, kind: "Whiteboard" },
  { id: "r2", title: "Adding 12 numbered circles to whiteboard", art: BENCH_CHAT_ART, kind: "Chat" },
  { id: "r3", title: "Whiteboard", art: BENCH_BOARD_ART, kind: "Whiteboard" },
  { id: "r4", title: "Google", art: BENCH_BROWSER_ART, kind: "Page" },
  { id: "r5", title: "Example Domain", art: BENCH_BROWSER_ART, kind: "Page" },
] as const

/** The notebook's real resources first, padded with mock books so every state can be shown. */
export function useBooks(directory: string | undefined) {
  const query = useQuery({
    ...processedResourcesQueryOptions(directory ?? ""),
    enabled: directory !== undefined,
  })
  const real = (query.data ?? []).flatMap((resource): Book[] => {
    const result = notebookSearchResultFromResource(resource)
    if (!result.resourceVisual) return []
    return [Object.assign(
      { id: result.id, title: result.title, extension: result.resourceVisual.extension },
      result.resourceVisual.coverRelpath ? { coverRelpath: result.resourceVisual.coverRelpath } : undefined,
    )]
  })
  return { real, padded: [...real, ...MOCK_BOOKS] }
}

// ---------------------------------------------------------------------------
// Covers
// ---------------------------------------------------------------------------

export function BookCover(props: { book: Book; directory: string | undefined }) {
  if (props.book.tone) {
    return (
      <div className={cn(
        "relative flex aspect-[2/3] w-full flex-col justify-end overflow-hidden rounded-md p-2 shadow-sm",
        COVER_TONES[props.book.tone],
      )}>
        <span className="absolute inset-y-0 left-0 w-[3px] bg-black/15" aria-hidden />
        <span className="line-clamp-3 font-serif text-[11px] font-semibold leading-tight">{props.book.title}</span>
      </div>
    )
  }
  // The shipped shelf presentation: the cover image, or the library placeholder at shelf size.
  return (
    <ResourceCover
      directory={props.directory ?? ""}
      title={props.book.title}
      extension={props.book.extension}
      coverRelpath={props.book.coverRelpath}
      presentation="shelf"
      className="aspect-[2/3] w-full"
    />
  )
}

// ---------------------------------------------------------------------------
// The shelf
// ---------------------------------------------------------------------------

function Shelf(props: { books: readonly Book[]; directory: string | undefined; label: boolean }) {
  const empty = props.books.length === 0
  return (
    // The cells' bottom padding is pulled back so Recent keeps the page's section gap.
    <div className={cn("-mb-2", props.label ? "mt-7" : "mt-5")}>
      {props.label ? <p className={cn(SECTION_LABEL_CLASS, "mb-0")}>Resources</p> : null}
      <div className="grid grid-cols-4 gap-1">
        {props.books.slice(0, SHELF_BOOK_LIMIT).map((book) => (
          <button key={book.id} type="button" title={book.title} className={SHELF_CELL_CLASS}>
            <BookCover book={book} directory={props.directory} />
            <span className={cn(SHELF_CAPTION_CLASS, "text-text-base")}>{book.title}</span>
          </button>
        ))}
        <button type="button" className={SHELF_CELL_CLASS}>
          <span className="flex aspect-[2/3] w-full items-center justify-center rounded-md border border-dashed border-border-base text-icon-base group-hover:border-border-strong-base group-hover:text-text-base">
            <PlusIcon className="size-5" aria-hidden />
          </span>
          <span className={cn(SHELF_CAPTION_CLASS, "text-text-weak group-hover:text-text-base")}>Add resource</span>
          {empty ? <span className="block text-[11px] leading-4 text-text-weaker">PDF or EPUB</span> : null}
        </button>
        {/* Empty: faint outlines finish the row, so a first-run shelf still reads as a shelf. */}
        {empty
          ? GHOST_SLOTS.map((slot) => (
              <div key={slot} className="p-2" aria-hidden>
                <div className="aspect-[2/3] w-full rounded-md border border-border-weaker-base opacity-60" />
              </div>
            ))
          : null}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// The shared page — everything except the shelf is the shipped empty state
// ---------------------------------------------------------------------------

function EmptyBenchPage(props: { shelf: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border-base bg-background-base shadow-lg">
      <div className="flex h-9 items-end gap-1 border-b border-border-weaker-base bg-surface-inset-base px-2">
        <div className="flex h-8 items-center gap-2 rounded-t-lg border border-b-0 border-border-weaker-base bg-background-base px-3 text-xs text-text-base">
          <span>New tab</span>
          <XIcon className="size-3 text-icon-base" aria-hidden />
        </div>
        <span className="mb-1.5 flex size-6 items-center justify-center text-icon-base">
          <PlusIcon className="size-3.5" aria-hidden />
        </span>
      </div>
      <div className="px-5 pb-10 pt-12">
        <div className="mx-auto w-full max-w-[440px]">
          <div className="flex h-11 items-center gap-3 rounded-xl border border-border-base bg-surface-raised-base px-3">
            <SearchIcon className="size-4 shrink-0 text-icon-base" aria-hidden />
            <span className="text-sm text-text-weaker">Search or run a command</span>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-2">
            {SHORTCUTS.map((shortcut) => (
              <button key={shortcut.label} type="button" className={SHORTCUT_CLASS}>
                <img src={shortcut.art} alt="" className="size-6 shrink-0 object-contain" aria-hidden />
                <span className="truncate">{shortcut.label}</span>
              </button>
            ))}
          </div>
          {props.shelf}
          <div className="mt-7">
            <p className={SECTION_LABEL_CLASS}>Recent</p>
            <div className="flex flex-col gap-0.5">
              {RECENTS.map((recent) => (
                <button key={recent.id} type="button" className={RESULT_CLASS}>
                  <span className="flex size-6 shrink-0 items-center justify-center">
                    <img src={recent.art} alt="" className="size-6 object-contain" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{recent.title}</span>
                  <span className="shrink-0 text-xs text-text-weaker">{recent.kind}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Easel
// ---------------------------------------------------------------------------

type ShelfState = {
  id: "empty" | "partial" | "full"
  name: string
  notes: readonly string[]
  books: readonly Book[]
}

const LABEL_OPTIONS = ["off", "on"] as const

export function BenchResourcesFitEasel(props: { directory?: string }) {
  const [label, setLabel] = useState<(typeof LABEL_OPTIONS)[number]>("off")
  const books = useBooks(props.directory)
  const partial = books.real.length > 0 && books.real.length < SHELF_BOOK_LIMIT
    ? books.real
    : books.padded.slice(0, 2)

  const states: readonly ShelfState[] = [
    {
      id: "empty",
      name: "Empty",
      books: [],
      notes: [
        "Add is the first slot and says what it takes: PDF or EPUB",
        "Faint outlines finish the row — the shelf reads as a shelf before it has books",
        "Same height as a filled shelf, so adding the first book doesn’t shift the page",
      ],
    },
    {
      id: "partial",
      name: books.real.length > 0 && books.real.length < SHELF_BOOK_LIMIT ? "Partial · your notebook" : "Partial",
      books: partial,
      notes: [
        "Books, then Add, then open space — no outlines once there’s something real",
        "Titles wrap to two lines instead of cutting mid-word",
      ],
    },
    {
      id: "full",
      name: "Full",
      books: books.padded.slice(0, SHELF_BOOK_LIMIT),
      notes: [
        "Three most recently opened, then Add — always one row, never a second",
        "The rest are one click away in the Resources tile above",
        "A book without a cover gets the library’s placeholder — format and title on the cover — not the 16px glyph",
      ],
    },
  ]

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border-weaker-base px-4 py-2.5">
        <p className="text-xs text-text-weak">
          Only the shelf changes. {props.directory ? "Covers are this notebook’s own, padded with mock books." : "Mock covers — open a notebook to see real ones."}
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-weaker">“Resources” label</span>
          <ToggleGroup
            type="single"
            size="sm"
            value={label}
            onValueChange={(value) => {
              const next = LABEL_OPTIONS.find((candidate) => candidate === value)
              if (next) setLabel(next)
            }}
            aria-label="Show the Resources label"
          >
            <ToggleGroupItem value="off">Off</ToggleGroupItem>
            <ToggleGroupItem value="on">On</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-surface-inset-base p-6">
        <div className="mx-auto flex w-max gap-6">
          {states.map((state) => (
            <section key={state.id} className="flex w-[480px] shrink-0 flex-col gap-3">
              <h3 className="px-1 text-sm font-medium text-text-strong">{state.name}</h3>
              <EmptyBenchPage
                shelf={<Shelf books={state.books} directory={props.directory} label={label === "on"} />}
              />
              <ul className="flex flex-col gap-0.5 px-1 pt-1">
                {state.notes.map((note) => (
                  <li key={note} className="text-xs leading-5 text-text-weak">· {note}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
