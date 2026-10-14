import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { ArrowUpIcon, ChevronDownIcon, PlusIcon, cn } from "@buddy/ui"
import { SearchIcon } from "@/icons/app-icons"
import { ProviderIcon } from "@/components/provider-icon"
import "@/components/prompt/composer-surfaces.css"
import {
  DEFAULT_MODEL_KEY,
  MODEL_BY_KEY,
  isAmbiguousName,
  queryTokens,
  type ModelEntry,
} from "./catalog"

export function useModelChoice() {
  const [key, setKey] = useState(DEFAULT_MODEL_KEY)
  const [open, setOpen] = useState(true)
  const model = MODEL_BY_KEY.get(key) ?? MODEL_BY_KEY.get(DEFAULT_MODEL_KEY)!
  return { model, open, setOpen, pick: setKey }
}

/** Option on macOS, Alt on Windows — the modifier the shortcut prototypes pair with a key. */
export const ALT_LABEL = /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌥" : "Alt+"

/** `KeyT` → "T", `Digit1` → "1"; layout-independent, so ⌥1 on macOS doesn't arrive as "¡". */
export function keyFromCode(code: string) {
  if (code.startsWith("Key")) return code.slice(3)
  if (code.startsWith("Digit")) return code.slice(5)
  return undefined
}

/** Arrow keys move, Enter picks, and the active row scrolls into view inside `listRef`. */
export function useListKeyboard(input: {
  count: number
  resetKey: unknown
  onPick: (index: number) => void
}) {
  const [activeIndex, setActiveIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => setActiveIndex(0), [input.resetKey])
  const move = useCallback((next: number) => {
    setActiveIndex(next)
    listRef.current
      ?.querySelector(`[data-nav-index="${next}"]`)
      ?.scrollIntoView({ block: "nearest" })
  }, [])
  const onKeyDown = (event: KeyboardEvent) => {
    if (input.count === 0) return
    if (event.key === "ArrowDown") {
      event.preventDefault()
      move((activeIndex + 1) % input.count)
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      move((activeIndex - 1 + input.count) % input.count)
    } else if (event.key === "Enter") {
      event.preventDefault()
      input.onPick(Math.min(activeIndex, input.count - 1))
    }
  }
  return { activeIndex, setActiveIndex, onKeyDown, listRef }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export function Highlight(props: { text: string; query: string }) {
  const tokens = queryTokens(props.query)
  if (tokens.length === 0) return <>{props.text}</>
  const pattern = new RegExp(`(${tokens.map(escapeRegExp).join("|")})`, "gi")
  // Keyed by character offset; a segment that equals a token is a match, because split never
  // leaves a token inside a plain segment.
  let offset = 0
  return (
    <>
      {props.text
        .split(pattern)
        .filter(Boolean)
        .map((part) => {
          const start = offset
          offset += part.length
          return tokens.includes(part.toLowerCase()) ? (
            <mark key={start} className="bg-transparent font-semibold text-text-interactive-base">
              {part}
            </mark>
          ) : (
            <span key={start}>{part}</span>
          )
        })}
    </>
  )
}

export function ProviderMark(props: { id: string; className?: string }) {
  return (
    <ProviderIcon
      id={props.id}
      className={cn("size-4 shrink-0", props.className)}
      aria-hidden="true"
    />
  )
}

export function Kbd(props: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-border-weaker-base px-1 font-sans text-[10px] text-text-weak">
      {props.children}
    </kbd>
  )
}

export function SearchField(props: {
  value: string
  onChange: (value: string) => void
  onKeyDown?: (event: KeyboardEvent) => void
  placeholder: string
  className?: string
}) {
  return (
    <label
      className={cn(
        "flex h-9 items-center gap-2 border-b border-border-weaker-base px-3",
        props.className,
      )}
    >
      <SearchIcon className="size-3.5 shrink-0 text-text-weaker" />
      <input
        autoFocus
        value={props.value}
        onChange={(event) => props.onChange(event.currentTarget.value)}
        onKeyDown={props.onKeyDown}
        placeholder={props.placeholder}
        className="min-w-0 flex-1 bg-transparent text-[13px] text-text-strong outline-none placeholder:text-text-weaker"
      />
    </label>
  )
}

export function MenuSurface(props: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "composer-surface-menu composer-grain relative flex flex-col overflow-hidden",
        props.className,
      )}
    >
      {props.children}
    </div>
  )
}

/** Toolbar trigger: provider mark + name, and the provider spelled out when the name is shared. */
export function ModelTrigger(props: { model: ModelEntry; open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-expanded={props.open}
      onClick={props.onClick}
      className={cn(
        "inline-flex h-7 max-w-[260px] min-w-0 items-center gap-1.5 rounded-md px-2 text-xs text-text-weaker transition-colors hover:bg-surface-raised-base-hover hover:text-text-base",
        props.open && "bg-surface-raised-base-hover text-text-base",
      )}
    >
      <ProviderMark id={props.model.providerID} className="size-3.5" />
      <span className="truncate">{props.model.name}</span>
      {isAmbiguousName(props.model) ? (
        <span className="shrink-0 text-text-weaker">· {props.model.providerName}</span>
      ) : null}
      <ChevronDownIcon className="size-3 shrink-0" />
    </button>
  )
}

/** A resting composer with the menu opening above it, drawn in flow so every variant stays visible. */
export function MockComposer(props: {
  open: boolean
  panel: ReactNode
  trigger: ReactNode
  prompt?: ReactNode
}) {
  return (
    <div className="flex flex-col items-start gap-2">
      {props.open ? props.panel : null}
      <div className="composer-surface composer-grain relative w-[34rem] max-w-full">
        {props.prompt ?? (
          <div className="px-4 pt-3 pb-1 text-sm text-text-weaker">Ask Buddy anything…</div>
        )}
        <div className="flex items-center justify-between gap-2 px-2 py-2">
          <div className="flex min-w-0 items-center gap-1">
            <span className="inline-flex size-7 items-center justify-center rounded-full text-text-weaker">
              <PlusIcon className="size-3.5" />
            </span>
            {props.trigger}
          </div>
          <span className="inline-flex size-7 items-center justify-center rounded-full bg-surface-interactive-base text-text-on-interactive-base">
            <ArrowUpIcon className="size-4" />
          </span>
        </div>
      </div>
    </div>
  )
}

export function VariantSection(props: {
  number: string
  title: string
  concept: string
  identify: string
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-4 border-t border-border-weaker-base pt-8">
      <header className="flex max-w-3xl flex-col gap-1">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-semibold tabular-nums text-text-weaker">
            {props.number}
          </span>
          <h2 className="text-sm font-semibold text-text-strong">{props.title}</h2>
        </div>
        <p className="text-xs text-text-weak">{props.concept}</p>
        <p className="text-xs text-text-weaker">Telling models apart: {props.identify}</p>
      </header>
      {props.children}
    </section>
  )
}
