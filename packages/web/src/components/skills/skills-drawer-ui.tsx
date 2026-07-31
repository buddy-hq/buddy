import type { ReactNode } from "react"
import { cn } from "@buddy/ui"
import {
  SKILL_VISUAL_SIZE_MD,
  SKILL_VISUAL_SIZE_SM,
  SkillVisual,
  type SkillVisualSize,
} from "./skill-visual"

/**
 * Row primitives for the skills drawer.
 *
 * The drawer is ONE list — installed skills and library skills in a single
 * scroll, no tabs — so a row has to answer "what is this" and "what can I do
 * with it" on its own. It answers with exactly four things: an identity mark,
 * the name, the summary, and the control. Category, tags, scope and source are
 * deliberately absent; they live in the detail dialog, which is where they were
 * before and where they belong.
 *
 * Density is a function of what the user is doing, not of what the skill is.
 * Browsing, every row is `default`. Searching, the top few results expand and a
 * long tail collapses — same rank, different amounts of room.
 */

export const SKILL_ROW_DENSITY_COMPACT = "compact"
export const SKILL_ROW_DENSITY_DEFAULT = "default"
export const SKILL_ROW_DENSITY_EXPANDED = "expanded"

export type SkillRowDensity =
  | typeof SKILL_ROW_DENSITY_COMPACT
  | typeof SKILL_ROW_DENSITY_DEFAULT
  | typeof SKILL_ROW_DENSITY_EXPANDED

/** Constant per density, so a row never resizes as its state settles. */
const ROW_SHELL_CLASS: Record<SkillRowDensity, string> = {
  [SKILL_ROW_DENSITY_COMPACT]: "h-10 items-center gap-3 rounded-lg px-2.5",
  [SKILL_ROW_DENSITY_DEFAULT]: "h-[4.5rem] items-center gap-3.5 rounded-lg px-2.5",
  [SKILL_ROW_DENSITY_EXPANDED]:
    "h-[8.5rem] flex-col gap-2 rounded-xl border border-border-base bg-surface-raised-base p-3 shadow-sm",
}

/**
 * At 52px the mark is as tall as the title-plus-summary block beside it, so a
 * browsing row reads as two balanced columns instead of a small badge against a
 * wall of text. An expanded result is a taller card, not a bigger skill, so it
 * carries the same mark.
 */
const VISUAL_SIZE: Record<SkillRowDensity, SkillVisualSize> = {
  [SKILL_ROW_DENSITY_COMPACT]: SKILL_VISUAL_SIZE_SM,
  [SKILL_ROW_DENSITY_DEFAULT]: SKILL_VISUAL_SIZE_MD,
  [SKILL_ROW_DENSITY_EXPANDED]: SKILL_VISUAL_SIZE_MD,
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")
}

type TextSegment = { text: string; matched: boolean; offset: number }

/** Offsets keep every segment uniquely keyable however often a word repeats. */
function textSegments(text: string, query: string): TextSegment[] {
  const pattern = new RegExp(`(${escapeForRegExp(query)})`, "giu")
  let offset = 0
  return text.split(pattern).map((part, index) => {
    const segment = { text: part, matched: index % 2 === 1, offset }
    offset += part.length
    return segment
  })
}

/** Marks where the query landed. Shows nothing the row was not already showing. */
function HighlightedText(props: { text: string; query: string }) {
  const query = props.query.trim()
  if (!query) return <>{props.text}</>

  return (
    <>
      {textSegments(props.text, query).map((segment) =>
        segment.matched ? (
          <span
            key={`${segment.offset}:match`}
            className="rounded-[3px] bg-surface-interactive-weak text-text-strong"
          >
            {segment.text}
          </span>
        ) : (
          <span key={`${segment.offset}:text`}>{segment.text}</span>
        ),
      )}
    </>
  )
}

export type SkillsListRowProps = {
  /** Identity for the artwork and the fallback colour — stable per skill. */
  id: string
  title: string
  icon?: string
  iconRetryToken?: number
  description: string
  ariaLabel: string
  control: ReactNode
  density?: SkillRowDensity
  /** Highlighted in the title and summary when present. */
  query?: string
  /** Installed but switched off. */
  dimmed?: boolean
  /** In the library, not installed here. */
  muted?: boolean
  onSelect: () => void
}

export function SkillsListRow({
  density = SKILL_ROW_DENSITY_DEFAULT,
  query = "",
  ...props
}: SkillsListRowProps) {
  const expanded = density === SKILL_ROW_DENSITY_EXPANDED
  const visual = (
    <SkillVisual
      id={props.id}
      title={props.title}
      {...(props.icon ? { icon: props.icon } : {})}
      {...(props.iconRetryToken !== undefined ? { retryToken: props.iconRetryToken } : {})}
      size={VISUAL_SIZE[density]}
      {...(props.dimmed ? { dimmed: true } : {})}
      {...(props.muted ? { muted: true } : {})}
    />
  )
  const title = (
    <span className="min-w-0 truncate text-sm font-medium text-text-base">
      <HighlightedText text={props.title} query={query} />
    </span>
  )
  const summary = (
    <span
      className={cn(
        "w-full whitespace-normal text-xs leading-snug text-text-weak",
        expanded ? "line-clamp-3" : "line-clamp-2",
      )}
    >
      <HighlightedText text={props.description} query={query} />
    </span>
  )

  /**
   * The expanded row is a card with a border of its own. A taller borderless
   * row inside a borderless list only reads as broken spacing, not as a result
   * that earned more room.
   */
  if (expanded) {
    return (
      <div
        data-component="skill-row"
        data-density={density}
        className={cn("flex", ROW_SHELL_CLASS[density])}
      >
        <div className="flex min-w-0 items-center gap-3">
          {visual}
          <button
            type="button"
            aria-label={props.ariaLabel}
            className="min-w-0 flex-1 bg-transparent text-left outline-none focus-visible:ring-2 focus-visible:ring-border-interactive-base/50"
            onClick={props.onSelect}
          >
            {title}
          </button>
          {props.control}
        </div>
        {summary}
      </div>
    )
  }

  return (
    <div
      data-component="skill-row"
      data-density={density}
      className={cn("flex hover:bg-surface-base-hover", ROW_SHELL_CLASS[density])}
    >
      {visual}
      <button
        type="button"
        aria-label={props.ariaLabel}
        className="flex min-w-0 flex-1 flex-col items-start gap-0.5 bg-transparent text-left outline-none focus-visible:ring-2 focus-visible:ring-border-interactive-base/50"
        onClick={props.onSelect}
      >
        {title}
        {density === SKILL_ROW_DENSITY_DEFAULT ? summary : null}
      </button>
      {props.control}
    </div>
  )
}

/**
 * Sticky, because one merged scroll has no tabs to say where you are — the band
 * label is the only thing that does, so it must not scroll away.
 */
export function SkillsSectionHeader(props: { label: string; count: number }) {
  return (
    <div className="sticky top-0 z-10 flex items-baseline gap-2 bg-background-base px-3 pb-1.5 pt-3">
      <span className="text-[11px] font-medium uppercase tracking-wider text-text-weaker">
        {props.label}
      </span>
      <span className="text-[11px] tabular-nums text-text-weaker">{props.count}</span>
      <span className="h-px flex-1 self-center bg-border-weaker-base" />
    </div>
  )
}
