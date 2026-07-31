import { useDeferredValue, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Badge, Button, Input, cn } from "@buddy/ui"
import { parse } from "yaml"
import { SearchIcon } from "@/icons/app-icons"
import { resolveSkillIconURL } from "@/components/skills/skill-icon-assets"
import { skillsCatalogQueryOptions } from "@/state/skills-catalog-query"
import iconDesignSystemSource from "../../../../../../assets/skills/skill-icon-design-system.yaml?raw"

type SkillIconPlan = {
  id: string
  status: SkillIconStatus
  displayName: string
  purpose: string
  symbol: string
  material: string
  palette: string[]
  lockedPrompt?: string
}

type SkillIconStatus = "candidate" | "locked" | "planned"

type PaletteDefinition = {
  label: string
  reviewDescription: string
}

type SkillIconDesignSystem = {
  asset: {
    width: number
    visibleContentMax: number
    filenamePattern: string
  }
  palette: Readonly<Record<string, PaletteDefinition>>
  skills: SkillIconPlan[]
}

type AtlasFilter = "all" | SkillIconStatus

type PaletteSwatch = {
  label: string
  reviewDescription: string
  surfaceClassName: string
}

const PALETTE_SURFACES: Readonly<Record<string, string>> = {
  amber: "bg-avatar-background-orange",
  brick: "bg-avatar-background-pink",
  cobalt: "bg-avatar-background-cyan",
  coral: "bg-avatar-background-orange",
  cream: "bg-background-base",
  crimson: "bg-avatar-background-pink",
  evergreen: "bg-avatar-background-mint",
  indigo: "bg-avatar-background-purple",
  navy: "bg-avatar-background-cyan",
  plum: "bg-avatar-background-purple",
  slate: "bg-surface-raised-base",
  teal: "bg-avatar-background-mint",
  violet: "bg-avatar-background-purple",
}
const DEFAULT_PALETTE_SURFACE = "bg-surface-raised-base"
const FILENAME_ID_TOKEN = "{id}"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function requiredRecord(
  parent: Readonly<Record<string, unknown>>,
  key: string,
): Record<string, unknown> {
  const value = parent[key]
  if (!isRecord(value)) throw new Error(`Skill icon design system requires an object at ${key}`)
  return value
}

function requiredString(
  parent: Readonly<Record<string, unknown>>,
  key: string,
  context: string,
): string {
  const value = parent[key]
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Skill icon design system requires ${context}.${key}`)
  }
  return value
}

function requiredStringArray(
  parent: Readonly<Record<string, unknown>>,
  key: string,
  context: string,
): string[] {
  const value = parent[key]
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && item.trim())) {
    throw new Error(`Skill icon design system requires ${context}.${key} as strings`)
  }
  return value
}

function optionalString(
  parent: Readonly<Record<string, unknown>>,
  key: string,
  context: string,
): string | undefined {
  const value = parent[key]
  if (value === undefined) return undefined
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Skill icon design system requires ${context}.${key} as a string`)
  }
  return value
}

function skillIconStatus(
  parent: Readonly<Record<string, unknown>>,
  context: string,
): SkillIconStatus {
  const value = parent.status ?? "locked"
  if (value === "candidate" || value === "locked" || value === "planned") return value
  throw new Error(`Skill icon design system has invalid ${context}.status`)
}

function parseIconDesignSystem(source: string): SkillIconDesignSystem {
  const parsed: unknown = parse(source)
  if (!isRecord(parsed)) throw new Error("Skill icon design system must be an object")
  if (parsed.schemaVersion !== 1) throw new Error("Unsupported skill icon design system version")

  const assetSource = requiredRecord(parsed, "asset")
  const width = assetSource.width
  if (typeof width !== "number" || !Number.isInteger(width) || width <= 0) {
    throw new Error("Skill icon design system requires a positive asset.width")
  }
  const visibleContentMax = assetSource.visibleContentMax
  if (
    typeof visibleContentMax !== "number" ||
    !Number.isInteger(visibleContentMax) ||
    visibleContentMax <= 0 ||
    visibleContentMax > width
  ) {
    throw new Error("Skill icon design system requires asset.visibleContentMax within asset.width")
  }
  const filenamePattern = requiredString(assetSource, "filenamePattern", "asset")
  if (!filenamePattern.includes(FILENAME_ID_TOKEN)) {
    throw new Error(`Skill icon filename pattern must contain ${FILENAME_ID_TOKEN}`)
  }

  const paletteSource = requiredRecord(parsed, "palette")
  const paletteEntries: [string, PaletteDefinition][] = []
  for (const [key, value] of Object.entries(paletteSource)) {
    if (!isRecord(value)) throw new Error(`Skill icon palette ${key} must be an object`)
    paletteEntries.push([
      key,
      {
        label: requiredString(value, "label", `palette.${key}`),
        reviewDescription: requiredString(value, "reviewDescription", `palette.${key}`),
      },
    ])
  }
  const palette = Object.fromEntries(paletteEntries)

  const skillSource = parsed.skills
  if (!Array.isArray(skillSource)) throw new Error("Skill icon design system requires skills")
  const ids = new Set<string>()
  const skills = skillSource.map((value, index): SkillIconPlan => {
    if (!isRecord(value)) throw new Error(`Skill icon plan ${index} must be an object`)
    const context = `skills.${index}`
    const id = requiredString(value, "id", context)
    if (ids.has(id)) throw new Error(`Duplicate skill icon plan: ${id}`)
    ids.add(id)

    const skillPalette = requiredStringArray(value, "palette", context)
    for (const paletteKey of skillPalette) {
      if (!palette[paletteKey]) throw new Error(`Unknown palette ${paletteKey} on skill ${id}`)
    }

    const status = skillIconStatus(value, context)
    const lockedPrompt = optionalString(value, "lockedPrompt", context)
    if (status !== "locked" && lockedPrompt) {
      throw new Error(`Only locked skill icons may retain a lockedPrompt: ${id}`)
    }

    const plan: SkillIconPlan = {
      id,
      status,
      displayName: requiredString(value, "displayName", context),
      purpose: requiredString(value, "purpose", context),
      symbol: requiredString(value, "symbol", context),
      material: requiredString(value, "material", context),
      palette: skillPalette,
    }
    if (lockedPrompt) plan.lockedPrompt = lockedPrompt
    return plan
  })

  return { asset: { width, visibleContentMax, filenamePattern }, palette, skills }
}

function initialsForName(displayName: string): string {
  const words = displayName.split(/\s+/u).filter(Boolean)
  const initials = words.slice(0, 2).map((word) => word[0]?.toLocaleUpperCase() ?? "")
  return initials.join("") || "?"
}

function swatchesForPlan(plan: SkillIconPlan): PaletteSwatch[] {
  return plan.palette.flatMap((key) => {
    const definition = ICON_DESIGN_SYSTEM.palette[key]
    if (!definition) return []
    return [
      {
        label: definition.label,
        reviewDescription: definition.reviewDescription,
        surfaceClassName: PALETTE_SURFACES[key] ?? DEFAULT_PALETTE_SURFACE,
      },
    ]
  })
}

function matchesPlan(plan: SkillIconPlan, query: string): boolean {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  if (!normalizedQuery) return true

  const paletteTerms = plan.palette.flatMap((key) => {
    const definition = ICON_DESIGN_SYSTEM.palette[key]
    return definition ? [definition.label, definition.reviewDescription] : []
  })
  return [
    plan.id,
    plan.displayName,
    plan.purpose,
    plan.symbol,
    plan.material,
    ...paletteTerms,
  ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery))
}

function SkillIconPlaceholder(props: { displayName: string }) {
  return (
    <div className="flex size-full items-center justify-center p-6">
      <div className="relative flex size-full items-center justify-center rounded-[24%] border border-dashed border-border-strong-base bg-background-base shadow-sm">
        <span className="font-mono text-2xl font-semibold tracking-[-0.08em] text-text-weaker">
          {initialsForName(props.displayName)}
        </span>
        <span className="absolute inset-x-3 bottom-3 text-center text-[9px] font-medium uppercase tracking-[0.16em] text-text-weaker">
          Planned
        </span>
      </div>
    </div>
  )
}

function SkillIconCard(props: { plan: SkillIconPlan; iconURL?: string }) {
  const expectedFilename = ICON_DESIGN_SYSTEM.asset.filenamePattern.replace(
    FILENAME_ID_TOKEN,
    props.plan.id,
  )
  const swatches = swatchesForPlan(props.plan)
  const paletteLabel = swatches.map((swatch) => swatch.label).join(" + ")
  const statusLabel = props.iconURL ? props.plan.status : "planned"

  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border-weaker-base bg-background-base">
      <div className="relative aspect-square overflow-hidden border-b border-border-weaker-base bg-surface-inset-base">
        {props.iconURL ? (
          <img
            src={props.iconURL}
            alt={`${props.plan.displayName} skill icon`}
            className="size-full object-contain p-5"
            loading="lazy"
            decoding="async"
            width={ICON_DESIGN_SYSTEM.asset.width}
            height={ICON_DESIGN_SYSTEM.asset.width}
          />
        ) : (
          <SkillIconPlaceholder displayName={props.plan.displayName} />
        )}
        <Badge
          variant="outline"
          className={cn(
            "absolute right-2 top-2 border-none shadow-sm",
            statusLabel === "locked" && "bg-surface-success-weak text-text-success-base",
            statusLabel === "candidate" && "bg-surface-warning-weak text-text-warning-base",
            statusLabel === "planned" && "bg-background-base text-text-weaker",
          )}
        >
          {statusLabel === "locked"
            ? "Locked"
            : statusLabel === "candidate"
              ? "Candidate"
              : "Planned"}
        </Badge>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-text-strong">
            {props.plan.displayName}
          </h3>
          <p
            className="mt-0.5 truncate font-mono text-[10px] text-text-weaker"
            title={props.plan.id}
          >
            {props.plan.id}
          </p>
        </div>

        <p className="line-clamp-2 min-h-10 text-xs leading-5 text-text-weak">
          {props.plan.purpose}
        </p>

        <div className="mt-auto space-y-2 border-t border-border-weaker-base pt-3">
          <div className="flex items-start justify-between gap-3">
            <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.12em] text-text-weaker">
              Visual
            </span>
            <span className="line-clamp-2 text-right text-[11px] leading-4 text-text-base">
              {props.plan.symbol}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-text-weaker">
              Material
            </span>
            <span className="truncate text-right text-[11px] text-text-base">
              {props.plan.material}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-text-weaker">
              Palette
            </span>
            <div className="flex min-w-0 items-center gap-1.5" title={paletteLabel}>
              {swatches.map((swatch) => (
                <span
                  key={swatch.label}
                  aria-label={`${swatch.label}: ${swatch.reviewDescription}`}
                  className={cn(
                    "size-3 rounded-full border border-border-weak-base shadow-sm",
                    swatch.surfaceClassName,
                  )}
                />
              ))}
              <span className="max-w-24 truncate text-[11px] text-text-base">{paletteLabel}</span>
            </div>
          </div>
          <p className="truncate font-mono text-[9px] text-text-weaker" title={expectedFilename}>
            {expectedFilename}
          </p>
        </div>
      </div>
    </article>
  )
}

const ICON_DESIGN_SYSTEM = parseIconDesignSystem(iconDesignSystemSource)
const ICON_PLANS = ICON_DESIGN_SYSTEM.skills
const FILTERS: { id: AtlasFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "candidate", label: "Candidates" },
  { id: "locked", label: "Locked" },
  { id: "planned", label: "Planned" },
]

export function SkillIconAtlasEasel(props: { directory?: string }) {
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<AtlasFilter>("all")
  const deferredQuery = useDeferredValue(query)
  const catalogQuery = useQuery({
    ...skillsCatalogQueryOptions(props.directory ?? ""),
    enabled: Boolean(props.directory),
  })
  const catalogIconByID = new Map(
    (catalogQuery.data?.library ?? []).flatMap((entry) => {
      const url = resolveSkillIconURL(entry.icon)
      return url ? [[entry.id, url] as const] : []
    }),
  )
  const iconURLBySkillID: ReadonlyMap<string, string> = new Map(
    ICON_PLANS.flatMap((plan) => {
      const filename = ICON_DESIGN_SYSTEM.asset.filenamePattern.replace(FILENAME_ID_TOKEN, plan.id)
      const url = resolveSkillIconURL(filename) ?? catalogIconByID.get(plan.id)
      return url ? [[plan.id, url] as const] : []
    }),
  )
  const readyCount = ICON_PLANS.filter((plan) => iconURLBySkillID.has(plan.id)).length
  const visiblePlans = ICON_PLANS.filter((plan) => {
    const effectiveStatus = iconURLBySkillID.has(plan.id) ? plan.status : "planned"
    const matchesFilter = filter === "all" || filter === effectiveStatus
    return matchesFilter && matchesPlan(plan, deferredQuery)
  })

  return (
    <section className="flex size-full min-h-0 flex-col bg-background-base">
      <header className="shrink-0 border-b border-border-weaker-base px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold tracking-tight text-text-strong">
                Skill icon atlas
              </h2>
              <Badge variant="outline">{ICON_PLANS.length} skills</Badge>
            </div>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-text-weak">
              The design plan and packaged assets in one review surface. Visible content is
              normalized to {ICON_DESIGN_SYSTEM.asset.visibleContentMax}px on a{" "}
              {ICON_DESIGN_SYSTEM.asset.width}px canvas.
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-border-weaker-base bg-surface-inset-base px-3 py-2">
            <span className="font-mono text-lg font-semibold tabular-nums text-text-strong">
              {readyCount}/{ICON_PLANS.length}
            </span>
            <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-text-weaker">
              assets ready
            </span>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1 sm:max-w-sm">
            <SearchIcon
              aria-hidden
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-icon-base"
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search skill icon plans"
              placeholder="Search name, symbol, material, palette…"
              className="h-8 pl-8 text-xs"
            />
          </div>
          <div className="flex items-center rounded-lg border border-border-weaker-base bg-surface-inset-base p-0.5">
            {FILTERS.map((option) => (
              <Button
                key={option.id}
                type="button"
                variant="ghost"
                size="sm"
                aria-pressed={filter === option.id}
                className={cn(
                  "h-7 px-2.5 text-xs",
                  filter === option.id
                    ? "bg-background-base text-text-strong shadow-sm"
                    : "text-text-weak",
                )}
                onClick={() => setFilter(option.id)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto bg-surface-inset-base p-5">
        {visiblePlans.length > 0 ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-4">
            {visiblePlans.map((plan) => (
              <SkillIconCard key={plan.id} plan={plan} iconURL={iconURLBySkillID.get(plan.id)} />
            ))}
          </div>
        ) : (
          <div className="flex h-full min-h-64 items-center justify-center">
            <div className="max-w-sm text-center">
              <p className="text-sm font-medium text-text-strong">No matching icon plans</p>
              <p className="mt-1 text-xs text-text-weak">Try another search or status filter.</p>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
