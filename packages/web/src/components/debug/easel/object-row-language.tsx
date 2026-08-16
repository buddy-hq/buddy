import { useState } from "react"
import { Badge, ToggleGroup, ToggleGroupItem, cn } from "@buddy/ui"
import { findCatalogID } from "./select-value"
import {
  ChevronRightIcon,
  FileTextIcon,
  ImagesIcon,
  Layers3Icon,
  ListChecksIcon,
  PanelsTopLeftIcon,
  PresentationIcon,
  WorkflowIcon,
  ZapIcon,
  type AppIcon,
} from "@/icons/app-icons"
import * as AppIcons from "@/icons/app-icons"

const FigureGlyph = AppIcons["ShapesIcon"]

/**
 * Easel · Inline object language
 *
 * One anatomy — visual slot, title, meta — across five variants that differ
 * only in how much the slot is allowed to COST: a free glyph, a cheap image,
 * or a real render. A kind contributes data, never layout.
 *
 * Every variant renders for every kind, including combinations the final
 * recommendation argues against, so the whole system can be mocked and
 * compared rather than taken on faith.
 */

type ObjectKind =
  | "resource"
  | "image"
  | "figure"
  | "mermaid"
  | "widget"
  | "question-set"
  | "flashcards"
  | "whiteboard"
  | "file"

/** sm/md are rows; card is preview + footer; tile is the 3:4 cover. */
type ObjectVariant = "sm" | "md" | "card" | "card-live" | "tile"

type CoverTone = "pdf" | "document" | "spreadsheet" | "presentation"

type RowVisual =
  | { type: "glyph" }
  | { type: "thumbnail" }
  | { type: "cover"; art: boolean; tone: CoverTone; extension: string }

type ObjectRowModel = {
  kind: ObjectKind
  visual: RowVisual
  title: string
  meta: string[]
  badge?: string
}

type EaselSection = "problem" | "shape" | "covers" | "kinds" | "transcript"

const SECTIONS: { id: EaselSection; label: string }[] = [
  { id: "problem", label: "1 · The drift" },
  { id: "shape", label: "2 · All variants" },
  { id: "covers", label: "3 · Covers" },
  { id: "kinds", label: "4 · Kind = data" },
  { id: "transcript", label: "5 · In transcript" },
]

const VARIANTS: { id: ObjectVariant; label: string }[] = [
  { id: "sm", label: "sm" },
  { id: "md", label: "md" },
  { id: "card", label: "card" },
  { id: "card-live", label: "card · live" },
  { id: "tile", label: "tile" },
]

const KIND_LABEL = {
  resource: "Resource",
  image: "Image",
  figure: "Figure",
  mermaid: "Diagram",
  widget: "Widget",
  "question-set": "Question set",
  flashcards: "Flashcards",
  whiteboard: "Whiteboard",
  file: "File",
} satisfies Record<ObjectKind, string>

const KIND_ICON = {
  resource: FileTextIcon,
  image: ImagesIcon,
  figure: FigureGlyph,
  mermaid: WorkflowIcon,
  widget: PanelsTopLeftIcon,
  "question-set": ListChecksIcon,
  flashcards: Layers3Icon,
  whiteboard: PresentationIcon,
  file: FileTextIcon,
} satisfies Record<ObjectKind, AppIcon>

const KIND_ACCENT = {
  resource: { surface: "bg-avatar-background-orange", text: "text-avatar-text-orange" },
  image: { surface: "bg-avatar-background-mint", text: "text-avatar-text-mint" },
  figure: { surface: "bg-avatar-background-lime", text: "text-avatar-text-lime" },
  mermaid: { surface: "bg-avatar-background-cyan", text: "text-avatar-text-cyan" },
  widget: { surface: "bg-avatar-background-purple", text: "text-avatar-text-purple" },
  "question-set": { surface: "bg-avatar-background-pink", text: "text-avatar-text-pink" },
  flashcards: { surface: "bg-avatar-background-lime", text: "text-avatar-text-lime" },
  whiteboard: { surface: "bg-avatar-background-cyan", text: "text-avatar-text-cyan" },
  file: { surface: "bg-avatar-background-orange", text: "text-avatar-text-orange" },
} satisfies Record<ObjectKind, { surface: string; text: string }>

const COVER_TONE_CLASS = {
  pdf: { hero: "bg-surface-critical-weak", accent: "text-icon-critical-base" },
  document: { hero: "bg-surface-info-weak", accent: "text-icon-info-base" },
  spreadsheet: { hero: "bg-surface-success-weak", accent: "text-icon-success-base" },
  presentation: { hero: "bg-surface-warning-weak", accent: "text-icon-warning-base" },
} satisfies Record<CoverTone, { hero: string; accent: string }>

const OBJECT_MODELS: ObjectRowModel[] = [
  {
    kind: "resource",
    visual: { type: "cover", art: true, tone: "pdf", extension: "pdf" },
    title: "The History of Western Education",
    meta: ["PDF", "324 pages"],
  },
  {
    kind: "image",
    visual: { type: "thumbnail" },
    title: "Mitochondrion cross-section",
    meta: ["Image", "1600 × 900"],
  },
  {
    kind: "figure",
    visual: { type: "thumbnail" },
    title: "Industrial Revolution timeline",
    meta: ["Figure", "8 items"],
  },
  {
    kind: "mermaid",
    visual: { type: "glyph" },
    title: "Cell division stages",
    meta: ["Diagram", "Flowchart"],
  },
  {
    kind: "widget",
    visual: { type: "glyph" },
    title: "Photo-Synth: Feed the Plant",
    meta: ["Desktop widget", "11 minutes ago"],
  },
  {
    kind: "question-set",
    visual: { type: "glyph" },
    title: "Chapter 4 review",
    meta: ["Question set", "6 questions"],
    badge: "Not started",
  },
  {
    kind: "flashcards",
    visual: { type: "glyph" },
    title: "Learning theories",
    meta: ["Flashcards", "32 cards"],
    badge: "12 due",
  },
  {
    kind: "whiteboard",
    visual: { type: "glyph" },
    title: "Chapter 4 working notes",
    meta: ["Whiteboard", "Edited today"],
  },
  {
    kind: "file",
    visual: { type: "glyph" },
    title: "lecture-notes.md",
    meta: ["Markdown", "12 KB"],
  },
]

function modelFor(kind: ObjectKind): ObjectRowModel {
  return OBJECT_MODELS.find((model) => model.kind === kind) ?? OBJECT_MODELS[0]!
}

function metaLine(model: ObjectRowModel): string {
  return model.meta.filter(Boolean).join(" · ")
}

/* ---------------------------------------------------------------------- */
/* Low-fidelity art. Stands in for thumbnails and real renders.            */
/* ---------------------------------------------------------------------- */

/** The preview composition for a card: accent surface, framed art inside. */
function CardArt(props: { kind: ObjectKind }) {
  const accent = KIND_ACCENT[props.kind]

  return (
    <div className={cn("flex size-full items-center justify-center p-3", accent.surface)}>
      <div className="flex size-full items-center justify-center overflow-hidden rounded-md border border-border-strong-base bg-background-base p-3">
        <KindArt kind={props.kind} accent={accent.text} />
      </div>
    </div>
  )
}

function KindArt(props: { kind: ObjectKind; accent: string }) {
  const { kind, accent } = props

  if (kind === "mermaid" || kind === "whiteboard") {
    return (
      <div className="relative size-full">
        <div
          className={cn("absolute left-2 top-2 h-6 w-16 rounded border-2 border-current", accent)}
        />
        <div className="absolute right-2 top-2 h-6 w-16 rounded border-2 border-border-weak-base" />
        <div
          className={cn(
            "absolute left-1/2 top-5 h-0.5 w-10 -translate-x-1/2",
            accent,
            "bg-current",
          )}
        />
        <div className="absolute bottom-2 left-1/2 h-6 w-20 -translate-x-1/2 rounded border-2 border-border-weak-base" />
      </div>
    )
  }

  if (kind === "image" || kind === "figure") {
    return (
      <div className="grid size-full grid-cols-3 gap-1.5">
        <div className={cn("rounded-sm bg-current opacity-70", accent)} />
        <div className="rounded-sm bg-border-weak-base" />
        <div className={cn("rounded-sm bg-current opacity-40", accent)} />
      </div>
    )
  }

  if (kind === "question-set") {
    return (
      <div className="flex size-full flex-col justify-center gap-1.5">
        <div className="h-1.5 w-3/4 rounded-full bg-border-weak-base" />
        <div className={cn("h-1.5 w-full rounded-full bg-current opacity-60", accent)} />
        <div className="h-1.5 w-5/6 rounded-full bg-border-weak-base" />
      </div>
    )
  }

  if (kind === "flashcards") {
    return (
      <div className="relative size-full">
        <div className="absolute inset-x-6 top-1 h-3 rounded-t border-2 border-b-0 border-border-weak-base" />
        <div
          className={cn(
            "absolute inset-x-2 bottom-1 top-4 rounded border-2 border-current opacity-70",
            accent,
          )}
        />
      </div>
    )
  }

  /* widget, resource, file — a small framed composition with one accent mass. */
  return (
    <div className="flex size-full items-end gap-2">
      <div className={cn("h-full w-1/3 rounded-sm bg-current opacity-70", accent)} />
      <div className="flex h-2/3 flex-1 flex-col justify-end gap-1.5">
        <div className="h-1.5 w-full rounded-full bg-border-weak-base" />
        <div className={cn("h-4 w-2/3 rounded-full bg-current opacity-50", accent)} />
      </div>
    </div>
  )
}

/** Small static thumbnail — the "cheap <img>" tier. */
function ThumbnailBlock(props: { kind: ObjectKind; className?: string }) {
  const accent = KIND_ACCENT[props.kind]

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-sm border border-border-weaker-base",
        accent.surface,
        props.className,
      )}
    >
      <div className={cn("absolute inset-x-0 bottom-0 h-1/2 bg-current opacity-40", accent.text)} />
      <div className={cn("absolute right-1 top-1 size-1.5 rounded-full bg-current", accent.text)} />
    </div>
  )
}

function CoverArtBlock(props: { tone: CoverTone; detailed: boolean }) {
  const tone = COVER_TONE_CLASS[props.tone]

  return (
    <div className={cn("flex size-full flex-col justify-between", tone.hero)}>
      <div className="flex flex-col gap-1 p-2">
        <div className="h-1 w-3/4 rounded-full bg-text-base/25" />
        {props.detailed ? <div className="h-1 w-1/2 rounded-full bg-text-base/15" /> : null}
      </div>
      <div className="flex items-end justify-center px-2 pb-2">
        <div className="h-1/2 w-2/3 rounded-t-full bg-text-base/20" />
      </div>
    </div>
  )
}

function CoverPlaceholderBlock(props: {
  hero: string
  accent: string
  label: string
  title: string
  icon: AppIcon
  detailed: boolean
}) {
  const Icon = props.icon

  if (!props.detailed) {
    return (
      <div className="flex size-full items-center justify-center bg-surface-raised-stronger">
        <Icon className="size-3.5 text-icon-base" aria-hidden />
      </div>
    )
  }

  return (
    <div className="grid size-full grid-rows-[minmax(0,3fr)_minmax(0,2fr)] bg-surface-raised-stronger">
      <div className={cn("flex min-h-0 items-center justify-center px-4 py-3", props.hero)}>
        <Icon className={cn("size-10", props.accent)} aria-hidden />
      </div>
      <div className="flex min-h-0 flex-col justify-center overflow-hidden border-t border-border-weaker-base bg-surface-raised-base px-3 py-2">
        <span className={cn("text-[10px] font-semibold uppercase tracking-[0.16em]", props.accent)}>
          {props.label}
        </span>
        <span className="mt-1.5 line-clamp-2 break-words text-[11px] font-medium leading-[1.4] text-text-stronger">
          {props.title}
        </span>
      </div>
    </div>
  )
}

/**
 * The 3:4 frame. Resources render their real cover artwork; every other kind
 * falls back to the synthesized placeholder so the tile can still be judged.
 */
function CoverBlock(props: { model: ObjectRowModel; detailed: boolean; className?: string }) {
  const { model } = props
  const cover = model.visual.type === "cover" ? model.visual : undefined
  const tone = cover ? COVER_TONE_CLASS[cover.tone] : undefined
  const accent = KIND_ACCENT[model.kind]

  return (
    <div
      className={cn(
        "relative overflow-hidden border border-border-weak-base bg-surface-raised-stronger shadow-sm",
        props.detailed ? "aspect-[3/4] rounded-xl" : "rounded-md",
        props.className,
      )}
    >
      {cover?.art && tone ? (
        <CoverArtBlock tone={cover.tone} detailed={props.detailed} />
      ) : (
        <CoverPlaceholderBlock
          hero={tone?.hero ?? accent.surface}
          accent={tone?.accent ?? accent.text}
          label={cover?.extension ?? KIND_LABEL[model.kind]}
          title={model.title}
          icon={KIND_ICON[model.kind]}
          detailed={props.detailed}
        />
      )}
    </div>
  )
}

/* ---------------------------------------------------------------------- */
/* The variants                                                            */
/* ---------------------------------------------------------------------- */

function RowVisualSlot(props: { model: ObjectRowModel; density: "sm" | "md" }) {
  const { model } = props
  const small = props.density === "sm"

  if (model.visual.type === "cover") {
    /* Portrait, because the file row's slot is already h-8 w-[26.6px]. */
    return (
      <CoverBlock
        model={model}
        detailed={false}
        className={cn("shrink-0", small ? "h-6 w-[1.125rem]" : "h-8 w-6")}
      />
    )
  }

  if (model.visual.type === "thumbnail" && !small) {
    return <ThumbnailBlock kind={model.kind} className="h-8 w-11 shrink-0" />
  }

  const Icon = KIND_ICON[model.kind]
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md border border-border-weaker-base bg-surface-raised-base text-icon-base",
        small ? "size-6" : "size-8",
      )}
    >
      <Icon className={small ? "size-3.5" : "size-4"} aria-hidden />
    </span>
  )
}

function ObjectRow(props: {
  model: ObjectRowModel
  density?: "sm" | "md"
  trailing?: "chevron"
  className?: string
}) {
  const density = props.density ?? "md"
  const meta = metaLine(props.model)

  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        "flex w-full min-w-0 cursor-pointer items-center gap-3 overflow-hidden rounded-xl border border-border-weaker-base bg-surface-base hover:bg-surface-raised-base",
        density === "sm" ? "min-h-9 px-2.5 py-1.5" : "min-h-14 px-3 py-2.5 shadow-sm",
        props.className,
      )}
    >
      <RowVisualSlot model={props.model} density={density} />
      <div className="flex min-w-0 flex-1 flex-col">
        <p
          className={cn(
            "truncate font-medium text-text-base",
            density === "sm" ? "text-[13px]" : "text-sm",
          )}
        >
          {props.model.title}
        </p>
        {density === "md" && meta ? (
          <p className="mt-0.5 truncate text-[11px] text-text-weak">{meta}</p>
        ) : null}
      </div>
      {density === "sm" ? (
        <span className="shrink-0 text-[11px] text-text-weaker">
          {KIND_LABEL[props.model.kind]}
        </span>
      ) : props.model.badge ? (
        <Badge variant="outline" className="shrink-0">
          {props.model.badge}
        </Badge>
      ) : null}
      {props.trailing === "chevron" ? (
        <ChevronRightIcon className="size-4 shrink-0 text-icon-base" aria-hidden />
      ) : null}
    </div>
  )
}

/**
 * card — preview area with a caption footer.
 *
 * The footer's leading element is a 16px TYPE GLYPH, not the row's 32px visual
 * slot: the preview above already carries the visual identity, so repeating a
 * thumbnail under it is redundant. That is the one place card is not literally
 * "the row as a footer".
 *
 * `allowLive` is opt-in per call site — the render budget belongs to the
 * layout, not to this component.
 */
function ObjectCardVariant(props: { model: ObjectRowModel; allowLive?: boolean }) {
  const Icon = KIND_ICON[props.model.kind]
  const accent = KIND_ACCENT[props.model.kind]

  return (
    <div className="group flex w-full min-w-0 cursor-pointer flex-col overflow-hidden rounded-lg border border-border-base bg-surface-raised-base text-left transition-colors hover:border-border-strong-base">
      <div className="relative aspect-video w-full">
        <CardArt kind={props.model.kind} />
        {props.allowLive ? (
          <span className="absolute bottom-1.5 right-1.5 flex items-center gap-0.5 rounded bg-background-base/85 px-1 py-px text-[10px] font-medium text-text-base">
            <ZapIcon className="size-2.5" aria-hidden />
            Live
          </span>
        ) : null}
      </div>
      <span className="flex items-start gap-2 border-t border-border-weaker-base px-2.5 py-2">
        <Icon className={cn("mt-0.5 size-4 shrink-0", accent.text)} aria-hidden />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="line-clamp-2 text-sm leading-snug text-text-base">
            {props.model.title}
          </span>
          <span className="truncate text-[11px] text-text-weaker">{metaLine(props.model)}</span>
        </span>
      </span>
    </div>
  )
}

const TILE_WIDTH_CLASS = "w-[9.5rem] max-w-full"

function ObjectTile(props: { model: ObjectRowModel }) {
  return (
    <div className={cn("flex shrink-0 flex-col gap-2", TILE_WIDTH_CLASS)}>
      <CoverBlock model={props.model} detailed />
    </div>
  )
}

/** The dispatcher every section renders through. */
function ObjectPresentation(props: { model: ObjectRowModel; variant: ObjectVariant }) {
  if (props.variant === "tile") return <ObjectTile model={props.model} />
  if (props.variant === "card") return <ObjectCardVariant model={props.model} />
  if (props.variant === "card-live") return <ObjectCardVariant model={props.model} allowLive />
  return <ObjectRow model={props.model} density={props.variant} />
}

/** tile is fixed-width and card is tall — both want a wrapping grid, not a column. */
function variantLayoutClass(variant: ObjectVariant): string {
  if (variant === "tile") return "flex flex-row flex-wrap items-start gap-3"
  if (variant === "card" || variant === "card-live") {
    return "grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
  }
  return "flex flex-col gap-3"
}

/* ---------------------------------------------------------------------- */
/* Framing                                                                 */
/* ---------------------------------------------------------------------- */

function Caption(props: { title: string; note: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-xs font-medium text-text-strong">{props.title}</p>
      <p className="text-[11px] leading-relaxed text-text-weak">{props.note}</p>
    </div>
  )
}

function Panel(props: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border-weaker-base bg-background-base p-4">
      {props.children}
    </div>
  )
}

function NoteBox(props: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border-interactive-base bg-surface-interactive-weak p-3">
      <p className="text-xs font-medium text-text-interactive-base">{props.title}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-text-base">{props.children}</p>
    </div>
  )
}

/* ---------------------------------------------------------------------- */
/* 1 · The drift                                                           */
/* ---------------------------------------------------------------------- */

function LegacyObjectCard() {
  return (
    <div className="flex w-full flex-col overflow-hidden rounded-xl bg-background-base shadow-sm ring-1 ring-border-base/50">
      <div className="flex items-center justify-between gap-4 border-b border-border-base/40 bg-surface-base px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 rounded-md border border-border-base/60 bg-background-base px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-weak">
            Questions
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-xs font-semibold text-text-base">Chapter 4 review</span>
            <span className="text-[11px] leading-tight text-text-weak">6 questions</span>
          </div>
        </div>
        <span className="size-2 shrink-0 rounded-full bg-surface-interactive-base" />
      </div>
      <div className="flex h-28 flex-col gap-2 p-3">
        <div className="h-2.5 w-3/4 rounded bg-surface-raised-base" />
        {["a", "b", "c"].map((option) => (
          <div
            key={option}
            className="flex items-center gap-2 rounded-md border border-border-weaker-base px-2 py-1.5"
          >
            <span className="size-2.5 shrink-0 rounded-full border border-border-base" />
            <span className="h-2 flex-1 rounded bg-surface-base" />
          </div>
        ))}
      </div>
    </div>
  )
}

function LegacyDrawerRow() {
  return (
    <div className="flex w-full items-center gap-2 rounded-md px-2 py-2 hover:bg-surface-raised-base">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border-weaker-base bg-surface-raised-base text-icon-base">
        <ListChecksIcon className="size-4" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
        <span className="w-full truncate text-sm text-text-base">Chapter 4 review</span>
        <span className="w-full truncate text-xs text-text-weaker">6 questions · Not started</span>
      </span>
      <Badge variant="outline">Not started</Badge>
      <ChevronRightIcon className="ml-auto size-4 text-icon-base" aria-hidden />
    </div>
  )
}

function DriftSection() {
  return (
    <div className="flex flex-col gap-5">
      <Caption
        title="Same object, three visual languages"
        note="Chapter 4 review as the transcript, the drawer, and the media tool each render it today. Different radius, border, type scale, visual box, and open affordance."
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[10px] text-text-weaker">object-card.tsx</span>
          <Panel>
            <LegacyObjectCard />
          </Panel>
        </div>
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[10px] text-text-weaker">
            right-workspace-drawer-ui.tsx
          </span>
          <Panel>
            <LegacyDrawerRow />
          </Panel>
        </div>
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[10px] text-text-weaker">renderers/file-media.tsx</span>
          <Panel>
            <ObjectRow model={modelFor("file")} />
          </Panel>
        </div>
      </div>
      <NoteBox title="These are approximations, not the real components">
        Hand-copied from the three sources so the drift is visible in one place. Importing the real
        three — the way error-card-preview imports the real AssistantErrorCard — is the next step if
        you want this section to be evidence rather than assertion.
      </NoteBox>
    </div>
  )
}

/* ---------------------------------------------------------------------- */
/* 2 · All five variants                                                   */
/* ---------------------------------------------------------------------- */

function VariantsSection() {
  const widget = modelFor("widget")
  const book = modelFor("resource")

  return (
    <div className="flex flex-col gap-5">
      <Caption
        title="Five variants, one anatomy, escalating spend"
        note="Visual slot + title + meta throughout. What changes is what the slot is allowed to cost: a free glyph, a cheap image, or a real render."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[10px] text-text-weaker">sm · receipt · glyph only</span>
          <Panel>
            <ObjectRow model={widget} density="sm" />
          </Panel>
        </div>
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[10px] text-text-weaker">md · default · thumb tier</span>
          <Panel>
            <ObjectRow model={widget} />
          </Panel>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[10px] text-text-weaker">card · static art</span>
          <Panel>
            <ObjectCardVariant model={widget} />
          </Panel>
        </div>
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[10px] text-text-weaker">card · allowLive</span>
          <Panel>
            <ObjectCardVariant model={widget} allowLive />
          </Panel>
        </div>
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[10px] text-text-weaker">tile · 3:4 cover</span>
          <Panel>
            <ObjectTile model={book} />
          </Panel>
        </div>
      </div>

      <NoteBox title="The budget belongs to the layout, not the component">
        &quot;Never mount the live surface&quot; was wrong — the creations easel already got this
        right. A live preview is allowed, but it costs a main-thread render (and for mermaid a
        render-record write), so the CALL SITE decides how many it can afford via allowLive. The
        bench receipt&apos;s budget is zero because a transcript can hold dozens; a freshly-created
        widget can afford one.
      </NoteBox>
    </div>
  )
}

/* ---------------------------------------------------------------------- */
/* 3 · Covers                                                              */
/* ---------------------------------------------------------------------- */

const SHELF_MODELS: ObjectRowModel[] = [
  {
    kind: "resource",
    visual: { type: "cover", art: true, tone: "pdf", extension: "pdf" },
    title: "The History of Western Education",
    meta: ["PDF", "324 pages"],
  },
  {
    kind: "resource",
    visual: { type: "cover", art: true, tone: "document", extension: "epub" },
    title: "How to Read a Book",
    meta: ["EPUB", "Ready"],
  },
  {
    kind: "resource",
    visual: { type: "cover", art: false, tone: "spreadsheet", extension: "xlsx" },
    title: "Enrolment data 1870–1920",
    meta: ["Spreadsheet", "4 sheets"],
  },
  {
    kind: "resource",
    visual: { type: "cover", art: false, tone: "presentation", extension: "pptx" },
    title: "Seminar deck",
    meta: ["Presentation", "18 slides"],
  },
]

function CoversSection() {
  const book = SHELF_MODELS[0]!

  return (
    <div className="flex flex-col gap-6">
      <Caption
        title="The cover is the visual slot, not a competing card"
        note="ResourceCover already has presentation=tile | thumbnail, and the real artwork from coverRelpath renders at both — only the frame radius and the fallback differ. The row costs books nothing."
      />

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[10px] text-text-weaker">tile · real artwork</span>
          <ObjectTile model={book} />
        </div>
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[10px] text-text-weaker">tile · synthesized</span>
          <ObjectTile model={SHELF_MODELS[2]!} />
        </div>
        <div className="flex min-w-[16rem] flex-1 flex-col gap-3">
          <span className="font-mono text-[10px] text-text-weaker">
            same book · md row, then sm receipt
          </span>
          <ObjectRow model={book} />
          <ObjectRow model={book} density="sm" />
          <p className="text-[11px] leading-relaxed text-text-weak">
            The slot stays portrait at every size — the media file row is already h-8 w-[26.6px], a
            cover-shaped box.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="font-mono text-[10px] text-text-weaker">
          ingest · arrival reads as a shelf
        </span>
        <Panel>
          <p className="mb-3 text-sm text-text-base">I pulled four sources into the workspace.</p>
          <div className="flex w-full flex-row flex-wrap items-start gap-3">
            {SHELF_MODELS.map((model) => (
              <ObjectTile key={model.title} model={model} />
            ))}
          </div>
        </Panel>
      </div>

      <NoteBox title="Arrival gets a tile, reference gets a row">
        Ingest is an arrival — a new object entering the workspace — so it keeps the shelf.
        bench_present is a reference, so it takes a row even for a book: the receipt strip stays
        uniform across kinds, and a column of covers would out-shout the assistant&apos;s own text.
        The descriptor is identical; only the caller&apos;s variant differs.
      </NoteBox>
    </div>
  )
}

/* ---------------------------------------------------------------------- */
/* 4 · Every kind through the selected variant                             */
/* ---------------------------------------------------------------------- */

function KindsSection(props: { variant: ObjectVariant }) {
  return (
    <div className="flex flex-col gap-5">
      <Caption
        title="Nine kinds, zero per-kind components"
        note="Each entry differs only in its descriptor: visual, title, meta, badge. Switch the variant above — including combinations the recommendation argues against, so you can see why."
      />
      <div className={variantLayoutClass(props.variant)}>
        {OBJECT_MODELS.map((model) => (
          <div key={model.kind} className="flex min-w-0 flex-col gap-1.5">
            <span className="font-mono text-[10px] text-text-weaker">{model.kind}</span>
            <ObjectPresentation model={model} variant={props.variant} />
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------- */
/* 5 · In transcript                                                       */
/* ---------------------------------------------------------------------- */

type TranscriptStep = { text: string; kind: ObjectKind }

const TRANSCRIPT_STEPS: TranscriptStep[] = [
  { text: "I pulled the chapter into the workspace so we can read it together.", kind: "resource" },
  { text: "Here's how the stages connect — I put the diagram on the Bench.", kind: "mermaid" },
  { text: "I built you something to play with.", kind: "widget" },
  { text: "Six questions to check what stuck. Open it when you're ready.", kind: "question-set" },
]

function TranscriptSection(props: { variant: ObjectVariant }) {
  return (
    <div className="flex flex-col gap-5">
      <Caption
        title="The open decision: how loud should a receipt be?"
        note="bench_present fires often. Switch the variant above and read the column as a whole — the question is whether the receipt reads as a pointer or competes with the assistant's own text."
      />
      <div className="mx-auto flex w-full max-w-xl flex-col gap-5 rounded-lg border border-border-weaker-base bg-background-base p-4">
        {TRANSCRIPT_STEPS.map((step) => (
          <div key={step.kind} className="flex flex-col gap-2">
            <p className="text-sm leading-relaxed text-text-base">{step.text}</p>
            <ObjectPresentation model={modelFor(step.kind)} variant={props.variant} />
          </div>
        ))}
        <p className="text-sm leading-relaxed text-text-base">
          Want me to start with the reading, or go straight to the questions?
        </p>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------- */

export function ObjectRowLanguageEasel() {
  const [section, setSection] = useState<EaselSection>("shape")
  const [variant, setVariant] = useState<ObjectVariant>("sm")
  const showsVariant = section === "kinds" || section === "transcript"

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background-base">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border-weaker-base px-3 py-1.5">
        <span className="text-xs font-medium text-text-base">Inline object language</span>
        <div className="h-3.5 w-px bg-border-weaker-base" />
        <ToggleGroup
          type="single"
          value={section}
          onValueChange={(value) => {
            const nextSection = findCatalogID(value, SECTIONS)
            if (nextSection) setSection(nextSection)
          }}
          variant="outline"
          size="sm"
        >
          {SECTIONS.map((item) => (
            <ToggleGroupItem key={item.id} value={item.id} className="text-xs">
              {item.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {showsVariant ? (
          <>
            <div className="h-3.5 w-px bg-border-weaker-base" />
            <ToggleGroup
              type="single"
              value={variant}
              onValueChange={(value) => {
                const nextVariant = findCatalogID(value, VARIANTS)
                if (nextVariant) setVariant(nextVariant)
              }}
              variant="outline"
              size="sm"
            >
              {VARIANTS.map((item) => (
                <ToggleGroupItem key={item.id} value={item.id} className="text-xs">
                  {item.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-surface-inset-base">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-6">
          {section === "problem" ? <DriftSection /> : null}
          {section === "shape" ? <VariantsSection /> : null}
          {section === "covers" ? <CoversSection /> : null}
          {section === "kinds" ? <KindsSection variant={variant} /> : null}
          {section === "transcript" ? <TranscriptSection variant={variant} /> : null}
        </div>
      </div>
    </div>
  )
}
