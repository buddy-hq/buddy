import { useState, type KeyboardEvent, type ReactNode } from "react"
import { cn } from "@buddy/ui"
import { PlusIcon, SearchIcon } from "@/icons/app-icons"
import {
  BENCH_BOARD_ART,
  BENCH_BROWSER_ART,
  BENCH_NEW_NOTE_ART,
  BENCH_RESOURCE_ART,
} from "@/components/bench/bench-action-art"
import { DEFAULT_PIN_IDS, KIND_ART, RECENTS, itemByID, type HomeItem } from "./mock"
import { Cover, FOCUS_RING, useAutoFocus, useListNav, type RunAction } from "./shared"
import {
  SuggestionList,
  SuggestionRow,
  openItem,
  runSuggestion,
  suggestionKey,
  suggestionsFor,
  type Suggestion,
} from "./shelf-search"

// ---------------------------------------------------------------------------
// 02b · Dock. Safari's favourites: one grid of tiles under the bar and nothing
// else. Making something and opening something look the same — a tile — and
// the make tiles carry a small plus. Recents are not on the page at all; they
// appear in the bar's menu when you click into it or press ↓, like an omnibox.
// ---------------------------------------------------------------------------

const MAKE_TILES = [
  { id: "make-note", label: "Note", art: BENCH_NEW_NOTE_ART, message: "A blank note opens in this tab" },
  { id: "make-board", label: "Board", art: BENCH_BOARD_ART, message: "A blank board opens in this tab" },
  { id: "make-tab", label: "Browser", art: BENCH_BROWSER_ART, message: "A blank browser tab opens" },
  { id: "make-book", label: "Add book", art: BENCH_RESOURCE_ART, message: "File picker opens · the book opens here" },
] as const

const RECENT_SUGGESTIONS: readonly Suggestion[] = RECENTS.slice(0, 5).map((item) => ({ type: "item", item }))

export function ShelfDockVariant(props: { run: RunAction }) {
  const [query, setQuery] = useState("")
  const [recentsOpen, setRecentsOpen] = useState(false)
  const [pins, setPins] = useState<string[]>([...DEFAULT_PIN_IDS])
  const inputRef = useAutoFocus<HTMLInputElement>()
  const text = query.trim()
  const { matches, fallbacks } = suggestionsFor(query)
  const showingRecents = !text && recentsOpen
  const list: readonly Suggestion[] = showingRecents ? RECENT_SUGGESTIONS : [...matches, ...fallbacks]
  const nav = useListNav(list.length, `${text}|${showingRecents}`)
  const open = list.length > 0

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return
    if (event.key === "Escape") {
      event.preventDefault()
      setQuery("")
      setRecentsOpen(false)
    } else if (event.key === "ArrowDown" && !open) {
      event.preventDefault()
      setRecentsOpen(true)
    } else if (open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault()
      nav.move(event.key === "ArrowDown" ? 1 : -1)
    } else if (open && event.key === "Enter") {
      event.preventDefault()
      const suggestion = list[nav.active]
      if (suggestion) runSuggestion(props.run, suggestion)
    }
  }

  return (
    <div className="@container flex h-full flex-col items-center justify-center overflow-y-auto px-5 pb-28">
      <div className="w-full max-w-[600px]">
        <div className="relative z-10">
          <div
            className={cn(
              "flex h-12 items-center gap-3 border border-border-base bg-surface-raised-base px-4",
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
              onMouseDown={() => setRecentsOpen(true)}
              onBlur={() => setRecentsOpen(false)}
              onKeyDown={onKeyDown}
            />
          </div>
          {open ? (
            <div
              ref={nav.listRef}
              className="absolute inset-x-0 top-full max-h-[420px] overflow-y-auto rounded-b-2xl border border-t-0 border-border-base bg-surface-raised-stronger-non-alpha p-1.5 shadow-xl"
            >
              {showingRecents ? (
                <>
                  <p className="px-2.5 pt-1.5 pb-1 text-[11px] font-medium text-text-weaker">Recent</p>
                  {RECENT_SUGGESTIONS.map((suggestion, index) => (
                    <SuggestionRow
                      key={suggestionKey(suggestion)}
                      suggestion={suggestion}
                      index={index}
                      active={nav.active === index}
                      onHover={() => nav.select(index)}
                      onRun={() => runSuggestion(props.run, suggestion)}
                    />
                  ))}
                </>
              ) : (
                <SuggestionList
                  matches={matches}
                  fallbacks={fallbacks}
                  active={nav.active}
                  onSelect={nav.select}
                  onRun={(suggestion) => runSuggestion(props.run, suggestion)}
                />
              )}
            </div>
          ) : null}
        </div>

        <div className={cn("mt-8 grid grid-cols-5 gap-x-1 gap-y-4 transition-opacity duration-150 @[36rem]:grid-cols-9", open && "opacity-25")}>
          {MAKE_TILES.map((tile) => (
            <Tile
              key={tile.id}
              label={tile.label}
              badge={<PlusIcon className="size-2.5" aria-hidden />}
              onClick={() => props.run(tile.message)}
            >
              <img src={tile.art} alt="" className="size-8 object-contain" aria-hidden />
            </Tile>
          ))}
          {pins.map((id) => {
            const item = itemByID(id)
            return (
              <Tile
                key={id}
                label={item.title}
                badge={item.due ? <span className="px-0.5 text-[9px] font-semibold">{item.due}</span> : undefined}
                onClick={() => openItem(props.run, item)}
                onRemove={() => setPins((current) => current.filter((pin) => pin !== id))}
              >
                <PinArt item={item} />
              </Tile>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Tile(props: {
  label: string
  badge?: ReactNode
  children: ReactNode
  onClick: () => void
  onRemove?: () => void
}) {
  return (
    <button
      type="button"
      title={props.onRemove ? `${props.label} · right-click to unpin` : props.label}
      className={cn(FOCUS_RING, "group flex min-w-0 flex-col items-center gap-1.5 rounded-xl p-1")}
      onClick={props.onClick}
      onContextMenu={(event) => {
        if (!props.onRemove) return
        event.preventDefault()
        props.onRemove()
      }}
    >
      <span className="relative flex size-14 items-center justify-center rounded-2xl bg-surface-raised-base transition-colors group-hover:bg-surface-raised-base-hover">
        {props.children}
        {props.badge ? (
          <span className="absolute -right-1 -bottom-1 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-background-base bg-surface-raised-stronger-non-alpha text-text-strong">
            {props.badge}
          </span>
        ) : null}
      </span>
      <span className="w-full truncate text-center text-[11px] text-text-weak">{props.label}</span>
    </button>
  )
}

function PinArt(props: { item: HomeItem }) {
  if (props.item.kind === "book") return <Cover item={props.item} compact className="h-10" />
  if (props.item.kind === "page") {
    return (
      <span className="flex size-8 items-center justify-center rounded-lg bg-surface-raised-stronger-non-alpha text-sm font-semibold text-text-base">
        {(props.item.host ?? props.item.title).charAt(0).toUpperCase()}
      </span>
    )
  }
  return <img src={KIND_ART[props.item.kind]} alt="" className="size-8 object-contain" aria-hidden />
}
