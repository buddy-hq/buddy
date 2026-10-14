import { useState, type KeyboardEvent } from "react"
import { cn } from "@buddy/ui"
import { PlusIcon, SearchIcon } from "@/icons/app-icons"
import { BENCH_BOARD_ART, BENCH_BROWSER_ART, BENCH_NEW_NOTE_ART } from "@/components/bench/bench-action-art"
import { READING, primaryVerb } from "./mock"
import { Cover, FOCUS_RING, ProgressBar, useAutoFocus, useListNav, type RunAction } from "./shared"
import { SuggestionList, openItem, runSuggestion, suggestionsFor } from "./shelf-search"

// ---------------------------------------------------------------------------
// 02a · Covers. The shelf is only the books you are reading. Creating moves into
// the bar as three quiet icons; pins, chips and recents are gone — search finds
// everything else. Typing drops a plain list over the covers.
// ---------------------------------------------------------------------------

const BAR_ACTIONS = [
  { label: "New note", art: BENCH_NEW_NOTE_ART, message: "A blank note opens in this tab" },
  { label: "New board", art: BENCH_BOARD_ART, message: "A blank board opens in this tab" },
  { label: "Browser", art: BENCH_BROWSER_ART, message: "A blank browser tab opens" },
] as const

export function ShelfCoversVariant(props: { run: RunAction }) {
  const [query, setQuery] = useState("")
  const inputRef = useAutoFocus<HTMLInputElement>()
  const { matches, fallbacks } = suggestionsFor(query)
  const all = [...matches, ...fallbacks]
  const nav = useListNav(all.length, query.trim())
  const open = all.length > 0

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return
    if (event.key === "Escape") {
      event.preventDefault()
      setQuery("")
    } else if (open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault()
      nav.move(event.key === "ArrowDown" ? 1 : -1)
    } else if (open && event.key === "Enter") {
      event.preventDefault()
      const suggestion = all[nav.active]
      if (suggestion) runSuggestion(props.run, suggestion)
    }
  }

  return (
    <div className="@container h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[600px] px-5 pt-12 pb-16">
        <div className="relative z-10">
          <div
            className={cn(
              "flex h-12 items-center gap-3 border border-border-base bg-surface-raised-base pr-2 pl-4",
              open ? "rounded-t-2xl border-b-border-weaker-base" : "rounded-2xl focus-within:border-border-interactive-base",
            )}
          >
            <SearchIcon className="size-4 shrink-0 text-icon-base" aria-hidden />
            <input
              ref={inputRef}
              type="text"
              aria-label="Search, ask Buddy, or type a URL"
              placeholder="Search, ask Buddy, or type a URL"
              value={query}
              className="min-w-0 flex-1 bg-transparent text-[15px] text-text-strong outline-none placeholder:text-text-weaker"
              onChange={(event) => setQuery(event.currentTarget.value)}
              onKeyDown={onKeyDown}
            />
            {open ? null : (
              <div className="flex shrink-0 items-center gap-0.5 border-l border-border-weaker-base pl-2">
                {BAR_ACTIONS.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    title={action.label}
                    aria-label={action.label}
                    className={cn(FOCUS_RING, "flex size-8 items-center justify-center rounded-lg hover:bg-surface-raised-base-hover")}
                    onClick={() => props.run(action.message)}
                  >
                    <img src={action.art} alt="" className="size-5 object-contain" aria-hidden />
                  </button>
                ))}
              </div>
            )}
          </div>
          {open ? (
            <div
              ref={nav.listRef}
              className="absolute inset-x-0 top-full max-h-[440px] overflow-y-auto rounded-b-2xl border border-t-0 border-border-base bg-surface-raised-stronger-non-alpha p-1.5 shadow-xl"
            >
              <SuggestionList
                matches={matches}
                fallbacks={fallbacks}
                active={nav.active}
                onSelect={nav.select}
                onRun={(suggestion) => runSuggestion(props.run, suggestion)}
              />
            </div>
          ) : null}
        </div>

        <div className={cn("mt-10 transition-opacity duration-150", open && "opacity-25")}>
          <p className="mb-3 px-0.5 text-[11px] font-medium text-text-weaker">Reading</p>
          <div className="grid grid-cols-3 gap-5 @[36rem]:grid-cols-4">
            {READING.map((book) => (
              <button
                key={book.id}
                type="button"
                className={cn(FOCUS_RING, "group flex min-w-0 flex-col gap-2 rounded-md text-left")}
                onClick={() => openItem(props.run, book)}
              >
                <Cover item={book} className="w-full transition-transform group-hover:-translate-y-1" />
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="truncate text-xs text-text-base">{book.title}</span>
                  <ProgressBar value={book.progress ?? 0} />
                  <span className="truncate text-[11px] text-text-weaker group-hover:text-text-base">
                    {primaryVerb(book)}
                  </span>
                </span>
              </button>
            ))}
            <button
              type="button"
              className={cn(FOCUS_RING, "flex aspect-[2/3] flex-col items-center justify-center gap-1.5 rounded-[5px] border border-dashed border-border-base text-[11px] text-text-weaker hover:bg-surface-raised-base-hover hover:text-text-base")}
              onClick={() => props.run("File picker opens · the book joins this shelf")}
            >
              <PlusIcon className="size-4" aria-hidden />
              Add book
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
