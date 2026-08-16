import { Fragment, useMemo, useState, type ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import { Badge, Button, Input, Separator, Switch, cn } from "@buddy/ui"
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

/**
 * Easel · Skills drawer redesigns
 *
 * The shipped drawer (SkillsRailListRow) renders every skill as the same two
 * lines of text — a bold name over a clamped grey summary — with a control
 * pinned to the right and a hairline <Separator/> between each. Fifteen skills
 * read as fifteen identical rows: nothing anchors the eye, and the loudest
 * thing on every row is a repeated toggle.
 *
 * DELIBERATELY ICON-FREE. An earlier version of this file derived a glyph
 * icon per category ("research" → book, "diagrams" → workflow, …). That
 * requires someone to hand-pick an icon for every category string that ever
 * shows up in the catalog, forever — and per the data caveat below, most
 * installed skills don't even have a category to key off. A lookup table
 * that has to grow by hand isn't a design, it's a maintenance liability.
 *
 * So the anchor here is a coloured monogram: initials from the skill's own
 * name, colour from a hash of its id. Zero curation, works for any skill that
 * will ever exist. Category / tags are rendered as plain text chips only when
 * the catalog actually has them — never invented, never iconified.
 *
 * DATA CAVEAT — verified against the actual API, not assumed:
 * `SkillsListResponses[200].installed` (built by discovery.ts straight from
 * SKILL.md frontmatter) carries only name / description / displayName /
 * shortDescription / source / scope / libraryID? — NO category, NO tags.
 * Category + tags exist ONLY on `.library` catalog entries (library.ts), as
 * free-text strings curated per skill, not a closed enum — real catalog
 * fixtures show values as unremarkable as ["test"] or [].
 *
 * So an installed skill only has a category when it links back to a still-
 * resolvable library entry via `libraryID` (the same lookup the real drawer
 * already does for name/summary). When it doesn't — custom-authored, built
 * into Buddy, externally detected, or a withdrawn library entry — the chip
 * falls back to `source` rendered as text (custom / library / system /
 * external), exactly like the shipped drawer's own `sourceLabel()` helper.
 * That's a real, bounded, 4-value field — not a new lookup table to maintain.
 *
 * Flip "Live catalog" on (needs a connected directory) to render this against
 * the real installed + library lists instead of the illustrative fixture.
 */

const DRAWER_WIDTH_PX = 404

// ─── Domain ────────────────────────────────────────────────────────────────

type Family = "purple" | "cyan" | "mint" | "orange" | "lime" | "pink"
const FAMILIES: Family[] = ["purple", "cyan", "mint", "orange", "lime", "pink"]

/**
 * The control the row carries. Installed skills toggle a permission; library
 * skills install / update / are-already-installed — mirroring InstalledToggle
 * and LibraryActionControl in the real drawer.
 */
type RowControl =
  | { kind: "toggle"; enabled: boolean }
  | { kind: "install" }
  | { kind: "installed" }
  | { kind: "update" }

type SkillCard = {
  id: string
  name: string
  description: string
  tags: string[]
  /** Real catalog category text, when one resolves. Never invented. */
  category?: string
  /** Real `source` field as text — the fallback chip for installed skills with no category. */
  sourceLabel?: string
  control: RowControl
}

type Tab = "installed" | "discover"

const AVATAR_SURFACE = {
  purple: "bg-avatar-background-purple text-avatar-text-purple",
  cyan: "bg-avatar-background-cyan text-avatar-text-cyan",
  mint: "bg-avatar-background-mint text-avatar-text-mint",
  orange: "bg-avatar-background-orange text-avatar-text-orange",
  lime: "bg-avatar-background-lime text-avatar-text-lime",
  pink: "bg-avatar-background-pink text-avatar-text-pink",
} satisfies Record<Family, string>

/** Deterministic, zero-maintenance colour assignment — no per-item curation, ever. */
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

/** The chip a row actually earns: real category first, real source second, nothing invented. */
function chipLabel(card: SkillCard): string | undefined {
  return card.category ?? card.sourceLabel
}

// Real, bounded 4-value field — matches the shipped drawer's own sourceLabel().
const SOURCE_TEXT = {
  custom: "Custom skill",
  system: "Built into Buddy",
  library: "From your library",
  external: "External integration",
} satisfies Record<InstalledSkillInfo["source"], string>

/** Prefers a resolved library category; falls back to the guaranteed `source` field. */
function categoryForInstalledSkill(
  skill: InstalledSkillInfo,
  libraryByID: ReadonlyMap<string, SkillLibraryEntry>,
): string | undefined {
  const libraryEntry = skill.libraryID ? libraryByID.get(skill.libraryID) : undefined
  const raw = libraryEntry?.categories[0]
  return raw ? capitalize(raw.trim()) : undefined
}

function tagsForInstalledSkill(
  skill: InstalledSkillInfo,
  libraryByID: ReadonlyMap<string, SkillLibraryEntry>,
): string[] {
  const libraryEntry = skill.libraryID ? libraryByID.get(skill.libraryID) : undefined
  return libraryEntry?.tags ?? []
}

// ─── Fixture ────────────────────────────────────────────────────────────────
// The skills from the screenshot, in the drawer's alphabetical order. Most
// carry an illustrative category; two are deliberately given only a source
// label instead, so the fallback path the caveat above describes is visible
// even with "Live catalog" off.

type FixtureSkill = {
  id: string
  name: string
  description: string
  tags: string[]
} & ({ category: string } | { sourceLabel: string })

function toFixtureCard(skill: FixtureSkill, control: RowControl): SkillCard {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    tags: skill.tags,
    category: "category" in skill ? skill.category : undefined,
    sourceLabel: "sourceLabel" in skill ? skill.sourceLabel : undefined,
    control,
  }
}

const FIXTURE_SKILLS: FixtureSkill[] = [
  {
    id: "arxiv",
    name: "arXiv Research",
    description: "Search arXiv papers by keyword, author, category, or ID.",
    category: "Research",
    tags: ["papers", "science"],
  },
  {
    id: "blogwatcher",
    name: "Blogwatcher",
    description: "Monitor blogs and RSS/Atom feeds via blogwatcher-cli.",
    category: "Web",
    tags: ["rss", "monitoring"],
  },
  {
    id: "concept-diagrams",
    name: "Concept Diagrams",
    description: "Flat, minimal light/dark-aware SVG diagrams as standalone HTML.",
    category: "Diagrams",
    tags: ["svg", "visuals"],
  },
  {
    id: "creative-ideation",
    name: "Creative Ideation",
    description: "Generate ideas via named methods from creative practice.",
    category: "Ideation",
    tags: ["brainstorm", "methods"],
  },
  {
    id: "docx",
    name: "DOCX",
    description: "Create, read, and edit DOCX files programmatically.",
    category: "Documents",
    tags: ["word", "files"],
  },
  {
    id: "duckduckgo",
    name: "DuckDuckGo Search",
    description: "Free web search — text, news, images, and videos. No API key.",
    category: "Web",
    tags: ["search", "free"],
  },
  {
    id: "excalidraw",
    name: "Excalidraw",
    description: "Hand-drawn Excalidraw JSON diagrams for arch, flow, and seq.",
    category: "Diagrams",
    tags: ["sketch", "json"],
  },
  {
    id: "jupyter",
    name: "Jupyter Live Kernel",
    description: "Iterative Python via a live Jupyter kernel.",
    category: "Code",
    tags: ["python", "compute"],
  },
  {
    id: "k12-differentiation",
    name: "K-12 Lesson Differentiation",
    description: "Differentiate a K-12 lesson into below / at / above grade tiers.",
    category: "Teaching",
    tags: ["k-12", "tiers"],
  },
  {
    id: "k12-planning",
    name: "K-12 Lesson Planning",
    description: "Build standards-aligned K-12 lesson plans and materials.",
    category: "Teaching",
    tags: ["k-12", "standards"],
  },
  {
    id: "manim",
    name: "Manim Video",
    description: "Manim CE animations — 3Blue1Brown-style math and algorithm videos.",
    category: "Media",
    tags: ["animation", "math"],
  },
  {
    id: "maps",
    name: "Maps",
    description: "Geocode, POIs, routes, and timezones via OpenStreetMap / OSRM.",
    category: "Maps",
    tags: ["osm", "routing"],
  },
  {
    id: "powerpoint",
    name: "PowerPoint Presentation",
    description: "Create, edit, inspect, and analyze PowerPoint presentations.",
    category: "Slides",
    tags: ["pptx", "slides"],
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

// Installed tab — a couple are switched off to show the "Off" state.
const DISABLED_INSTALLED = new Set(["duckduckgo", "maps"])

const FIXTURE_INSTALLED: SkillCard[] = FIXTURE_SKILLS.map((skill) =>
  toFixtureCard(skill, { kind: "toggle", enabled: !DISABLED_INSTALLED.has(skill.id) }),
)

// Discover tab — the two source-fallback fixtures aren't in Discover (custom
// / system skills don't appear in the library), so they're excluded here.
// Most are installable, a few already installed, one has an update. Installed
// / update float to the top, matching compareLibrarySkills.
const DISCOVER_STATE = new Map<
  string,
  Extract<RowControl, { kind: "install" | "installed" | "update" }>["kind"]
>(Object.entries({
  arxiv: "installed",
  docx: "installed",
  powerpoint: "installed",
  excalidraw: "update",
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

// ─── Live catalog adapters ──────────────────────────────────────────────────

function toInstalledCard(
  skill: InstalledSkillInfo,
  libraryByID: ReadonlyMap<string, SkillLibraryEntry>,
): SkillCard {
  const category = categoryForInstalledSkill(skill, libraryByID)
  return {
    id: skill.name,
    name: skill.displayName,
    description: skill.shortDescription,
    tags: tagsForInstalledSkill(skill, libraryByID),
    category,
    sourceLabel: category ? undefined : SOURCE_TEXT[skill.source],
    control: { kind: "toggle", enabled: skill.permissionAction !== "deny" },
  }
}

function libraryControl(entry: SkillLibraryEntry): RowControl {
  if (entry.state === "installed") return { kind: "installed" }
  if (entry.state === "update_available") return { kind: "update" }
  return { kind: "install" }
}

function toDiscoverCard(entry: SkillLibraryEntry): SkillCard {
  const raw = entry.categories[0]
  return {
    id: entry.id,
    name: entry.displayName,
    description: entry.summary,
    tags: entry.tags,
    category: raw ? capitalize(raw.trim()) : undefined,
    control: libraryControl(entry),
  }
}

function libraryEntryRank(entry: SkillLibraryEntry): number {
  return entry.state === "available" ? 1 : 0
}

// ─── Shared parts ──────────────────────────────────────────────────────────

/** The icon-free anchor: initials + a hash-derived colour. No mapping table, ever. */
function Monogram(props: { card: SkillCard; className?: string; textClassName?: string }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg font-semibold",
        AVATAR_SURFACE[familyForID(props.card.id)],
        props.className,
      )}
    >
      <span className={cn("text-xs", props.textClassName)}>{initialsForName(props.card.name)}</span>
    </span>
  )
}

/** Text-only chip — renders nothing when the catalog has no category or source to show. */
function Chip(props: { card: SkillCard }) {
  const label = chipLabel(props.card)
  if (!label) return null
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium",
        AVATAR_SURFACE[familyForID(props.card.id)],
      )}
    >
      {label}
    </span>
  )
}

function TagChip(props: { tag: string }) {
  return (
    <span className="rounded bg-surface-raised-base px-1.5 py-0.5 text-[10px] text-text-weak">
      {props.tag}
    </span>
  )
}

/** Interactive so toggles actually flip in the prototype; seeds from the fixture/live value. */
function DemoSwitch(props: { defaultOn: boolean; labeled?: boolean }) {
  const [on, setOn] = useState(props.defaultOn)
  return (
    <div className="flex shrink-0 items-center justify-end gap-2">
      {props.labeled ? (
        <span className="w-5 text-right text-xs text-text-weaker">{on ? "On" : "Off"}</span>
      ) : null}
      <Switch size="sm" checked={on} aria-label="Toggle skill" onCheckedChange={setOn} />
    </div>
  )
}

function ActionButton(props: {
  kind: Extract<RowControl, { kind: "install" | "installed" | "update" }>["kind"]
  className?: string
}) {
  if (props.kind === "installed") {
    return (
      <Button
        type="button"
        size="xs"
        variant="ghost"
        disabled
        className={cn("gap-1", props.className)}
      >
        <CheckIcon className="size-3.5" aria-hidden />
        Installed
      </Button>
    )
  }
  if (props.kind === "update") {
    return (
      <Button type="button" size="xs" variant="secondary" className={cn("gap-1", props.className)}>
        <RefreshCwIcon className="size-3.5" aria-hidden />
        Update
      </Button>
    )
  }
  return (
    <Button type="button" size="xs" variant="outline" className={cn("gap-1", props.className)}>
      <DownloadIcon className="size-3.5" aria-hidden />
      Install
    </Button>
  )
}

function renderControl(
  control: RowControl,
  options?: { labeled?: boolean; buttonClassName?: string },
): ReactNode {
  if (control.kind === "toggle") {
    return <DemoSwitch defaultOn={control.enabled} labeled={options?.labeled} />
  }
  return <ActionButton kind={control.kind} className={options?.buttonClassName} />
}

function PanelShell(props: {
  name: string
  density: string
  rationale: string
  tab: Tab
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
              value=""
              placeholder="Search skills..."
              aria-label="Search skills"
              className="pl-9"
            />
          </div>
        </div>

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

        <div className="scrollbar-hover min-h-0 flex-1 overflow-y-auto">{props.children}</div>
      </section>
    </div>
  )
}

// ─── Concept 0 · Today (control) ─────────────────────────────────────────────
// The shipped SkillsRailListRow: bold name, clamped grey summary, a control, and
// a <Separator/> between every row. Included so the flatness is visible next to
// the alternatives.

function Today(props: { items: SkillCard[]; tab: Tab }) {
  return (
    <PanelShell
      name="0 · Today"
      density="two-line rows"
      tab={props.tab}
      rationale="Control. Every skill is the same two lines of text plus a control, hairline-separated. Nothing anchors the eye and the toggle is the loudest thing on the row."
    >
      <div>
        {props.items.map((item, index) => (
          <Fragment key={item.id}>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start hover:bg-surface-base-hover">
              <button type="button" className="min-w-0 px-4 py-3 text-left outline-none">
                <span className="flex min-w-0 flex-col gap-1.5 py-0.5">
                  <span className="w-full truncate text-sm font-medium text-text-base">
                    {item.name}
                  </span>
                  <span className="line-clamp-2 w-full text-xs leading-snug text-text-weak">
                    {item.description}
                  </span>
                </span>
              </button>
              <div className="flex items-center px-4 py-3 pl-2">
                {renderControl(item.control, { labeled: true, buttonClassName: "w-24" })}
              </div>
            </div>
            {index < props.items.length - 1 ? <Separator /> : null}
          </Fragment>
        ))}
      </div>
    </PanelShell>
  )
}

// ─── Concept 1 · Calm list ───────────────────────────────────────────────────
// Smallest change, biggest payoff: a coloured monogram anchors every row, the
// description drops to one line, the toggle loses its "On" text, and the
// separators become quiet spacing. Same list, same density.

function CalmList(props: { items: SkillCard[]; tab: Tab }) {
  return (
    <PanelShell
      name="1 · Calm list"
      density="56px rows"
      tab={props.tab}
      rationale="Same list, three fixes: a coloured monogram anchors every row (initials + hash colour — no icon lookup, ever), the summary drops to one line, and the toggle loses its shouty label."
    >
      <ul className="flex flex-col gap-0.5 p-2">
        {props.items.map((item) => (
          <li key={item.id}>
            <div className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-base-hover">
              <Monogram card={item} className="size-9" />
              <button
                type="button"
                className="flex min-w-0 flex-1 flex-col items-start text-left outline-none"
              >
                <span className="w-full truncate text-sm font-medium text-text-base">
                  {item.name}
                </span>
                <span className="w-full truncate text-xs text-text-weaker">{item.description}</span>
              </button>
              {renderControl(item.control)}
            </div>
          </li>
        ))}
      </ul>
    </PanelShell>
  )
}

// ─── Concept 2 · Gallery ─────────────────────────────────────────────────────
// Two-column cards. The most visual direction — reads like an app store, and is
// the only one where the chip and the control both breathe. Installed skills
// put the switch top-right; library skills put the action in the footer.

function Gallery(props: { items: SkillCard[]; tab: Tab }) {
  return (
    <PanelShell
      name="2 · Gallery"
      density="2-column cards"
      tab={props.tab}
      rationale="Every skill becomes a card — monogram, name, summary, a chip when the catalog actually has a category or source to show. Reads like an app store; no fabricated data."
    >
      <div className="grid grid-cols-2 gap-2 p-3">
        {props.items.map((item) => (
          <div
            key={item.id}
            className="flex flex-col gap-2 rounded-xl border border-border-weaker-base bg-surface-base p-3 transition-colors hover:border-border-base"
          >
            <div className="flex items-start justify-between gap-2">
              <Monogram card={item} className="size-9" />
              {item.control.kind === "toggle" ? (
                <DemoSwitch defaultOn={item.control.enabled} />
              ) : null}
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="truncate text-sm font-medium text-text-base">{item.name}</span>
              <span className="line-clamp-2 text-xs leading-snug text-text-weak">
                {item.description}
              </span>
            </div>
            <div className="mt-auto flex items-center justify-between gap-2 pt-1">
              <Chip card={item} />
              {item.control.kind !== "toggle" ? <ActionButton kind={item.control.kind} /> : null}
            </div>
          </div>
        ))}
      </div>
    </PanelShell>
  )
}

// ─── Concept 3 · Grouped ─────────────────────────────────────────────────────
// Cluster skills under whatever chip label they actually earned — a real
// category, or a real source when there's no category. A long flat list
// becomes browsable, and uncategorised skills group by source instead of
// losing their anchor.

type SkillGroup = { label: string; items: SkillCard[] }

function buildGroups(items: SkillCard[]): SkillGroup[] {
  const groups = new Map<string, SkillCard[]>()
  for (const item of items) {
    const key = chipLabel(item) ?? "Other"
    const bucket = groups.get(key) ?? []
    bucket.push(item)
    groups.set(key, bucket)
  }
  return [...groups.entries()]
    .map(([label, groupItems]) => ({ label, items: groupItems }))
    .toSorted(
      (left, right) =>
        right.items.length - left.items.length || left.label.localeCompare(right.label),
    )
}

function Grouped(props: { items: SkillCard[]; tab: Tab }) {
  const groups = useMemo(() => buildGroups(props.items), [props.items])

  return (
    <PanelShell
      name="3 · Grouped"
      density="by category"
      tab={props.tab}
      rationale="The flat list becomes browsable: skills cluster under whatever they actually earned — a real category, or a real source when there's no category. Nothing here is invented."
    >
      <div className="flex flex-col gap-4 p-3">
        {groups.map((group) => (
          <section key={group.label}>
            <div className="flex items-center gap-2 px-1 pb-1.5">
              <span className="text-xs font-medium text-text-base">{group.label}</span>
              <span className="text-[11px] tabular-nums text-text-weaker">
                {group.items.length}
              </span>
              <span className="h-px flex-1 bg-border-weaker-base" />
            </div>
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <li key={item.id}>
                  <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-base-hover">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm text-text-base">{item.name}</span>
                      <span className="truncate text-xs text-text-weaker">{item.description}</span>
                    </span>
                    {renderControl(item.control)}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </PanelShell>
  )
}

// ─── Concept 4 · Marketplace ─────────────────────────────────────────────────
// Fewer rows, more of each: a big monogram, the chip inline with the name, the
// full summary, and a row of tags. Editorial and data-forward — best for
// browsing Discover. Rows with no real tags (most installed skills) simply
// render no tag row rather than inventing one.

function Marketplace(props: { items: SkillCard[]; tab: Tab }) {
  return (
    <PanelShell
      name="4 · Marketplace"
      density="rich rows"
      tab={props.tab}
      rationale="Fewer rows, more of each: a larger monogram, a chip inline with the name, the full summary, and tags where the catalog actually has them. Data-forward — best for browsing Discover."
    >
      <ul className="flex flex-col gap-2 p-3">
        {props.items.map((item) => (
          <li
            key={item.id}
            className="flex gap-3 rounded-xl border border-border-weaker-base bg-surface-base p-3 transition-colors hover:border-border-base"
          >
            <Monogram card={item} className="size-11" textClassName="text-sm" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-medium text-text-base">{item.name}</span>
                <Chip card={item} />
              </div>
              <span className="line-clamp-2 text-xs leading-snug text-text-weak">
                {item.description}
              </span>
              {item.tags.length > 0 ? (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {item.tags.map((tag) => (
                    <TagChip key={tag} tag={tag} />
                  ))}
                </div>
              ) : null}
            </div>
            <div className="flex shrink-0 items-start">{renderControl(item.control)}</div>
          </li>
        ))}
      </ul>
    </PanelShell>
  )
}

// ─── Stage ───────────────────────────────────────────────────────────────────

export function SkillsPanelRedesignsEasel(props: { directory?: string }) {
  const [tab, setTab] = useState<Tab>("installed")
  const [showControl, setShowControl] = useState(true)
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
        .map(toDiscoverCard),
    [catalog?.library],
  )

  const items = usingLive
    ? tab === "installed"
      ? liveInstalled
      : liveDiscover
    : tab === "installed"
      ? FIXTURE_INSTALLED
      : FIXTURE_DISCOVER

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-surface-inset-base">
      <div className="flex shrink-0 flex-wrap items-center gap-4 border-b border-border-weaker-base px-4 py-2">
        <div className="flex min-w-0 flex-col">
          <p className="text-xs font-medium text-text-base">Skills drawer · four directions</p>
          <p className="text-[11px] text-text-weaker">
            Icon-free: a hash-coloured monogram anchors every row instead of a per-category icon
            table. Live catalog = real installed/library data — chips show a real category when one
            resolves, else the real source (custom / built-in / library / external).
          </p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-4">
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
            htmlFor="skills-easel-live"
          >
            Live catalog
            <Switch
              id="skills-easel-live"
              size="sm"
              checked={usingLive}
              disabled={!liveAvailable}
              onCheckedChange={setLiveCatalog}
            />
          </label>
          <label
            className="flex items-center gap-2 text-xs text-text-weak"
            htmlFor="skills-easel-control"
          >
            Show control
            <Switch
              id="skills-easel-control"
              size="sm"
              checked={showControl}
              onCheckedChange={setShowControl}
            />
          </label>
          <Badge variant="outline">
            {items.length} {tab === "installed" ? "installed" : "in library"}
            {usingLive ? " · live" : " · fixture"}
          </Badge>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-x-auto">
        <div className="flex h-full min-h-0 items-stretch gap-6 p-4">
          {showControl ? <Today items={items} tab={tab} /> : null}
          <CalmList items={items} tab={tab} />
          <Gallery items={items} tab={tab} />
          <Grouped items={items} tab={tab} />
          <Marketplace items={items} tab={tab} />
        </div>
      </div>
    </div>
  )
}
