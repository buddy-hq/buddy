import { useMemo, useState, type ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import { Badge, Button, Input, Switch, cn } from "@buddy/ui"
import {
  CheckIcon,
  DownloadIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  XIcon,
} from "@/icons/app-icons"
import { skillsCatalogQueryOptions } from "@/state/skills-catalog-query"
import type { InstalledSkillInfo, SkillLibraryEntry } from "@/state/skills-actions"
import { resolveSkillIconURL } from "@/components/skills/skill-icon-assets"

/**
 * Easel · Skills drawer — calm browsing, dense answering
 *
 * Two things we already decided, put together:
 *
 *  1. The calm list (skills-panel-redesigns · concept 1) is the right BROWSE
 *     row. One anchor, one name, one line, a quiet control. Fifteen skills you
 *     are not looking for should not shout.
 *  2. The drawers speak a density language (`objects/types.ts`: sm / md / lg /
 *     card), and the search drawer promotes the top band "without reordering"
 *     when a result has something to show.
 *
 * The proposal is that DENSITY IS A FUNCTION OF STATE, NOT OF ITEM. The same
 * skill is an sm row, an md row, or an lg row depending on what the user is
 * doing to the list right now — nothing about the skill itself changes.
 *
 *   No query      → every row md. This is the calm list, unchanged.
 *   Query         → rows keep their rank; a few earn lg; a long tail drops to sm.
 *
 * A row earns lg for one of exactly two reasons:
 *
 *   a) THE CALM ROW WOULD NOT EXPLAIN ITSELF. The query matched a tag, a
 *      category, or the source — none of which a calm row shows. Left at md the
 *      row looks like a false positive. This is the important clause: it fires
 *      on the rows the user is most likely to distrust.
 *   b) IT IS A TOP RESULT WITH SOMETHING TO SHOW. The first few ranked rows
 *      expand when they actually carry tags or a category — never to display
 *      whitespace. (Same rule the search drawer already uses for cards.)
 *
 * Capped at MAX_PROMOTED_ROWS so a search never becomes a wall of cards, and
 * past TAIL_COLLAPSE_START_INDEX in a long result set the rows fall to sm —
 * by then the user is scanning names, not reading summaries.
 *
 * The second line does double duty, which is what keeps md useful under search:
 * normally it is the summary (WHAT this is); when the match landed somewhere a
 * calm row cannot show, it becomes the reason (WHY this is here). Same height,
 * more information, only when there is information to add.
 *
 * VISUAL: real skill icon assets keyed by skill id (`assets/skills/`, the same
 * atlas as the skill-icon easel), falling back to a hash-coloured monogram for
 * every skill that has no asset yet. Still no per-category icon lookup table.
 *
 * Flip "Live catalog" on (needs a connected directory) to run all three panels
 * against the real installed + library lists.
 */

const DRAWER_WIDTH_PX = 404

// ─── Density language ───────────────────────────────────────────────────────

const SKILL_DENSITY_SM = "sm"
const SKILL_DENSITY_MD = "md"
const SKILL_DENSITY_LG = "lg"

type SkillDensity = typeof SKILL_DENSITY_SM | typeof SKILL_DENSITY_MD | typeof SKILL_DENSITY_LG

/** sm and md are rows in a borderless list; lg is a bordered card. */
type CalmDensity = typeof SKILL_DENSITY_SM | typeof SKILL_DENSITY_MD

/**
 * Fixed heights — the shipped drawer virtualises, so a row may not grow with
 * its state.
 *
 * md is deliberately roomy at 72px: these are real 3D icon assets, and a 36px
 * box turns them into confetti. 44px is the smallest size at which a rendered
 * object still reads as an object, and the extra height buys the summary its
 * second line — one truncated line was the reason descriptions were unreadable.
 */
const SKILL_ROW_HEIGHT_PX = {
  [SKILL_DENSITY_SM]: 40,
  // 10px padding ×2 + 17 name + 2 gap + 33 two-line summary.
  [SKILL_DENSITY_MD]: 72,
  // 12px padding ×2 + 48 icon row + 8 gap + 33 summary + 8 gap + 15 meta.
  [SKILL_DENSITY_LG]: 136,
} satisfies Record<SkillDensity, number>

const SKILL_ROW_SHELL_CLASS = {
  [SKILL_DENSITY_SM]: "h-10 items-center gap-3 px-2.5",
  [SKILL_DENSITY_MD]: "h-[4.5rem] items-center gap-3.5 px-2.5",
} satisfies Record<CalmDensity, string>

const SKILL_VISUAL_CLASS = {
  [SKILL_DENSITY_SM]: "size-7 rounded-md",
  [SKILL_DENSITY_MD]: "size-11 rounded-xl",
  [SKILL_DENSITY_LG]: "size-12 rounded-xl",
} satisfies Record<SkillDensity, string>

const SKILL_MONOGRAM_TEXT_CLASS = {
  [SKILL_DENSITY_SM]: "text-[10px]",
  [SKILL_DENSITY_MD]: "text-sm",
  [SKILL_DENSITY_LG]: "text-base",
} satisfies Record<SkillDensity, string>

/** How many top-ranked rows may expand purely for being top-ranked. */
const PROMOTED_RESULT_COUNT = 3
/** Hard cap, so a broad query never turns the whole drawer into cards. */
const MAX_PROMOTED_ROWS = 5
/** Below this, every result fits on screen and the tail does not need collapsing. */
const TAIL_COLLAPSE_MIN_RESULTS = 12
const TAIL_COLLAPSE_START_INDEX = 8

// ─── Domain ─────────────────────────────────────────────────────────────────

type Family = "purple" | "cyan" | "mint" | "orange" | "lime" | "pink"
const FAMILIES: Family[] = ["purple", "cyan", "mint", "orange", "lime", "pink"]

const AVATAR_SURFACE = {
  purple: "bg-avatar-background-purple text-avatar-text-purple",
  cyan: "bg-avatar-background-cyan text-avatar-text-cyan",
  mint: "bg-avatar-background-mint text-avatar-text-mint",
  orange: "bg-avatar-background-orange text-avatar-text-orange",
  lime: "bg-avatar-background-lime text-avatar-text-lime",
  pink: "bg-avatar-background-pink text-avatar-text-pink",
} satisfies Record<Family, string>

type RowControl =
  | { kind: "toggle"; enabled: boolean }
  | { kind: "install" }
  | { kind: "installed" }
  | { kind: "update" }

/**
 * What this skill is to this notebook right now. Only the untabbed concept (D)
 * needs it: with one list, "installed and off" and "not installed here at all"
 * both look like a row that is doing nothing, so the row has to say which.
 */
const SKILL_STATE_ON = "on"
const SKILL_STATE_OFF = "off"
const SKILL_STATE_UPDATE = "update"
const SKILL_STATE_AVAILABLE = "available"

type SkillState =
  | typeof SKILL_STATE_ON
  | typeof SKILL_STATE_OFF
  | typeof SKILL_STATE_UPDATE
  | typeof SKILL_STATE_AVAILABLE

/**
 * Deliberately no label table: every state is already spoken by the control
 * column and the section it sits in. A row that also spells it out in a badge
 * is saying the same thing three times.
 *
 * One control per row: installed skills are switched, everything else is added.
 */
function controlForState(state: SkillState): RowControl {
  if (state === SKILL_STATE_AVAILABLE) return { kind: "install" }
  return { kind: "toggle", enabled: state !== SKILL_STATE_OFF }
}

function isInstalledState(state: SkillState): boolean {
  return state !== SKILL_STATE_AVAILABLE
}

type SkillCard = {
  id: string
  icon?: string
  name: string
  description: string
  tags: string[]
  /** Real catalog category, when one resolves. Never invented. */
  category?: string
  /** Real `source` field as text — the fallback when there is no category. */
  sourceLabel?: string
  /** Real `scope` field as text. Installed skills only. */
  scopeLabel?: string
  control: RowControl
  /** Set only in the untabbed concept, where one list carries both pools. */
  state?: SkillState
}

type Tab = "installed" | "discover"

const PANEL_MODE_CALM = "calm"
const PANEL_MODE_SPLIT = "split"
const PANEL_MODE_EXPAND = "expand"

type PanelMode = typeof PANEL_MODE_CALM | typeof PANEL_MODE_SPLIT | typeof PANEL_MODE_EXPAND

const MATCH_FIELD_NAME = "name"
const MATCH_FIELD_SUMMARY = "summary"
const MATCH_FIELD_CATEGORY = "category"
const MATCH_FIELD_TAG = "tag"
const MATCH_FIELD_SOURCE = "source"

type MatchField =
  | typeof MATCH_FIELD_NAME
  | typeof MATCH_FIELD_SUMMARY
  | typeof MATCH_FIELD_CATEGORY
  | typeof MATCH_FIELD_TAG
  | typeof MATCH_FIELD_SOURCE

type SkillMatch = {
  fields: MatchField[]
  /** The tags that actually matched, so the reason line can name them. */
  tags: string[]
}

type RankedSkill = { card: SkillCard; match: SkillMatch }

// ─── Identity: real asset, else monogram ────────────────────────────────────

/** Deterministic colour — no per-skill curation, ever. */
function familyForID(id: string): Family {
  let hash = 0
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) | 0
  return FAMILIES[Math.abs(hash) % FAMILIES.length] ?? "purple"
}

function initialsForName(name: string): string {
  const words = name.trim().split(/\s+/u).filter(Boolean)
  if (words.length === 0) return "?"
  if (words.length === 1) return words[0]?.slice(0, 2).toLocaleUpperCase() ?? "?"
  return `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`.toLocaleUpperCase()
}

function capitalize(value: string): string {
  return value.charAt(0).toLocaleUpperCase() + value.slice(1)
}

/**
 * Identity, and the row's only state paint.
 *
 * Off is DELIBERATELY disabled, so it goes grey — the same treatment every
 * disabled control gets. Not-installed is not disabled, it is just not here
 * yet, so it keeps its colour and only softens; greying it too made the whole
 * available band look broken instead of addable.
 */
function SkillVisual(props: { card: SkillCard; density: SkillDensity }) {
  const iconURL = resolveSkillIconURL(props.card.icon)
  const box = SKILL_VISUAL_CLASS[props.density]
  const mute =
    props.card.state === SKILL_STATE_OFF
      ? "opacity-40 grayscale"
      : props.card.state === SKILL_STATE_AVAILABLE
        ? "opacity-75"
        : undefined

  if (iconURL) {
    return (
      <img
        src={iconURL}
        alt=""
        loading="lazy"
        decoding="async"
        className={cn("shrink-0 object-contain", box, mute)}
      />
    )
  }

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center font-semibold",
        AVATAR_SURFACE[familyForID(props.card.id)],
        box,
        mute,
      )}
    >
      <span className={SKILL_MONOGRAM_TEXT_CLASS[props.density]}>
        {initialsForName(props.card.name)}
      </span>
    </span>
  )
}

// ─── Matching ───────────────────────────────────────────────────────────────

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function queryTokens(query: string): string[] {
  return normalized(query).split(/\s+/u).filter(Boolean)
}

/**
 * Every token must land somewhere (the same AND the shipped drawers use), and
 * we keep WHERE each one landed — that is the input the density rule needs.
 */
function matchSkill(card: SkillCard, tokens: readonly string[]): SkillMatch | undefined {
  if (tokens.length === 0) return { fields: [], tags: [] }

  const fields = new Set<MatchField>()
  const matchedTags = new Set<string>()

  for (const token of tokens) {
    let hit = false
    if (normalized(card.name).includes(token)) {
      fields.add(MATCH_FIELD_NAME)
      hit = true
    }
    if (normalized(card.description).includes(token)) {
      fields.add(MATCH_FIELD_SUMMARY)
      hit = true
    }
    if (card.category && normalized(card.category).includes(token)) {
      fields.add(MATCH_FIELD_CATEGORY)
      hit = true
    }
    if (card.sourceLabel && normalized(card.sourceLabel).includes(token)) {
      fields.add(MATCH_FIELD_SOURCE)
      hit = true
    }
    for (const tag of card.tags) {
      if (!normalized(tag).includes(token)) continue
      fields.add(MATCH_FIELD_TAG)
      matchedTags.add(tag)
      hit = true
    }
    if (!hit) return undefined
  }

  return { fields: [...fields], tags: [...matchedTags] }
}

/** The match landed somewhere a calm row cannot show. */
function matchIsInvisibleAtCalmDensity(match: SkillMatch): boolean {
  if (match.fields.length === 0) return false
  return !match.fields.includes(MATCH_FIELD_NAME) && !match.fields.includes(MATCH_FIELD_SUMMARY)
}

function hasExtraDetail(card: SkillCard): boolean {
  return card.tags.length > 0 || card.category !== undefined
}

/**
 * The proposal, in one function. Rank order is never touched — only how much
 * room each rank is allowed to take.
 */
function densitiesFor(
  items: readonly RankedSkill[],
  mode: PanelMode,
  searching: boolean,
): SkillDensity[] {
  if (!searching || mode === PANEL_MODE_CALM) return items.map(() => SKILL_DENSITY_MD)
  if (mode === PANEL_MODE_EXPAND) return items.map(() => SKILL_DENSITY_LG)

  const collapseTail = items.length > TAIL_COLLAPSE_MIN_RESULTS
  let promoted = 0

  return items.map((item, index) => {
    const earnsLarge =
      matchIsInvisibleAtCalmDensity(item.match) ||
      (index < PROMOTED_RESULT_COUNT && hasExtraDetail(item.card))
    if (earnsLarge && promoted < MAX_PROMOTED_ROWS) {
      promoted += 1
      return SKILL_DENSITY_LG
    }
    if (collapseTail && index >= TAIL_COLLAPSE_START_INDEX) return SKILL_DENSITY_SM
    return SKILL_DENSITY_MD
  })
}

/**
 * The second line. "What this is" by default; "why this is here" when the match
 * landed somewhere the summary does not reveal.
 */
function reasonLine(match: SkillMatch): string | undefined {
  if (!matchIsInvisibleAtCalmDensity(match)) return undefined
  if (match.tags.length > 0) return `Matched tag · ${match.tags.join(", ")}`
  if (match.fields.includes(MATCH_FIELD_CATEGORY)) return "Matched its category"
  if (match.fields.includes(MATCH_FIELD_SOURCE)) return "Matched where it came from"
  return undefined
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")
}

type TextSegment = { text: string; matched: boolean; offset: number }

/** Offsets make every segment uniquely keyable, however often a word repeats. */
function textSegments(text: string, tokens: readonly string[]): TextSegment[] {
  const pattern = new RegExp(`(${tokens.map(escapeForRegExp).join("|")})`, "giu")
  let offset = 0
  return text.split(pattern).map((part, index) => {
    const segment = { text: part, matched: index % 2 === 1, offset }
    offset += part.length
    return segment
  })
}

function HighlightedText(props: { text: string; tokens: readonly string[] }) {
  if (props.tokens.length === 0) return <>{props.text}</>

  return (
    <>
      {textSegments(props.text, props.tokens).map((segment) =>
        segment.matched ? (
          <span
            key={segment.offset}
            className="rounded-[3px] bg-surface-interactive-weak px-0.5 text-text-strong"
          >
            {segment.text}
          </span>
        ) : (
          <span key={segment.offset}>{segment.text}</span>
        ),
      )}
    </>
  )
}

// ─── Controls ───────────────────────────────────────────────────────────────

/**
 * One control column, one width, every row. A switch and an add button occupy
 * the same box, so the right edge of the list stays a straight line whether the
 * skill is installed or not — that alignment is what tells the two apart, not a
 * badge repeating what the control already says.
 */
const CONTROL_COLUMN_CLASS = "flex w-9 shrink-0 items-center justify-end"

function DemoSwitch(props: { defaultOn: boolean }) {
  const [on, setOn] = useState(props.defaultOn)
  return (
    <div className={CONTROL_COLUMN_CLASS}>
      <Switch size="sm" checked={on} aria-label="Toggle skill" onCheckedChange={setOn} />
    </div>
  )
}

/** The calm-row form of "install": no label, no outline, same box as the switch. */
function AddButton() {
  return (
    <div className={CONTROL_COLUMN_CLASS}>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Add skill">
        <PlusIcon aria-hidden />
      </Button>
    </div>
  )
}

function ActionButton(props: {
  kind: Extract<RowControl, { kind: "install" | "installed" | "update" }>["kind"]
}) {
  if (props.kind === "installed") {
    return (
      <Button type="button" size="xs" variant="ghost" disabled className="gap-1">
        <CheckIcon className="size-3.5" aria-hidden />
        Installed
      </Button>
    )
  }
  if (props.kind === "update") {
    return (
      <Button type="button" size="xs" variant="secondary" className="gap-1">
        <RefreshCwIcon className="size-3.5" aria-hidden />
        Update
      </Button>
    )
  }
  return (
    <Button type="button" size="xs" variant="outline" className="gap-1">
      <DownloadIcon className="size-3.5" aria-hidden />
      Install
    </Button>
  )
}

function RowControlSlot(props: { control: RowControl; compact?: boolean }) {
  if (props.control.kind === "toggle") return <DemoSwitch defaultOn={props.control.enabled} />
  if (props.compact && props.control.kind === "install") return <AddButton />
  return (
    <div className="flex shrink-0 items-center">
      <ActionButton kind={props.control.kind} />
    </div>
  )
}

// ─── The row ────────────────────────────────────────────────────────────────

/**
 * The ONLY badge left. "Not installed" was a badge saying what the button next
 * to it already said, and it stole the width the name needed — so the state is
 * carried by the control column instead (switch = yours, plus = add it), and
 * the name gets the whole row. An update is the one thing neither the control
 * nor the section header can tell you, so it keeps its mark.
 */
function UpdateBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-raised-base px-1.5 py-0.5 text-[10px] font-medium text-text-base">
      <RefreshCwIcon className="size-2.5" aria-hidden />
      Update
    </span>
  )
}

/** Plain text, middot-joined, exactly like every other drawer's meta line. */
function metaLine(card: SkillCard): string {
  return [card.category ?? card.sourceLabel, card.scopeLabel].filter(Boolean).join(" · ")
}

function SkillName(props: { card: SkillCard; tokens: readonly string[] }) {
  return (
    <span className="min-w-0 truncate text-sm font-medium text-text-base">
      <HighlightedText text={props.card.name} tokens={props.tokens} />
    </span>
  )
}

/** sm and md: the calm row. No border, no badge soup, one line of detail at most. */
function CalmSkillRow(props: {
  card: SkillCard
  density: CalmDensity
  reason?: string
  tokens: readonly string[]
}) {
  const { card, density, reason, tokens } = props

  return (
    <div
      data-component="skill-row"
      data-density={density}
      className={cn("flex rounded-lg hover:bg-surface-base-hover", SKILL_ROW_SHELL_CLASS[density])}
    >
      <SkillVisual card={card} density={density} />

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <SkillName card={card} tokens={tokens} />
          {card.state === SKILL_STATE_UPDATE ? <UpdateBadge /> : null}
        </div>
        {/* Two lines, and text-weak rather than text-weaker: a summary nobody
            can finish reading is decoration, not information. */}
        {density === SKILL_DENSITY_MD ? (
          <span className="line-clamp-2 w-full text-xs leading-snug text-text-weak">
            {reason ?? <HighlightedText text={card.description} tokens={tokens} />}
          </span>
        ) : null}
      </div>

      {/* Only the untabbed concept sets `state`, and only there does an install
          collapse to a plus — the tabbed Discover tab keeps its labelled button. */}
      <RowControlSlot control={card.control} compact={card.state !== undefined} />
    </div>
  )
}

/**
 * lg: a real card, with a border and a surface of its own.
 *
 * The promotion has to be legible at a glance or it is not a promotion — a
 * taller borderless row inside a borderless list just reads as broken spacing.
 * Three slots, fixed: title line, two lines of summary, one meta line that is
 * the reason when there is one and the plain category otherwise. Never both.
 */
function PromotedSkillCard(props: { card: SkillCard; reason?: string; tokens: readonly string[] }) {
  const { card, reason, tokens } = props
  const meta = metaLine(card)

  return (
    <div
      data-component="skill-card"
      data-density={SKILL_DENSITY_LG}
      className="flex flex-col gap-2 rounded-xl border border-border-base bg-surface-raised-base p-3 shadow-sm"
      style={{ height: SKILL_ROW_HEIGHT_PX[SKILL_DENSITY_LG] }}
    >
      <div className="flex min-w-0 items-center gap-3">
        <SkillVisual card={card} density={SKILL_DENSITY_LG} />
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <SkillName card={card} tokens={tokens} />
          {card.state === SKILL_STATE_UPDATE ? <UpdateBadge /> : null}
        </div>
        <RowControlSlot control={card.control} />
      </div>

      <p className="line-clamp-2 text-xs leading-snug text-text-weak">
        <HighlightedText text={card.description} tokens={tokens} />
      </p>

      <p className="mt-auto truncate text-[11px] text-text-weaker">{reason ?? meta}</p>
    </div>
  )
}

function SkillRow(props: {
  card: SkillCard
  match: SkillMatch
  density: SkillDensity
  tokens: readonly string[]
}) {
  const reason = reasonLine(props.match)

  if (props.density === SKILL_DENSITY_LG) {
    return (
      <PromotedSkillCard card={props.card} tokens={props.tokens} {...(reason ? { reason } : {})} />
    )
  }

  return (
    <CalmSkillRow
      card={props.card}
      density={props.density}
      tokens={props.tokens}
      {...(reason ? { reason } : {})}
    />
  )
}

// ─── Panel shell ────────────────────────────────────────────────────────────

function PanelShell(props: {
  name: string
  density: string
  rationale: string
  /** Omitted by the untabbed concept — one list, one scroll, no mode switch. */
  tab?: Tab
  query: string
  children: ReactNode
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="shrink-0 px-1" style={{ width: DRAWER_WIDTH_PX }}>
        <div className="flex items-baseline gap-2">
          <h3 className="text-sm font-semibold text-text-strong">{props.name}</h3>
          <span className="text-[11px] text-text-weaker">{props.density}</span>
        </div>
        <p className="text-[11px] leading-relaxed text-text-weak">{props.rationale}</p>
      </div>

      <section
        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border-base bg-background-base shadow-lg"
        style={{ width: DRAWER_WIDTH_PX }}
      >
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border-weaker-base px-3">
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-text-strong">Skills</h2>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Refresh skills">
            <RefreshCwIcon aria-hidden />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Add skill">
            <PlusIcon aria-hidden />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Close Skills">
            <XIcon aria-hidden />
          </Button>
        </header>

        <div className="shrink-0 border-b border-border-weaker-base p-3">
          <div className="relative">
            <SearchIcon
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-icon-base"
              aria-hidden
            />
            <Input
              readOnly
              value={props.query}
              placeholder="Search skills..."
              aria-label="Search skills"
              className="pl-9"
            />
          </div>
        </div>

        {props.tab ? (
          <div className="shrink-0 border-b border-border-weaker-base px-3">
            <div className="flex gap-4">
              {(["installed", "discover"] as const).map((value) => (
                <span
                  key={value}
                  className={cn(
                    "border-b-2 py-2.5 text-sm",
                    value === props.tab
                      ? "border-border-strong-base font-medium text-text-strong"
                      : "border-transparent text-text-weaker",
                  )}
                >
                  {value === "installed" ? "Installed" : "Discover"}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <div className="scrollbar-hover min-h-0 flex-1 overflow-y-auto">{props.children}</div>
      </section>
    </div>
  )
}

function DensityLegend(props: { densities: readonly SkillDensity[]; searching: boolean }) {
  if (!props.searching) return null
  const counts = {
    [SKILL_DENSITY_SM]: props.densities.filter((density) => density === SKILL_DENSITY_SM).length,
    [SKILL_DENSITY_MD]: props.densities.filter((density) => density === SKILL_DENSITY_MD).length,
    [SKILL_DENSITY_LG]: props.densities.filter((density) => density === SKILL_DENSITY_LG).length,
  } satisfies Record<SkillDensity, number>

  return (
    <div className="flex items-center gap-3 px-3 pb-1 pt-2 text-[10px] text-text-weaker">
      <span>{props.densities.length} results</span>
      <span className="h-px flex-1 bg-border-weaker-base" />
      <span className="tabular-nums">
        {counts[SKILL_DENSITY_LG]} lg · {counts[SKILL_DENSITY_MD]} md · {counts[SKILL_DENSITY_SM]}{" "}
        sm
      </span>
    </div>
  )
}

function EmptyResults() {
  return (
    <p className="px-4 py-8 text-center text-xs text-text-weaker">No skill matches that search.</p>
  )
}

function SkillRowList(props: {
  items: readonly RankedSkill[]
  densities: readonly SkillDensity[]
  tokens: readonly string[]
}) {
  return (
    <ul className="flex flex-col gap-1.5 p-2.5 pt-1">
      {props.items.map((item, index) => (
        <li key={item.card.id}>
          <SkillRow
            card={item.card}
            match={item.match}
            density={props.densities[index] ?? SKILL_DENSITY_MD}
            tokens={props.tokens}
          />
        </li>
      ))}
    </ul>
  )
}

function SkillsList(props: {
  items: readonly RankedSkill[]
  mode: PanelMode
  searching: boolean
  tokens: readonly string[]
}) {
  const densities = densitiesFor(props.items, props.mode, props.searching)

  if (props.items.length === 0) return <EmptyResults />

  return (
    <>
      <DensityLegend densities={densities} searching={props.searching} />
      <SkillRowList items={props.items} densities={densities} tokens={props.tokens} />
    </>
  )
}

// ─── Concept D · one list, no tabs ──────────────────────────────────────────

const SECTION_LABEL_INSTALLED = "In this notebook"
const SECTION_LABEL_AVAILABLE = "Available to add"

/**
 * Sticky, because one merged scroll has no tabs to tell you where you are —
 * the band label is the only thing that does, so it must not scroll away.
 */
function SectionHeader(props: { label: string; count: number }) {
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

function UpdateBanner(props: { count: number }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border-weaker-base bg-surface-base px-3 py-2">
      <span className="flex items-center gap-2 text-xs font-medium text-text-base">
        <RefreshCwIcon className="size-3.5" aria-hidden />
        {props.count === 1 ? "1 skill has an update" : `${props.count} skills have updates`}
      </span>
      <Button type="button" size="xs" variant="secondary">
        Update all
      </Button>
    </div>
  )
}

/** Name hits outrank body hits, which outrank metadata-only hits. */
function matchStrength(match: SkillMatch): number {
  if (match.fields.includes(MATCH_FIELD_NAME)) return 0
  if (match.fields.includes(MATCH_FIELD_SUMMARY)) return 1
  return 2
}

/**
 * With one pool there has to be one rank, and "what you already have" wins ties:
 * a skill already in the notebook is a shorter path to the thing you asked for
 * than one you would have to install first.
 */
function compareMergedResults(left: RankedSkill, right: RankedSkill): number {
  const strength = matchStrength(left.match) - matchStrength(right.match)
  if (strength !== 0) return strength
  const installed =
    Number(left.card.state === SKILL_STATE_AVAILABLE) -
    Number(right.card.state === SKILL_STATE_AVAILABLE)
  if (installed !== 0) return installed
  return left.card.name.localeCompare(right.card.name)
}

function MergedSkillsList(props: {
  items: readonly RankedSkill[]
  searching: boolean
  tokens: readonly string[]
}) {
  const installed = props.items.filter(
    (item) => item.card.state !== undefined && isInstalledState(item.card.state),
  )
  const available = props.items.filter((item) => item.card.state === SKILL_STATE_AVAILABLE)
  const updates = props.items.filter((item) => item.card.state === SKILL_STATE_UPDATE)

  if (props.items.length === 0) return <EmptyResults />

  /**
   * Searching dissolves the two bands into one ranked list. Sections are a
   * browsing aid; while searching they would only push the best answer down
   * the page for the crime of not being installed yet.
   */
  if (props.searching) {
    const ranked = props.items.toSorted(compareMergedResults)
    const densities = densitiesFor(ranked, PANEL_MODE_SPLIT, true)
    return (
      <>
        <DensityLegend densities={densities} searching />
        <SkillRowList items={ranked} densities={densities} tokens={props.tokens} />
      </>
    )
  }

  return (
    <>
      {updates.length > 0 ? <UpdateBanner count={updates.length} /> : null}
      {installed.length > 0 ? (
        <>
          <SectionHeader label={SECTION_LABEL_INSTALLED} count={installed.length} />
          <SkillRowList
            items={installed}
            densities={densitiesFor(installed, PANEL_MODE_CALM, false)}
            tokens={props.tokens}
          />
        </>
      ) : null}
      {available.length > 0 ? (
        <>
          <SectionHeader label={SECTION_LABEL_AVAILABLE} count={available.length} />
          <SkillRowList
            items={available}
            densities={densitiesFor(available, PANEL_MODE_CALM, false)}
            tokens={props.tokens}
          />
        </>
      ) : null}
    </>
  )
}

// ─── Fixture ────────────────────────────────────────────────────────────────
// Ids match `assets/skills/skill-icon-design-system.yaml`, so any icon asset
// that lands in assets/skills replaces its monogram with no code change.

type FixtureSkill = {
  id: string
  name: string
  description: string
  tags: string[]
} & ({ category: string } | { sourceLabel: string })

const SOURCE_TEXT = {
  custom: "Custom skill",
  system: "Built into Buddy",
  library: "From your library",
  external: "External integration",
} satisfies Record<InstalledSkillInfo["source"], string>

const FIXTURE_SKILLS: FixtureSkill[] = [
  {
    id: "nousresearch-hermes-agent-arxiv",
    name: "arXiv Research",
    description: "Search arXiv papers by keyword, author, category, or ID.",
    category: "Research",
    tags: ["papers", "science"],
  },
  {
    id: "nousresearch-hermes-agent-blogwatcher",
    name: "Blogwatcher",
    description: "Monitor blogs and feeds, and summarise what changed.",
    category: "Web",
    tags: ["rss", "monitoring"],
  },
  {
    id: "nousresearch-hermes-agent-concept-diagrams",
    name: "Concept Diagrams",
    description: "Flat, minimal light/dark-aware SVG diagrams as standalone HTML.",
    category: "Diagrams",
    tags: ["svg", "visuals"],
  },
  {
    id: "nousresearch-hermes-agent-creative-ideation",
    name: "Creative Ideation",
    description: "Generate ideas via named methods from creative practice.",
    category: "Ideation",
    tags: ["brainstorm", "methods"],
  },
  {
    id: "anthropics-skills-docx",
    name: "DOCX",
    description: "Create, read, and edit DOCX files programmatically.",
    category: "Documents",
    tags: ["word", "files"],
  },
  {
    id: "nousresearch-hermes-agent-duckduckgo-search",
    name: "DuckDuckGo Search",
    description: "Free web search — text, news, images, and videos. No API key.",
    category: "Web",
    tags: ["search", "free"],
  },
  {
    id: "hermes-excalidraw",
    name: "Excalidraw",
    description: "Hand-drawn Excalidraw JSON diagrams for arch, flow, and sequence.",
    category: "Diagrams",
    tags: ["sketch", "json"],
  },
  {
    id: "nousresearch-hermes-agent-jupyter-live-kernel",
    name: "Jupyter Live Kernel",
    description: "Iterative Python via a live Jupyter kernel.",
    category: "Code",
    tags: ["python", "compute"],
  },
  {
    id: "anthropics-k12-teacher-skills-k12-lesson-differentiation",
    name: "K-12 Lesson Differentiation",
    description: "Differentiate a K-12 lesson into below / at / above grade tiers.",
    category: "Teaching",
    tags: ["k-12", "tiers"],
  },
  {
    id: "anthropics-k12-teacher-skills-k12-lesson-planning",
    name: "K-12 Lesson Planning",
    description: "Build standards-aligned K-12 lesson plans and materials.",
    category: "Teaching",
    tags: ["k-12", "standards"],
  },
  {
    id: "nousresearch-hermes-agent-manim-video",
    name: "Manim Video",
    description: "Manim CE animations — 3Blue1Brown-style math and algorithm videos.",
    category: "Media",
    tags: ["animation", "math"],
  },
  {
    id: "nousresearch-hermes-agent-maps",
    name: "Maps",
    description: "Geocode, POIs, routes, and timezones via OpenStreetMap / OSRM.",
    category: "Maps",
    tags: ["osm", "routing"],
  },
  {
    id: "anthropic-pptx",
    name: "PowerPoint Presentation",
    description: "Create, edit, inspect, and analyze PowerPoint presentations.",
    category: "Slides",
    tags: ["pptx", "slides"],
  },
  {
    id: "whiteboard-authoring",
    name: "Whiteboard Authoring",
    description: "Author editable visual explanations and cumulative board work.",
    category: "Diagrams",
    tags: ["board", "visuals"],
  },
  {
    id: "teach-chemistry",
    name: "Teach Chemistry",
    description: "Render chemically correct formulas, structures, and mechanisms.",
    category: "Teaching",
    tags: ["science", "notation"],
  },
  {
    id: "teach-mathematics",
    name: "Teach Mathematics",
    description: "Teach mathematics with figures, calculations, and proof scaffolding.",
    category: "Teaching",
    tags: ["math", "figures"],
  },
  {
    id: "grading-rubric",
    name: "Grading Rubric Helper",
    description: "A rubric someone on this team wrote and shared as a workspace skill.",
    sourceLabel: SOURCE_TEXT.custom,
    tags: [],
  },
  {
    id: "buddy-help",
    name: "Buddy Help",
    description: "Explains what Buddy can do and routes to the right feature.",
    sourceLabel: SOURCE_TEXT.system,
    tags: [],
  },
]

function toFixtureCard(skill: FixtureSkill, control: RowControl): SkillCard {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    tags: skill.tags,
    category: "category" in skill ? skill.category : undefined,
    sourceLabel: "sourceLabel" in skill ? skill.sourceLabel : undefined,
    scopeLabel: "sourceLabel" in skill ? "Workspace" : "Global",
    control,
  }
}

/** Everything not listed here is installed and on. */
const FIXTURE_STATE_OVERRIDES = new Map<string, SkillState>(Object.entries({
  "nousresearch-hermes-agent-duckduckgo-search": SKILL_STATE_OFF,
  "nousresearch-hermes-agent-maps": SKILL_STATE_OFF,
  "hermes-excalidraw": SKILL_STATE_UPDATE,
}))

function fixtureState(id: string): SkillState {
  return FIXTURE_STATE_OVERRIDES.get(id) ?? SKILL_STATE_ON
}

const FIXTURE_INSTALLED: SkillCard[] = FIXTURE_SKILLS.map((skill) =>
  toFixtureCard(skill, controlForState(fixtureState(skill.id))),
)

const DISCOVER_STATE = new Map<
  string,
  Extract<RowControl, { kind: "install" | "installed" | "update" }>["kind"]
>(Object.entries({
  "nousresearch-hermes-agent-arxiv": "installed",
  "anthropics-skills-docx": "installed",
  "anthropic-pptx": "installed",
  "hermes-excalidraw": "update",
}))

function discoverRank(control: RowControl): number {
  return control.kind === "install" ? 1 : 0
}

const FIXTURE_DISCOVER: SkillCard[] = FIXTURE_SKILLS.filter((skill) => "category" in skill)
  .map((skill) => toFixtureCard(skill, { kind: DISCOVER_STATE.get(skill.id) ?? "install" }))
  .toSorted(
    (left, right) =>
      discoverRank(left.control) - discoverRank(right.control) ||
      left.name.localeCompare(right.name),
  )

// Library entries nobody has installed yet — the pool the Discover tab hid, and
// the reason concept D needs a state on every row.
const FIXTURE_LIBRARY_ONLY: FixtureSkill[] = [
  {
    id: "nousresearch-hermes-agent-p5js",
    name: "p5.js",
    description: "Generative art, shaders, and interactive sketches.",
    category: "Media",
    tags: ["canvas", "visuals"],
  },
  {
    id: "nousresearch-hermes-agent-whisper",
    name: "Whisper",
    description: "Transcribe, translate, and identify multilingual speech.",
    category: "Media",
    tags: ["audio", "transcription"],
  },
  {
    id: "nousresearch-hermes-agent-ocr-and-documents",
    name: "OCR and Documents",
    description: "Extract text from PDFs and scanned documents.",
    category: "Documents",
    tags: ["pdf", "scan"],
  },
  {
    id: "nousresearch-hermes-agent-qmd",
    name: "QMD",
    description: "Search local knowledge bases using hybrid retrieval.",
    category: "Research",
    tags: ["rag", "search"],
  },
  {
    id: "anthropics-financial-services-xlsx-author",
    name: "XLSX Author",
    description: "Produce headless Excel workbooks on disk.",
    category: "Documents",
    tags: ["excel", "python"],
  },
  {
    id: "nousresearch-hermes-agent-obsidian",
    name: "Obsidian Vault",
    description: "Read, search, create, and edit notes in an Obsidian vault.",
    category: "Notes",
    tags: ["markdown", "vault"],
  },
  {
    id: "find-indian-education-resources",
    name: "Indian Education Resources",
    description: "Ground teaching in official Indian curricula and education sources.",
    category: "Teaching",
    tags: ["ncert", "curriculum"],
  },
  {
    id: "nousresearch-hermes-agent-research-paper-writing",
    name: "Research Paper Writing",
    description: "Design and write machine-learning research papers for submission.",
    category: "Research",
    tags: ["papers", "writing"],
  },
]

function toMergedCard(skill: FixtureSkill, state: SkillState): SkillCard {
  return { ...toFixtureCard(skill, controlForState(state)), state }
}

const FIXTURE_MERGED: SkillCard[] = [
  ...FIXTURE_SKILLS.map((skill) => toMergedCard(skill, fixtureState(skill.id))),
  ...FIXTURE_LIBRARY_ONLY.map((skill) => toMergedCard(skill, SKILL_STATE_AVAILABLE)),
].toSorted((left, right) => left.name.localeCompare(right.name))

// ─── Live catalog adapters ──────────────────────────────────────────────────

function categoryForInstalledSkill(
  skill: InstalledSkillInfo,
  libraryByID: ReadonlyMap<string, SkillLibraryEntry>,
): string | undefined {
  const libraryEntry = skill.libraryID ? libraryByID.get(skill.libraryID) : undefined
  const raw = libraryEntry?.categories[0]
  return raw ? capitalize(raw.trim()) : undefined
}

function toInstalledCard(
  skill: InstalledSkillInfo,
  libraryByID: ReadonlyMap<string, SkillLibraryEntry>,
  state?: SkillState,
): SkillCard {
  const libraryEntry = skill.libraryID ? libraryByID.get(skill.libraryID) : undefined
  const category = categoryForInstalledSkill(skill, libraryByID)
  return {
    id: skill.libraryID ?? skill.name,
    icon: libraryEntry?.icon ?? skill.icon,
    // Same resolution order the shipped drawer uses: a library-installed skill
    // gets its curated catalog name, and only a skill with no resolvable
    // library entry falls back to its own presentation. Skipping this step is
    // what made the live rows here read as slugs.
    name: libraryEntry?.displayName ?? skill.displayName,
    description: libraryEntry?.summary ?? skill.shortDescription,
    tags: libraryEntry?.tags ?? [],
    category,
    sourceLabel: category ? undefined : SOURCE_TEXT[skill.source],
    scopeLabel: skill.scope === "workspace" ? "Workspace" : "Global",
    control: state
      ? controlForState(state)
      : { kind: "toggle", enabled: skill.permissionAction !== "deny" },
    state,
  }
}

function libraryControl(entry: SkillLibraryEntry): RowControl {
  if (entry.state === "installed") return { kind: "installed" }
  if (entry.state === "update_available") return { kind: "update" }
  return { kind: "install" }
}

function toDiscoverCard(entry: SkillLibraryEntry, state?: SkillState): SkillCard {
  const raw = entry.categories[0]
  return {
    id: entry.id,
    icon: entry.icon,
    name: entry.displayName,
    description: entry.summary,
    tags: entry.tags,
    category: raw ? capitalize(raw.trim()) : undefined,
    control: state ? controlForState(state) : libraryControl(entry),
    state,
  }
}

function libraryEntryRank(entry: SkillLibraryEntry): number {
  return entry.state === "available" ? 1 : 0
}

function installedState(
  skill: InstalledSkillInfo,
  libraryByID: ReadonlyMap<string, SkillLibraryEntry>,
): SkillState {
  if (skill.permissionAction === "deny") return SKILL_STATE_OFF
  const entry = skill.libraryID ? libraryByID.get(skill.libraryID) : undefined
  return entry?.state === "update_available" ? SKILL_STATE_UPDATE : SKILL_STATE_ON
}

/** The untabbed list: every installed skill, plus every library entry not yet installed. */
function mergedCards(
  installed: readonly InstalledSkillInfo[],
  library: readonly SkillLibraryEntry[],
  libraryByID: ReadonlyMap<string, SkillLibraryEntry>,
): SkillCard[] {
  const installedCards = installed.map((skill) =>
    toInstalledCard(skill, libraryByID, installedState(skill, libraryByID)),
  )
  const availableCards = library
    .filter((entry) => entry.state === "available")
    .map((entry) => toDiscoverCard(entry, SKILL_STATE_AVAILABLE))
  return [...installedCards, ...availableCards].toSorted((left, right) =>
    left.name.localeCompare(right.name),
  )
}

// ─── Stage ──────────────────────────────────────────────────────────────────

const EXAMPLE_QUERIES = ["diagram", "k-12", "rss", "python", "custom"] as const

function rankSkills(pool: readonly SkillCard[], tokens: readonly string[]): RankedSkill[] {
  return pool.flatMap((card) => {
    const match = matchSkill(card, tokens)
    return match ? [{ card, match }] : []
  })
}

export function SkillsDrawerCalmDensityEasel(props: { directory?: string }) {
  const [tab, setTab] = useState<Tab>("installed")
  const [query, setQuery] = useState("")
  const [liveCatalog, setLiveCatalog] = useState(false)

  const catalogQuery = useQuery({
    ...skillsCatalogQueryOptions(props.directory ?? ""),
    enabled: Boolean(props.directory) && liveCatalog,
  })
  const catalog = catalogQuery.data
  const liveAvailable = Boolean(props.directory)
  const usingLive = liveCatalog && liveAvailable

  const libraryByID = useMemo(
    () => new Map((catalog?.library ?? []).map((entry) => [entry.id, entry] as const)),
    [catalog?.library],
  )
  const liveInstalled = useMemo(
    () => (catalog?.installed ?? []).map((skill) => toInstalledCard(skill, libraryByID)),
    [catalog?.installed, libraryByID],
  )
  const liveDiscover = useMemo(
    () =>
      (catalog?.library ?? [])
        .toSorted(
          (left, right) =>
            libraryEntryRank(left) - libraryEntryRank(right) ||
            left.displayName.localeCompare(right.displayName),
        )
        .map((entry) => toDiscoverCard(entry)),
    [catalog?.library],
  )

  const cards = usingLive
    ? tab === "installed"
      ? liveInstalled
      : liveDiscover
    : tab === "installed"
      ? FIXTURE_INSTALLED
      : FIXTURE_DISCOVER

  const liveMerged = useMemo(
    () => mergedCards(catalog?.installed ?? [], catalog?.library ?? [], libraryByID),
    [catalog?.installed, catalog?.library, libraryByID],
  )
  const merged = usingLive ? liveMerged : FIXTURE_MERGED

  const tokens = useMemo(() => queryTokens(query), [query])
  const searching = tokens.length > 0
  const ranked = useMemo(() => rankSkills(cards, tokens), [cards, tokens])
  const rankedMerged = useMemo(() => rankSkills(merged, tokens), [merged, tokens])

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-surface-inset-base">
      <div className="flex shrink-0 flex-wrap items-center gap-4 border-b border-border-weaker-base px-4 py-2">
        <div className="flex min-w-0 flex-col">
          <p className="text-xs font-medium text-text-base">
            Skills drawer · calm browsing, dense answering
          </p>
          <p className="text-[11px] text-text-weaker">
            Density is a function of state, not of item. Idle = the calm list. Searching = rows keep
            their rank, a few earn a taller row, a long tail shrinks. Type below — the three drawers
            share one query.
          </p>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-4">
          <div className="relative w-56">
            <SearchIcon
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-icon-base"
              aria-hidden
            />
            <Input
              value={query}
              aria-label="Search skills across all three panels"
              placeholder="Search skills…"
              className="h-8 pl-8 text-xs"
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
          </div>

          <div className="flex items-center gap-1">
            {EXAMPLE_QUERIES.map((example) => (
              <button
                key={example}
                type="button"
                aria-pressed={query === example}
                className={cn(
                  "rounded-md px-1.5 py-0.5 text-[11px] transition-colors",
                  query === example
                    ? "bg-surface-raised-base text-text-strong"
                    : "text-text-weaker hover:text-text-base",
                )}
                onClick={() => setQuery(query === example ? "" : example)}
              >
                {example}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-0.5 rounded-lg border border-border-weaker-base p-0.5">
            {(["installed", "discover"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={value === tab}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                  value === tab
                    ? "bg-surface-raised-base text-text-strong"
                    : "text-text-weaker hover:text-text-base",
                )}
                onClick={() => setTab(value)}
              >
                {value === "installed" ? "Installed" : "Discover"}
              </button>
            ))}
          </div>

          <label
            className="flex items-center gap-2 text-xs text-text-weak"
            htmlFor="skills-density-live"
          >
            Live catalog
            <Switch
              id="skills-density-live"
              size="sm"
              checked={usingLive}
              disabled={!liveAvailable}
              onCheckedChange={setLiveCatalog}
            />
          </label>

          <Badge variant="outline">
            {ranked.length}{" "}
            {searching ? "matching" : tab === "installed" ? "installed" : "in library"}
            {usingLive ? " · live" : " · fixture"}
          </Badge>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-x-auto">
        <div className="flex h-full min-h-0 items-stretch gap-6 p-4">
          <PanelShell
            name="A · Calm only"
            density={`${SKILL_ROW_HEIGHT_PX[SKILL_DENSITY_MD]}px rows, always`}
            tab={tab}
            query={query}
            rationale="Today's favourite, unchanged. Perfect while browsing — but a search result that matched a tag looks identical to one that matched its name, so the odd-looking rows never explain themselves."
          >
            <SkillsList
              items={ranked}
              mode={PANEL_MODE_CALM}
              searching={searching}
              tokens={tokens}
            />
          </PanelShell>

          <PanelShell
            name="B · Split density"
            density="sm / md / lg by state"
            tab={tab}
            query={query}
            rationale="The proposal. Idle it is panel A. Searching, a row grows only when the calm row would not explain itself (matched a tag / category / source) or it is a top result with real detail — capped, so a search never becomes a wall of cards. Long tails drop to sm."
          >
            <SkillsList
              items={ranked}
              mode={PANEL_MODE_SPLIT}
              searching={searching}
              tokens={tokens}
            />
          </PanelShell>

          <PanelShell
            name="C · Expand everything"
            density={`${SKILL_ROW_HEIGHT_PX[SKILL_DENSITY_LG]}px rows while searching`}
            tab={tab}
            query={query}
            rationale="The obvious alternative: every match goes rich. More information per row, but four results fill the drawer and the ranking stops being legible — the thing panel B spends its promotions to protect."
          >
            <SkillsList
              items={ranked}
              mode={PANEL_MODE_EXPAND}
              searching={searching}
              tokens={tokens}
            />
          </PanelShell>

          <PanelShell
            name="D · One list, no tabs"
            density="B's density rules, single pool"
            query={query}
            rationale="Installed and library in one scroll. Idle: two quiet bands, an update banner, and colour doing the work — a live skill is in colour, an off or uninstalled one is greyed. Searching: the bands dissolve into one rank (yours wins ties), and the same promotion rule applies. Ignores the Installed/Discover switch above — it has no tabs to switch."
          >
            <MergedSkillsList items={rankedMerged} searching={searching} tokens={tokens} />
          </PanelShell>
        </div>
      </div>
    </div>
  )
}
