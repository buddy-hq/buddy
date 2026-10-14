import { useEffect, useRef, useState, type ReactNode } from "react"
import { cn } from "@buddy/ui"
import { Kbd } from "@buddy/ui/components/ui/kbd"
import { PlusIcon, XIcon } from "@/icons/app-icons"
import { BENCH_BROWSER_ART } from "@/components/bench/bench-action-art"
import { FileTypeIcon } from "@/components/files/file-type-icon"
import { COVER_TONES, KIND_ART, type HomeItem } from "./mock"

export type FrameWidth = "narrow" | "wide"

/** What a click or Enter would do in the real Bench; the frame shows it instead of doing it. */
export type RunAction = (message: string) => void

export const FRAME_WIDTH_PX = { narrow: 480, wide: 820 } as const satisfies Record<FrameWidth, number>

export const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-interactive-base"

const IS_MAC = /Mac|iPhone|iPad/u.test(navigator.userAgent)
export const ALT_LABEL = IS_MAC ? "⌥" : "Alt+"
export const MOD_LABEL = IS_MAC ? "⌘" : "Ctrl+"

// ---------------------------------------------------------------------------
// Bench frame — a single empty tab, as the right workspace shows it today
// ---------------------------------------------------------------------------

export function BenchFrame(props: {
  width: FrameWidth
  lastRun?: { id: number; message: string }
  children: ReactNode
}) {
  const [visibleRun, setVisibleRun] = useState(props.lastRun)
  useEffect(() => {
    setVisibleRun(props.lastRun)
    if (!props.lastRun) return
    const timeout = window.setTimeout(() => setVisibleRun(undefined), 2400)
    return () => window.clearTimeout(timeout)
  }, [props.lastRun])

  return (
    <div
      className="relative flex h-[660px] max-w-full shrink-0 flex-col overflow-hidden rounded-xl border border-border-base bg-background-base shadow-lg"
      style={{ width: `${FRAME_WIDTH_PX[props.width]}px` }}
    >
      <div className="flex h-9 shrink-0 items-end gap-1 border-b border-border-weaker-base bg-surface-inset-base px-2">
        <div className="flex h-8 items-center gap-2 rounded-t-lg border border-b-0 border-border-weaker-base bg-background-base px-3 text-xs text-text-base">
          <span>New tab</span>
          <XIcon className="size-3 text-icon-base" aria-hidden />
        </div>
        <span className="mb-1.5 flex size-6 items-center justify-center text-icon-base">
          <PlusIcon className="size-3.5" aria-hidden />
        </span>
      </div>
      <div className="relative min-h-0 flex-1">{props.children}</div>
      {visibleRun ? (
        <div
          key={visibleRun.id}
          role="status"
          className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4"
        >
          <span className="max-w-full truncate rounded-full border border-border-base bg-surface-raised-stronger-non-alpha px-3 py-1.5 text-xs text-text-strong shadow-md">
            {visibleRun.message}
          </span>
        </div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Visual atoms
// ---------------------------------------------------------------------------

export function Cover(props: { item: HomeItem; className?: string; compact?: boolean }) {
  const tone = COVER_TONES[props.item.cover ?? "clay"]
  return (
    <div
      className={cn(
        "relative flex aspect-[2/3] flex-col justify-between overflow-hidden rounded-[5px] shadow-sm",
        props.compact ? "p-[3px]" : "p-2",
        tone,
        props.className,
      )}
    >
      <span className="absolute inset-y-0 left-0 w-[3px] bg-black/15" aria-hidden />
      {props.compact ? null : (
        <>
          <span className="line-clamp-3 font-serif text-[11px] leading-tight font-semibold">
            {props.item.title}
          </span>
          <span className="truncate text-[9px] opacity-70">{props.item.author}</span>
        </>
      )}
    </div>
  )
}

export function ProgressBar(props: { value: number; className?: string }) {
  return (
    <span className={cn("block h-1 overflow-hidden rounded-full bg-surface-raised-base", props.className)}>
      <span
        className="block h-full rounded-full bg-text-weak"
        style={{ width: `${Math.round(props.value * 100)}%` }}
      />
    </span>
  )
}

/** The small leading visual for a row: a cover, a site letter, a file icon, or the kind's art. */
export function ItemGlyph(props: { item: HomeItem; size?: "sm" | "md" }) {
  const box = props.size === "md" ? "size-8" : "size-6"
  if (props.item.kind === "book") {
    return (
      <span className={cn("flex shrink-0 items-center justify-center", box)}>
        <Cover item={props.item} compact className={props.size === "md" ? "h-8" : "h-6"} />
      </span>
    )
  }
  if (props.item.kind === "page") {
    return (
      <span className={cn("flex shrink-0 items-center justify-center", box)}>
        <span className="flex size-5 items-center justify-center rounded-md bg-surface-raised-stronger-non-alpha text-[10px] font-semibold text-text-base">
          {(props.item.host ?? props.item.title).charAt(0).toUpperCase()}
        </span>
      </span>
    )
  }
  if (props.item.kind === "file") {
    return (
      <span className={cn("flex shrink-0 items-center justify-center", box)}>
        <FileTypeIcon fileName={props.item.title} className="size-5 object-contain" />
      </span>
    )
  }
  return (
    <span className={cn("flex shrink-0 items-center justify-center", box)}>
      <img src={KIND_ART[props.item.kind]} alt="" className={cn("object-contain", box)} aria-hidden />
    </span>
  )
}

export function ArtGlyph(props: { src: string; className?: string }) {
  return (
    <span className={cn("flex size-6 shrink-0 items-center justify-center", props.className)}>
      <img src={props.src} alt="" className="size-6 object-contain" aria-hidden />
    </span>
  )
}

export function WebGlyph() {
  return <ArtGlyph src={BENCH_BROWSER_ART} />
}

/** Trailing metadata for a row: reading progress, due cards, or when it was last touched. */
export function ItemMeta(props: { item: HomeItem }) {
  if (props.item.kind === "book" && props.item.progress !== undefined && props.item.progress < 1) {
    return (
      <span className="flex w-16 shrink-0 items-center gap-1.5 text-[11px] text-text-weaker">
        <ProgressBar value={props.item.progress} className="flex-1" />
        {Math.round(props.item.progress * 100)}%
      </span>
    )
  }
  if (props.item.due) {
    return (
      <span className="shrink-0 rounded-full bg-surface-warning-weak px-1.5 py-px text-[11px] text-text-on-warning-weak">
        {props.item.due} due
      </span>
    )
  }
  return <span className="shrink-0 text-[11px] text-text-weaker">{props.item.when}</span>
}

export function KeyHints(props: { hints: ReadonlyArray<readonly [string, string]>; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-weaker", props.className)}>
      {props.hints.map(([key, label]) => (
        <span key={label} className="flex items-center gap-1">
          <Kbd>{key}</Kbd>
          {label}
        </span>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Keyboard — one active index over a flattened list, kept in view
// ---------------------------------------------------------------------------

export function useListNav(count: number, resetKey: string) {
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => setActive(0), [resetKey])
  const clamped = count === 0 ? -1 : Math.min(active, count - 1)

  function select(next: number) {
    setActive(next)
    listRef.current
      ?.querySelector(`[data-nav-index="${next}"]`)
      ?.scrollIntoView({ block: "nearest" })
  }

  function move(delta: number) {
    if (count === 0) return
    select((clamped + delta + count) % count)
  }

  return { active: clamped, select, move, listRef }
}

/** Focus the bar on mount, the way the real empty state does. */
export function useAutoFocus<TElement extends HTMLElement>() {
  const ref = useRef<TElement>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [])
  return ref
}
