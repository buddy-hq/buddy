import { Fragment, useState, type KeyboardEvent } from "react"
import { cn } from "@buddy/ui"
import { SearchIcon } from "@/icons/app-icons"
import { itemByID, primaryVerb } from "./mock"
import { Cover, FOCUS_RING, ItemGlyph, ItemMeta, ProgressBar, useAutoFocus, useListNav, type RunAction } from "./shared"
import { SuggestionList, openItem, runSuggestion, suggestionsFor } from "./shelf-search"

// ---------------------------------------------------------------------------
// 02c · Continue. The shelf shrinks to one decision: the thing you were doing,
// as a single large card with its next step, plus three quiet rows of what is
// waiting. Creating is a line of text links. There is no overlay — typing
// replaces the page with results in place, and Esc brings the page back.
// ---------------------------------------------------------------------------

const HERO_ID = "b1"
const UP_NEXT_IDS = ["p1", "n1", "c1"] as const

const CREATE_LINKS = [
  { label: "New note", message: "A blank note opens in this tab" },
  { label: "New board", message: "A blank board opens in this tab" },
  { label: "Browser", message: "A blank browser tab opens" },
  { label: "Add book", message: "File picker opens · the book opens here" },
] as const

export function ShelfContinueVariant(props: { run: RunAction }) {
  const [query, setQuery] = useState("")
  const inputRef = useAutoFocus<HTMLInputElement>()
  const { matches, fallbacks } = suggestionsFor(query, { items: 7, commands: 3 })
  const all = [...matches, ...fallbacks]
  const nav = useListNav(all.length, query.trim())
  const searching = all.length > 0
  const hero = itemByID(HERO_ID)

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return
    if (event.key === "Escape") {
      event.preventDefault()
      setQuery("")
    } else if (searching && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault()
      nav.move(event.key === "ArrowDown" ? 1 : -1)
    } else if (searching && event.key === "Enter") {
      event.preventDefault()
      const suggestion = all[nav.active]
      if (suggestion) runSuggestion(props.run, suggestion)
    }
  }

  return (
    <div className="@container h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[560px] px-5 pt-12 pb-16">
        <div className="flex h-12 items-center gap-3 rounded-2xl border border-border-base bg-surface-raised-base px-4 focus-within:border-border-interactive-base">
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

        {searching ? (
          <div ref={nav.listRef} className="mt-3">
            <SuggestionList
              matches={matches}
              fallbacks={fallbacks}
              active={nav.active}
              onSelect={nav.select}
              onRun={(suggestion) => runSuggestion(props.run, suggestion)}
            />
          </div>
        ) : (
          <>
            <div className="mt-8 flex gap-5 rounded-2xl bg-surface-raised-base p-4">
              <button
                type="button"
                aria-label={`Open ${hero.title}`}
                className={cn(FOCUS_RING, "w-20 shrink-0 rounded-md @[36rem]:w-24")}
                onClick={() => openItem(props.run, hero)}
              >
                <Cover item={hero} className="w-full" />
              </button>
              <div className="flex min-w-0 flex-1 flex-col justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-[11px] font-medium text-text-weaker">Continue reading</span>
                  <span className="truncate text-base font-medium text-text-strong">{hero.title}</span>
                  <span className="truncate text-xs text-text-weak">{hero.detail}</span>
                  <span className="mt-1.5 flex items-center gap-2 text-[11px] text-text-weaker">
                    <ProgressBar value={hero.progress ?? 0} className="max-w-40 flex-1" />
                    {Math.round((hero.progress ?? 0) * 100)}%
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    className={cn(FOCUS_RING, "h-8 rounded-lg bg-surface-interactive-base px-3 text-xs text-text-on-interactive-base hover:opacity-90")}
                    onClick={() => openItem(props.run, hero)}
                  >
                    {primaryVerb(hero)}
                  </button>
                  <button
                    type="button"
                    className={cn(FOCUS_RING, "h-8 rounded-lg px-3 text-xs text-text-weak hover:bg-surface-raised-base-hover hover:text-text-base")}
                    onClick={() => props.run("Buddy writes a quiz on Ch. 4 · opens in Practice")}
                  >
                    Quiz me on Ch. 4
                  </button>
                </div>
              </div>
            </div>

            <p className="mt-7 mb-1.5 px-2.5 text-[11px] font-medium text-text-weaker">Up next</p>
            <div className="flex flex-col gap-0.5">
              {UP_NEXT_IDS.map((id) => {
                const item = itemByID(id)
                return (
                  <button
                    key={id}
                    type="button"
                    className={cn(FOCUS_RING, "flex h-10 min-w-0 items-center gap-2.5 rounded-xl px-2.5 text-left text-sm text-text-base hover:bg-surface-raised-base-hover")}
                    onClick={() => openItem(props.run, item)}
                  >
                    <ItemGlyph item={item} />
                    <span className="min-w-0 flex-1 truncate">{item.title}</span>
                    <ItemMeta item={item} />
                  </button>
                )
              })}
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-1 text-xs text-text-weaker">
              {CREATE_LINKS.map((link, index) => (
                <Fragment key={link.label}>
                  {index > 0 ? <span aria-hidden>·</span> : null}
                  <button
                    type="button"
                    className={cn(FOCUS_RING, "rounded px-1.5 py-1 hover:text-text-base")}
                    onClick={() => props.run(link.message)}
                  >
                    {link.label}
                  </button>
                </Fragment>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
