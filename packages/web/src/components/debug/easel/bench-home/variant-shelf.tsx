import { useState, type KeyboardEvent } from "react"
import { cn } from "@buddy/ui"
import { Kbd } from "@buddy/ui/components/ui/kbd"
import { PlusIcon, SearchIcon } from "@/icons/app-icons"
import { BENCH_CHAT_ART, BENCH_NEW_NOTE_ART, BENCH_BOARD_ART, BENCH_RESOURCE_ART } from "@/components/bench/bench-action-art"
import {
  DEFAULT_PIN_IDS,
  KIND_ART,
  KIND_LABEL,
  READING,
  itemByID,
  primaryVerb,
  searchCommands,
  searchItems,
  type HomeItem,
} from "./mock"
import {
  ALT_LABEL,
  Cover,
  FOCUS_RING,
  ItemGlyph,
  KeyHints,
  MOD_LABEL,
  ProgressBar,
  useAutoFocus,
  useListNav,
  type RunAction,
} from "./shared"
import {
  SuggestionRow,
  openItem as openSharedItem,
  runSuggestion as runSharedSuggestion,
  suggestionKey,
  type Suggestion,
} from "./shelf-search"

// ---------------------------------------------------------------------------
// 02 · Bar over a shelf. Arc's new tab: the page you land on is a visual shelf —
// pinned tiles, the books you are reading as covers, and the last few things you
// touched. Typing drops a menu over the shelf with one Top hit you can act on
// directly, and every query ends in Ask Buddy or the web, so there is no dead end.
// ---------------------------------------------------------------------------

const QUICK_ACTIONS = [
  { label: "New note", art: BENCH_NEW_NOTE_ART, message: "A blank note opens in this tab" },
  { label: "New board", art: BENCH_BOARD_ART, message: "A blank board opens in this tab" },
  { label: "Ask Buddy", art: BENCH_CHAT_ART, message: "The chat composer beside the Bench takes focus" },
  { label: "Add book", art: BENCH_RESOURCE_ART, message: "File picker opens · the book lands on this shelf" },
] as const

const JUMP_BACK_IDS = ["p1", "c1", "w2"] as const

export function ShelfVariant(props: { run: RunAction }) {
  const [query, setQuery] = useState("")
  const [pins, setPins] = useState<string[]>([...DEFAULT_PIN_IDS, "c2"])
  const inputRef = useAutoFocus<HTMLInputElement>()
  const text = query.trim()

  const items = text ? searchItems(text) : []
  const topHit = items[0]
  const suggestions: Suggestion[] = text
    ? [
        ...items.slice(1, 5).map((item) => ({ type: "item" as const, item })),
        ...searchCommands(text).slice(0, 3).map((command) => ({ type: "command" as const, command })),
      ]
    : []
  const fallbacks: Suggestion[] = text ? [{ type: "ask", text }, { type: "web", text }] : []
  const flat: Suggestion[] = [...(topHit ? [{ type: "item" as const, item: topHit }] : []), ...suggestions, ...fallbacks]
  const nav = useListNav(flat.length, text)

  function openItem(item: HomeItem) {
    openSharedItem(props.run, item)
  }

  function runSuggestion(suggestion: Suggestion) {
    runSharedSuggestion(props.run, suggestion)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return
    if (event.key === "Escape") {
      event.preventDefault()
      setQuery("")
      return
    }
    if (!text) return
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      nav.move(event.key === "ArrowDown" ? 1 : -1)
    } else if (event.key === "Enter") {
      event.preventDefault()
      if (event.metaKey || event.ctrlKey) runSuggestion({ type: "ask", text })
      else if (event.shiftKey) runSuggestion({ type: "web", text })
      else if (flat[nav.active]) runSuggestion(flat[nav.active])
    }
  }

  const open = text.length > 0
  return (
    <div className="@container h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[640px] px-5 pt-10 pb-16">
        <div className="relative z-10">
          <div
            className={cn(
              "flex h-12 items-center gap-3 border border-border-base bg-surface-raised-base px-4 shadow-sm",
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
          </div>

          {open ? (
            <div
              ref={nav.listRef}
              className="absolute inset-x-0 top-full max-h-[480px] overflow-y-auto rounded-b-2xl border border-t-0 border-border-base bg-surface-raised-stronger-non-alpha p-2 shadow-xl"
            >
              {topHit ? (
                <TopHit
                  item={topHit}
                  active={nav.active === 0}
                  onHover={() => nav.select(0)}
                  onOpen={() => openItem(topHit)}
                  onAsk={() => props.run(`Chat asks Buddy about “${topHit.title}”`)}
                  onQuiz={() => props.run(`Buddy writes a quiz on “${topHit.title}”`)}
                />
              ) : null}
              {suggestions.length > 0 ? (
                <p className="px-2.5 pt-3 pb-1 text-[11px] font-medium text-text-weaker">Suggestions</p>
              ) : null}
              {suggestions.map((suggestion, position) => {
                const index = position + (topHit ? 1 : 0)
                return (
                  <SuggestionRow
                    key={suggestionKey(suggestion)}
                    suggestion={suggestion}
                    index={index}
                    active={nav.active === index}
                    onHover={() => nav.select(index)}
                    onRun={() => runSuggestion(suggestion)}
                  />
                )
              })}
              <div className="mx-2 my-2 border-t border-border-weaker-base" />
              {fallbacks.map((suggestion, position) => {
                const index = flat.length - fallbacks.length + position
                return (
                  <SuggestionRow
                    key={suggestion.type}
                    suggestion={suggestion}
                    index={index}
                    active={nav.active === index}
                    onHover={() => nav.select(index)}
                    onRun={() => runSuggestion(suggestion)}
                    hint={suggestion.type === "ask" ? `${MOD_LABEL}↵` : "⇧↵"}
                  />
                )
              })}
              <KeyHints
                className="px-2.5 pt-2 pb-1"
                hints={[
                  ["↵", "Open"],
                  [`${MOD_LABEL}↵`, "Ask Buddy"],
                  ["⇧↵", "Web"],
                  ["esc", "Back to shelf"],
                ]}
              />
            </div>
          ) : null}
        </div>

        <div className={cn("transition-opacity duration-150", open && "pointer-events-none opacity-25")}>
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.label}
                type="button"
                className={cn(
                  FOCUS_RING,
                  "flex h-8 items-center gap-1.5 rounded-full border border-border-weaker-base px-3 text-xs text-text-base hover:border-border-base hover:bg-surface-raised-base-hover",
                )}
                onClick={() => props.run(action.message)}
              >
                <img src={action.art} alt="" className="size-4 object-contain" aria-hidden />
                {action.label}
              </button>
            ))}
          </div>

          <ShelfHeading>Pinned</ShelfHeading>
          <div className="grid grid-cols-4 gap-x-2 gap-y-3 @[36rem]:grid-cols-7">
            {pins.map((id, slot) => {
              const item = itemByID(id)
              return (
                <button
                  key={id}
                  type="button"
                  title={slot < 5 ? `${item.title} · ${ALT_LABEL}${slot + 1}` : item.title}
                  className={cn(FOCUS_RING, "group flex min-w-0 flex-col items-center gap-1.5 rounded-xl p-1")}
                  onClick={() => openItem(item)}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    setPins((current) => current.filter((pin) => pin !== id))
                  }}
                >
                  <span className="flex size-14 items-center justify-center rounded-2xl bg-surface-raised-base group-hover:bg-surface-raised-base-hover">
                    <PinTileArt item={item} />
                  </span>
                  <span className="w-full truncate text-center text-[11px] text-text-weak">{item.title}</span>
                </button>
              )
            })}
            <button
              type="button"
              className={cn(FOCUS_RING, "group flex min-w-0 flex-col items-center gap-1.5 rounded-xl p-1")}
              onClick={() => props.run("Search opens in pin mode · anything you pick lands here")}
            >
              <span className="flex size-14 items-center justify-center rounded-2xl border border-dashed border-border-base text-icon-base group-hover:bg-surface-raised-base-hover">
                <PlusIcon className="size-4" aria-hidden />
              </span>
              <span className="text-[11px] text-text-weaker">Pin</span>
            </button>
          </div>

          <ShelfHeading>Continue reading</ShelfHeading>
          <div className="grid grid-cols-3 gap-4 @[36rem]:grid-cols-5">
            {READING.map((book) => (
              <button
                key={book.id}
                type="button"
                className={cn(FOCUS_RING, "group flex min-w-0 flex-col gap-1.5 rounded-md text-left")}
                onClick={() => openItem(book)}
              >
                <span className="relative block">
                  <Cover item={book} className="w-full transition-transform group-hover:-translate-y-0.5" />
                  <span className="absolute inset-x-1.5 bottom-1.5 hidden rounded-md bg-background-base/90 py-1 text-center text-[11px] text-text-strong group-hover:block">
                    {primaryVerb(book)}
                  </span>
                </span>
                <ProgressBar value={book.progress ?? 0} />
                <span className="truncate text-[11px] text-text-weak">{book.detail.split(" · ")[0]} · {Math.round((book.progress ?? 0) * 100)}%</span>
              </button>
            ))}
            <button
              type="button"
              className={cn(FOCUS_RING, "flex aspect-[2/3] flex-col items-center justify-center gap-1.5 rounded-[5px] border border-dashed border-border-base text-[11px] text-text-weaker hover:bg-surface-raised-base-hover")}
              onClick={() => props.run("File picker opens · the book lands on this shelf")}
            >
              <PlusIcon className="size-4" aria-hidden />
              Add book
            </button>
          </div>

          <ShelfHeading>Jump back in</ShelfHeading>
          <div className="grid grid-cols-1 gap-2 @[36rem]:grid-cols-3">
            {JUMP_BACK_IDS.map((id) => {
              const item = itemByID(id)
              return (
                <button
                  key={id}
                  type="button"
                  className={cn(FOCUS_RING, "flex min-w-0 items-center gap-3 rounded-xl border border-border-weaker-base p-3 text-left hover:border-border-base hover:bg-surface-raised-base-hover @[36rem]:flex-col @[36rem]:items-start")}
                  onClick={() => openItem(item)}
                >
                  <img src={KIND_ART[item.kind]} alt="" className="size-8 shrink-0 object-contain" aria-hidden />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm text-text-base">{item.title}</span>
                    <span className="truncate text-[11px] text-text-weaker">
                      {item.due ? `${item.due} cards due` : `${KIND_LABEL[item.kind]} · ${item.when}`}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
          <p className="mt-6 text-center text-[11px] text-text-weaker">Right-click a pin to remove it</p>
        </div>
      </div>
    </div>
  )
}

function ShelfHeading(props: { children: string }) {
  return <p className="mt-7 mb-2.5 px-1 text-[11px] font-medium text-text-weaker">{props.children}</p>
}

function PinTileArt(props: { item: HomeItem }) {
  if (props.item.kind === "book") return <Cover item={props.item} compact className="h-10" />
  if (props.item.kind === "page") {
    return (
      <span className="flex size-8 items-center justify-center rounded-lg bg-surface-raised-stronger-non-alpha text-sm font-semibold text-text-base">
        {(props.item.host ?? props.item.title).charAt(0).toUpperCase()}
      </span>
    )
  }
  return <img src={KIND_ART[props.item.kind]} alt="" className="size-9 object-contain" aria-hidden />
}

function TopHit(props: {
  item: HomeItem
  active: boolean
  onHover: () => void
  onOpen: () => void
  onAsk: () => void
  onQuiz: () => void
}) {
  const item = props.item
  const canQuiz = item.kind === "book" || item.kind === "note"
  return (
    <div
      data-nav-index={0}
      className={cn("flex items-center gap-3 rounded-xl p-2.5", props.active && "bg-surface-raised-base")}
      onMouseMove={props.onHover}
    >
      {item.kind === "book" ? (
        <Cover item={item} compact className="h-14" />
      ) : (
        <ItemGlyph item={item} size="md" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[11px] font-medium text-text-weaker">Top hit</span>
        <span className="truncate text-sm font-medium text-text-strong">{item.title}</span>
        <span className="truncate text-xs text-text-weak">
          {KIND_LABEL[item.kind]} · {item.kind === "book" ? item.detail : item.when}
        </span>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5 @[36rem]:flex-row @[36rem]:items-center">
        <button
          type="button"
          tabIndex={-1}
          className="flex h-7 items-center gap-1.5 rounded-lg bg-surface-interactive-base px-2.5 text-xs text-text-on-interactive-base"
          onMouseDown={(event) => event.preventDefault()}
          onClick={props.onOpen}
        >
          {primaryVerb(item)}
          {props.active ? <Kbd className="bg-transparent text-current">↵</Kbd> : null}
        </button>
        <div className="flex gap-1">
          <button
            type="button"
            tabIndex={-1}
            className="h-7 rounded-lg px-2 text-xs text-text-weak hover:bg-surface-raised-base-hover hover:text-text-base"
            onMouseDown={(event) => event.preventDefault()}
            onClick={props.onAsk}
          >
            Ask
          </button>
          {canQuiz ? (
            <button
              type="button"
              tabIndex={-1}
              className="h-7 rounded-lg px-2 text-xs text-text-weak hover:bg-surface-raised-base-hover hover:text-text-base"
              onMouseDown={(event) => event.preventDefault()}
              onClick={props.onQuiz}
            >
              Quiz me
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
