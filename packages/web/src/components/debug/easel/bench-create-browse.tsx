import { useEffect, useState, type ReactNode } from "react"
import { ToggleGroup, ToggleGroupItem, Tooltip, TooltipContent, TooltipTrigger, cn } from "@buddy/ui"
import { PlusIcon, SearchIcon, XIcon } from "@/icons/app-icons"
import {
  BENCH_BOARD_ART,
  BENCH_BROWSER_ART,
  BENCH_CHAT_ART,
  BENCH_NEW_NOTE_ART,
  BENCH_NOTE_ART,
} from "@/components/bench/bench-action-art"
import { BookCover, useBooks, type Book } from "./bench-resources-fit"

// ---------------------------------------------------------------------------
// Direction B, redone. The page is three blocks, each with one job:
//   start    — the bar, with the three things you can make attached to it
//   books    — the shipped book row: the three latest covers, then Add resource
//   get back — Recent: everything else you opened (books are not repeated)
// Browse tiles stay gone: the right rail lists every library, and the bar
// opens any of them by name. The variants differ only in how the create
// actions attach to the bar; the book row and Recent are identical.
// ---------------------------------------------------------------------------

// Copied from bench-empty-state.tsx so the frame matches the shipped page exactly.
const RESULT_CLASS =
  "flex h-9 w-full min-w-0 items-center gap-2.5 rounded-lg px-2 text-left text-sm text-text-base hover:bg-surface-raised-base-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-interactive-base"
const SECTION_LABEL_CLASS = "mb-2 px-2 text-xs text-text-weaker"
const FOCUS_CLASS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-interactive-base"
const SHELF_CELL_CLASS =
  "group min-w-0 rounded-lg p-2 text-left hover:bg-surface-raised-base-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-interactive-base"
const SHELF_CAPTION_CLASS = "mt-2 line-clamp-2 break-words text-xs leading-4"
const SHELF_BOOK_LIMIT = 3
const SHELF_GHOST_SLOTS = ["ghost-1", "ghost-2", "ghost-3"] as const

const BAR_CLASS = "rounded-xl border border-border-base bg-surface-raised-base"
/** A labelled create action: the object's art, then its name. No border, so it never competes with the covers. */
const CREATE_BUTTON_CLASS = cn(
  FOCUS_CLASS,
  "flex h-8 items-center gap-2 rounded-lg text-[13px] text-text-weak hover:bg-surface-raised-base-hover hover:text-text-base",
)

// Add resource is not here: it is the last slot of the book row, where the book lands.
const CREATE = [
  { id: "note", label: "New note", art: BENCH_NEW_NOTE_ART, outcome: "A blank note opens in this tab" },
  { id: "board", label: "New board", art: BENCH_BOARD_ART, outcome: "A blank board opens in this tab" },
  { id: "tab", label: "New tab", art: BENCH_BROWSER_ART, outcome: "A blank browser page opens in this tab" },
] as const

const RECENTS = [
  { id: "r1", title: "Whiteboard", art: BENCH_BOARD_ART, kind: "Whiteboard" },
  { id: "r2", title: "Adding 12 numbered circles to whiteboard", art: BENCH_CHAT_ART, kind: "Chat" },
  { id: "r3", title: "Spaced retrieval — summary", art: BENCH_NOTE_ART, kind: "Note" },
  { id: "r4", title: "Google", art: BENCH_BROWSER_ART, kind: "Page" },
  { id: "r5", title: "Example Domain", art: BENCH_BROWSER_ART, kind: "Page" },
] as const

type Run = (message: { verb: "Create" | "Open"; text: string }) => void

// ---------------------------------------------------------------------------
// The two blocks every variant shares
// ---------------------------------------------------------------------------

/** The shipped book row, unchanged: three latest books and Add, or Add and outlines on a new notebook. */
function BookRow(props: { books: readonly Book[]; directory: string | undefined; run: Run }) {
  const empty = props.books.length === 0
  return (
    // The cells' bottom padding is pulled back so Recent keeps the page's section gap.
    <div role="group" aria-label="Resources" className="-mb-2 mt-5 grid grid-cols-4 gap-1">
      {props.books.slice(0, SHELF_BOOK_LIMIT).map((book) => (
        <button
          key={book.id}
          type="button"
          title={book.title}
          className={SHELF_CELL_CLASS}
          onClick={() => props.run({ verb: "Open", text: book.title })}
        >
          <BookCover book={book} directory={props.directory} />
          <span className={cn(SHELF_CAPTION_CLASS, "text-text-base")}>{book.title}</span>
        </button>
      ))}
      <button
        type="button"
        className={SHELF_CELL_CLASS}
        onClick={() => props.run({ verb: "Create", text: "File picker opens · the book joins this row" })}
      >
        <span className="flex aspect-[2/3] w-full items-center justify-center rounded-md border border-dashed border-border-base text-icon-base group-hover:border-border-strong-base group-hover:text-text-base">
          <PlusIcon className="size-5" aria-hidden />
        </span>
        <span className={cn(SHELF_CAPTION_CLASS, "text-text-weak group-hover:text-text-base")}>Add resource</span>
        {empty ? <span className="block text-[11px] leading-4 text-text-weaker">PDF or EPUB</span> : null}
      </button>
      {empty
        ? SHELF_GHOST_SLOTS.map((slot) => (
            <div key={slot} className="p-2" aria-hidden>
              <div className="aspect-[2/3] w-full rounded-md border border-border-weaker-base opacity-60" />
            </div>
          ))
        : null}
    </div>
  )
}

function RecentList(props: { run: Run }) {
  return (
    <div className="mt-7">
      <p className={SECTION_LABEL_CLASS}>Recent</p>
      <div className="flex flex-col gap-0.5">
        {RECENTS.map((recent) => (
          <button
            key={recent.id}
            type="button"
            className={RESULT_CLASS}
            onClick={() => props.run({ verb: "Open", text: recent.title })}
          >
            <span className="flex size-6 shrink-0 items-center justify-center">
              <img src={recent.art} alt="" className="size-6 object-contain" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 truncate">{recent.title}</span>
            <span className="shrink-0 text-xs text-text-weaker">{recent.kind}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function SearchRow(props: { trailing?: ReactNode }) {
  return (
    <div className="flex h-11 items-center gap-3 px-3">
      <SearchIcon className="size-4 shrink-0 text-icon-base" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-sm text-text-weaker">Search or run a command</span>
      {props.trailing}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Three ways to attach create to the bar
// ---------------------------------------------------------------------------

/** B1: the bar is one card — type on top, make underneath, like a composer. */
function ComposerStart(props: { run: Run }) {
  return (
    <div className={BAR_CLASS}>
      <SearchRow />
      {/* Inset so each glyph's centre sits under the search icon's. */}
      <div className="flex items-center gap-0.5 border-t border-border-weaker-base px-1.5 py-1">
        {CREATE.map((create) => (
          <button
            key={create.id}
            type="button"
            className={cn(CREATE_BUTTON_CLASS, "pl-1 pr-2.5")}
            onClick={() => props.run({ verb: "Create", text: create.outcome })}
          >
            <img src={create.art} alt="" className="size-5 object-contain" aria-hidden />
            {create.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/** B2: the bar alone, and one borderless row under it, on the same edge as the covers and Recent. */
function QuietRowStart(props: { run: Run }) {
  return (
    <>
      <div className={BAR_CLASS}>
        <SearchRow />
      </div>
      <div className="mt-2 flex items-center gap-0.5">
        {CREATE.map((create) => (
          <button
            key={create.id}
            type="button"
            className={cn(CREATE_BUTTON_CLASS, "px-2")}
            onClick={() => props.run({ verb: "Create", text: create.outcome })}
          >
            <img src={create.art} alt="" className="size-5 object-contain" aria-hidden />
            {create.label}
          </button>
        ))}
      </div>
    </>
  )
}

/** B3: the three objects sit at the end of the bar as art only; the name shows on hover. */
function IconsStart(props: { run: Run }) {
  return (
    <div className={BAR_CLASS}>
      <SearchRow
        trailing={
          <div className="-mr-1.5 flex shrink-0 items-center gap-0.5">
            <span className="mr-1 h-5 w-px bg-border-weaker-base" aria-hidden />
            {CREATE.map((create) => (
              <Tooltip key={create.id}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={create.label}
                    className={cn(FOCUS_CLASS, "flex size-8 items-center justify-center rounded-lg hover:bg-surface-raised-base-hover")}
                    onClick={() => props.run({ verb: "Create", text: create.outcome })}
                  >
                    <img src={create.art} alt="" className="size-5 object-contain" aria-hidden />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={6}>
                  {create.label}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        }
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// The frame
// ---------------------------------------------------------------------------

function BenchFrame(props: { children: (run: Run) => ReactNode }) {
  const [lastRun, setLastRun] = useState<{ key: number; verb: string; text: string }>()
  useEffect(() => {
    if (!lastRun) return
    const timeout = window.setTimeout(() => setLastRun(undefined), 2200)
    return () => window.clearTimeout(timeout)
  }, [lastRun])

  return (
    <div className="relative flex h-[660px] flex-col overflow-hidden rounded-xl border border-border-base bg-background-base shadow-lg">
      <div className="flex h-9 shrink-0 items-end gap-1 border-b border-border-weaker-base bg-surface-inset-base px-2">
        <div className="flex h-8 items-center gap-2 rounded-t-lg border border-b-0 border-border-weaker-base bg-background-base px-3 text-xs text-text-base">
          <span>New tab</span>
          <XIcon className="size-3 text-icon-base" aria-hidden />
        </div>
        <span className="mb-1.5 flex size-6 items-center justify-center text-icon-base">
          <PlusIcon className="size-3.5" aria-hidden />
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-10 pt-14">
        <div className="mx-auto w-full max-w-[440px]">
          {props.children((message) => setLastRun({ key: Date.now(), ...message }))}
        </div>
      </div>
      {lastRun ? (
        <div key={lastRun.key} role="status" className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4">
          <span className="max-w-full truncate rounded-full border border-border-base bg-surface-raised-stronger-non-alpha px-3 py-1.5 text-xs text-text-strong shadow-md">
            <span className="text-text-weaker">{lastRun.verb} · </span>
            {lastRun.text}
          </span>
        </div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Easel
// ---------------------------------------------------------------------------

type Variant = {
  id: string
  tag: string
  name: string
  idea: string
  notes: ReadonlyArray<readonly [string, string]>
  start: (run: Run) => ReactNode
}

const VARIANTS: readonly Variant[] = [
  {
    id: "composer",
    tag: "B1",
    name: "In the bar",
    idea: "The bar becomes one card: type on top, make underneath. Starting something is one object; the book row and Recent are for getting back.",
    notes: [
      ["Blocks", "Bar card, books, Recent."],
      ["Create", "Labelled, one click, visibly part of the bar."],
      ["First run", "The card and an empty book row with Add — three ways to start, one way to bring a book."],
      ["Cost", "The bar is about twice as tall."],
    ],
    start: (run) => <ComposerStart run={run} />,
  },
  {
    id: "quiet-row",
    tag: "B2",
    name: "Quiet row",
    idea: "The bar stays a bar. Under it, one borderless row of art and names, lined up with the covers and Recent below.",
    notes: [
      ["Blocks", "Bar, a light row, books, Recent."],
      ["Create", "Labelled, one click, no chrome — reads as text, not as tiles."],
      ["First run", "Same as B1, with the row floating under the bar."],
      ["Cost", "One more row than B1 or B3, though the lightest one."],
    ],
    start: (run) => <QuietRowStart run={run} />,
  },
  {
    id: "icons",
    tag: "B3",
    name: "Icons in the bar",
    idea: "Note, board and tab art sit at the end of the bar; the name shows on hover. Nothing between the bar and the books.",
    notes: [
      ["Blocks", "Bar, books, Recent — nothing extra."],
      ["Create", "One click, art only; names on hover."],
      ["First run", "Bar and empty book row; the icons are the only hint for notes, boards, tabs."],
      ["Cost", "Least discoverable — leans on the art reading clearly at 20px."],
    ],
    start: (run) => <IconsStart run={run} />,
  },
]

const NOTEBOOK_STATES = ["used", "new"] as const

export function BenchCreateBrowseEasel(props: { directory?: string }) {
  const [notebook, setNotebook] = useState<(typeof NOTEBOOK_STATES)[number]>("used")
  const books = useBooks(props.directory)
  const used = notebook === "used"
  const shelf = used ? (books.real.length > 0 ? books.real : books.padded) : []

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="flex shrink-0 flex-col gap-2 border-b border-border-weaker-base px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-text-strong">B, redone — start, books, get back.</p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-weaker">Notebook</span>
            <ToggleGroup
              type="single"
              size="sm"
              value={notebook}
              onValueChange={(value) => {
                const next = NOTEBOOK_STATES.find((candidate) => candidate === value)
                if (next) setNotebook(next)
              }}
              aria-label="Notebook state"
            >
              <ToggleGroupItem value="used">In use</ToggleGroupItem>
              <ToggleGroupItem value="new">Brand new</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
        <ul className="flex flex-col gap-0.5 text-xs leading-5 text-text-weak">
          <li>· <span className="text-text-base">Book row is back, exactly as shipped</span> — three latest covers, then Add resource. Books are not repeated in Recent.</li>
          <li>· <span className="text-text-base">Create is three things</span> — New note, New board, New tab. Add resource stays on the book row, where the book lands.</li>
          <li>· <span className="text-text-base">Browse tiles stay gone</span> — the right rail lists every library, and the bar opens any of them by name.</li>
        </ul>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-surface-inset-base p-6">
        <div className="mx-auto flex w-max gap-6">
          {VARIANTS.map((variant) => (
            <section key={variant.id} className="flex w-[480px] shrink-0 flex-col gap-3">
              <header className="flex flex-col gap-1 px-1">
                <div className="flex items-baseline gap-2">
                  <span className="rounded-md bg-surface-interactive-weak px-1.5 py-0.5 text-[11px] font-semibold text-text-interactive-base">
                    {variant.tag}
                  </span>
                  <h3 className="text-sm font-medium text-text-strong">{variant.name}</h3>
                </div>
                <p className="min-h-10 text-xs leading-5 text-text-weak">{variant.idea}</p>
              </header>
              <BenchFrame>
                {(run) => (
                  <>
                    {variant.start(run)}
                    <BookRow books={shelf} directory={props.directory} run={run} />
                    {used ? <RecentList run={run} /> : null}
                  </>
                )}
              </BenchFrame>
              <dl className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-2 gap-y-1 px-1 pt-1 text-xs leading-5">
                {variant.notes.map(([term, detail]) => (
                  <div key={term} className="contents">
                    <dt className="text-text-weaker">{term}</dt>
                    <dd className="text-text-weak">{detail}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
