import { cn } from "@buddy/ui"
import { Kbd } from "@buddy/ui/components/ui/kbd"
import { BENCH_CHAT_ART } from "@/components/bench/bench-action-art"
import {
  KIND_LABEL,
  looksLikeUrl,
  primaryVerb,
  searchCommands,
  searchItems,
  type HomeCommand,
  type HomeItem,
} from "./mock"
import { ArtGlyph, ItemGlyph, ItemMeta, WebGlyph, type RunAction } from "./shared"

// ---------------------------------------------------------------------------
// The search half every shelf direction shares: what a query suggests, what
// picking a suggestion does, and how a suggestion row looks.
// ---------------------------------------------------------------------------

export type Suggestion =
  | { type: "item"; item: HomeItem }
  | { type: "command"; command: HomeCommand }
  | { type: "ask"; text: string }
  | { type: "web"; text: string }

/** Matches first (items, then commands), then Ask Buddy and the web so no query dead-ends. */
export function suggestionsFor(query: string, limits?: { items?: number; commands?: number }) {
  const text = query.trim()
  if (!text) return { matches: [], fallbacks: [] }
  const matches: Suggestion[] = [
    ...searchItems(text).slice(0, limits?.items ?? 5).map((item) => ({ type: "item" as const, item })),
    ...searchCommands(text).slice(0, limits?.commands ?? 3).map((command) => ({ type: "command" as const, command })),
  ]
  const fallbacks: Suggestion[] = [{ type: "ask", text }, { type: "web", text }]
  return { matches, fallbacks }
}

export function suggestionKey(suggestion: Suggestion): string {
  switch (suggestion.type) {
    case "item":
      return `item:${suggestion.item.id}`
    case "command":
      return `command:${suggestion.command.id}`
    case "ask":
    case "web":
      return suggestion.type
  }
}

export function openItem(run: RunAction, item: HomeItem) {
  run(`${primaryVerb(item)} — “${item.title}” opens in this tab`)
}

export function runSuggestion(run: RunAction, suggestion: Suggestion) {
  switch (suggestion.type) {
    case "item":
      openItem(run, suggestion.item)
      return
    case "command":
      run(`${suggestion.command.title.replace("…", "")} — ${suggestion.command.description.toLowerCase()}`)
      return
    case "ask":
      run(`Chat beside the Bench asks Buddy: “${suggestion.text}”`)
      return
    case "web":
      run(looksLikeUrl(suggestion.text) ? `Browser tab opens ${suggestion.text}` : `Browser tab searches the web for “${suggestion.text}”`)
      return
  }
}

function suggestionTitle(suggestion: Suggestion): string {
  switch (suggestion.type) {
    case "item":
      return suggestion.item.title
    case "command":
      return suggestion.command.title
    case "ask":
      return `Ask Buddy “${suggestion.text}”`
    case "web":
      return looksLikeUrl(suggestion.text) ? `Open ${suggestion.text}` : `Search the web for “${suggestion.text}”`
  }
}

function suggestionDetail(suggestion: Suggestion): string {
  switch (suggestion.type) {
    case "item":
      return suggestion.item.kind === "book" ? suggestion.item.detail : KIND_LABEL[suggestion.item.kind]
    case "command":
      return suggestion.command.description
    case "ask":
      return "in the chat"
    case "web":
      return "in a browser tab"
  }
}

/** One row; `lead` makes it the taller first row that Enter opens. */
export function SuggestionRow(props: {
  suggestion: Suggestion
  index: number
  active: boolean
  lead?: boolean
  hint?: string
  onHover: () => void
  onRun: () => void
}) {
  const suggestion = props.suggestion
  return (
    <button
      type="button"
      tabIndex={-1}
      data-nav-index={props.index}
      className={cn(
        "flex w-full min-w-0 items-center gap-2.5 rounded-xl px-2.5 text-left text-sm text-text-base",
        props.lead ? "py-2" : "h-10",
        props.active && "bg-surface-raised-base",
      )}
      onMouseMove={props.onHover}
      onMouseDown={(event) => event.preventDefault()}
      onClick={props.onRun}
    >
      {suggestion.type === "item" ? (
        <ItemGlyph item={suggestion.item} size={props.lead ? "md" : "sm"} />
      ) : suggestion.type === "command" ? (
        <ArtGlyph src={suggestion.command.art} />
      ) : suggestion.type === "ask" ? (
        <ArtGlyph src={BENCH_CHAT_ART} />
      ) : (
        <WebGlyph />
      )}
      {props.lead ? (
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium text-text-strong">{suggestionTitle(suggestion)}</span>
          <span className="truncate text-xs text-text-weaker">{suggestionDetail(suggestion)}</span>
        </span>
      ) : (
        <span className="min-w-0 flex-1 truncate">
          {suggestionTitle(suggestion)}
          <span className="ml-2 text-xs text-text-weaker">{suggestionDetail(suggestion)}</span>
        </span>
      )}
      {suggestion.type === "item" && !props.active ? <ItemMeta item={suggestion.item} /> : null}
      {props.active ? <Kbd>{props.hint ?? "↵"}</Kbd> : null}
    </button>
  )
}

/** Matches, a hairline, then the two fallbacks — rendered in whatever container the direction uses. */
export function SuggestionList(props: {
  matches: readonly Suggestion[]
  fallbacks: readonly Suggestion[]
  active: number
  onSelect: (index: number) => void
  onRun: (suggestion: Suggestion) => void
}) {
  return (
    <>
      {props.matches.map((suggestion, index) => (
        <SuggestionRow
          key={suggestionKey(suggestion)}
          suggestion={suggestion}
          index={index}
          lead={index === 0}
          active={props.active === index}
          onHover={() => props.onSelect(index)}
          onRun={() => props.onRun(suggestion)}
        />
      ))}
      {props.matches.length > 0 ? <div className="mx-2.5 my-1.5 border-t border-border-weaker-base" /> : null}
      {props.fallbacks.map((suggestion, position) => {
        const index = props.matches.length + position
        return (
          <SuggestionRow
            key={suggestionKey(suggestion)}
            suggestion={suggestion}
            index={index}
            active={props.active === index}
            onHover={() => props.onSelect(index)}
            onRun={() => props.onRun(suggestion)}
          />
        )
      })}
    </>
  )
}
