import { createContext, useContext, useMemo, useState, type ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import { Badge, Button, Input, Switch, cn } from "@buddy/ui"
import { workspaceObjectsQueryOptions } from "@/state/workspace-objects-query"
import { relativeTime } from "@/components/layout/sidebar-helpers"
import {
  selectHtmlWidgetObjects,
  selectMediaLibraryObjects,
  selectMermaidObjects,
} from "@/components/layout/chat-left-sidebar/library-object-selectors"
import {
  CreationPreviewVisual,
  type CreationFeedItem,
} from "@/components/directory-chat/right-workspace-catalog-drawers"
import {
  AppWindowIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  Clock3Icon,
  ImageIcon,
  ImagesIcon,
  PencilRuler,
  PlayIcon,
  PlusIcon,
  SearchIcon,
  ShapesIcon,
  VideoIcon,
  WorkflowIcon,
  XIcon,
  ZapIcon,
} from "@/icons/app-icons"

/**
 * Easel · Creations drawer redesigns
 *
 * The drawer renders five object kinds — html-widget, mermaid, media-presentation,
 * figure, freeform-figure — through three generic glyphs, so a gallery of six
 * photos, a geometry figure and nineteen mermaid diagrams all read as the same
 * row. The artifact is already rendered on hover; these concepts pull that render
 * into the list and surface the per-kind facts the row currently throws away
 * (gallery item counts, video vs image, widget viewport, diagram type).
 *
 * All panels are pinned to RIGHT_WORKSPACE_DRAWER_WIDTH_PX (404).
 */

const DRAWER_WIDTH_PX = 404

// ─── Domain ────────────────────────────────────────────────────────────────

/** Mirrors the five object kinds CreationsDrawer actually selects. */
type Family = "widget" | "diagram" | "gallery" | "figure"

type ArtKind =
  // html-widget
  | "widget-plant"
  | "widget-fractions"
  // media-presentation
  | "photo-landscape"
  | "photo-micrograph"
  | "photo-specimen"
  | "video-lab"
  // figure (geometry)
  | "geometry-triangle"
  | "geometry-circle"
  // freeform-figure
  | "freeform-cell"
  | "freeform-watercycle"
  // mermaid
  | "block"
  | "requirement"
  | "journey"
  | "pie"
  | "state"
  | "class"
  | "flowchart"
  | "gitgraph"
  | "quadrant"
  | "timeline"
  | "mindmap"
  | "gantt"
  | "er"

type Creation = {
  id: string
  title: string
  family: Family
  /** Mermaid diagram type, figure flavour, or gallery layout. */
  typeLabel: string
  age: string
  art: ArtKind
  /** media-presentation only — items in the gallery. */
  itemCount?: number
  /** media-presentation only — the gallery leads with a video. */
  video?: boolean
  /** html-widget only — resolved viewport preset. */
  viewport?: string
  /**
   * Present when the row came from the live notebook. Carries the production
   * feed item so the thumbnail renders through the real CreationPreviewVisual
   * instead of the stand-in artwork.
   */
  live?: CreationFeedItem
}

/**
 * Maps a production feed item onto the view model.
 *
 * NOTE: objects.list returns BuddyObjectIndexItem, which carries only kind /
 * title / updatedAt / status — the per-kind `summary` (diagramType, itemCount,
 * layout, viewportPreset) lives on the manifest and is dropped when
 * buildObjectListFromScan builds the index. So the diagram type below is
 * recovered from the title prefix, which is good enough to compare layouts but
 * is NOT how this should ship. See the note in the easel header.
 */
function toCreation(item: CreationFeedItem): Creation {
  const base = {
    id: `${item.kind}:${item.object.objectID}`,
    title: item.object.title,
    age: formatAge(item.object.updatedAt),
    live: item,
  }

  if (item.kind === "widgets") {
    return { ...base, family: "widget", typeLabel: "Interactive", art: "widget-plant" }
  }

  if (item.kind === "diagrams") {
    const guessed = guessDiagramTypeFromTitle(item.object.title)
    return {
      ...base,
      family: "diagram",
      typeLabel: guessed ? formatDiagramType(guessed) : "Diagram",
      art: diagramArt(guessed),
    }
  }

  if (item.object.kind === "media-presentation") {
    return { ...base, family: "gallery", typeLabel: "Gallery", art: "photo-landscape" }
  }

  return {
    ...base,
    family: "figure",
    typeLabel: item.object.kind === "figure" ? "Geometry" : "Freeform",
    art: item.object.kind === "figure" ? "geometry-triangle" : "freeform-cell",
  }
}

/** Diagram titles are conventionally "Flowchart: Network routing". */
function guessDiagramTypeFromTitle(title: string): string | null {
  const match = /^([^:]{1,24}):/u.exec(title)
  return match?.[1]?.trim() ?? null
}

function capitalize(value: string): string {
  return value.charAt(0).toLocaleUpperCase() + value.slice(1)
}

/** "quadrantChart" → "Quadrant chart", "erDiagram" → "Er diagram". */
function formatDiagramType(value: string): string {
  const spaced = value.replace(/([a-z0-9])([A-Z])/gu, "$1 $2").replace(/[-_]/gu, " ")
  return capitalize(spaced.toLocaleLowerCase())
}

/** Fallback artwork per mermaid type, used when the live render is unavailable. */
function diagramArt(diagramType: string | null): ArtKind {
  const normalized = diagramType?.toLocaleLowerCase() ?? ""
  if (normalized.includes("pie")) return "pie"
  if (normalized.includes("gantt")) return "gantt"
  if (normalized.includes("timeline")) return "timeline"
  if (normalized.includes("mindmap")) return "mindmap"
  if (normalized.includes("state")) return "state"
  if (normalized.includes("class")) return "class"
  if (normalized.includes("er")) return "er"
  if (normalized.includes("journey")) return "journey"
  if (normalized.includes("quadrant")) return "quadrant"
  if (normalized.includes("git")) return "gitgraph"
  if (normalized.includes("block")) return "block"
  if (normalized.includes("requirement")) return "requirement"
  return "flowchart"
}

function formatAge(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return relativeTime(parsed.getTime())
}

const CREATIONS: Creation[] = [
  {
    id: "photo-synth",
    title: "Photo-Synth: Feed the Plant",
    family: "widget",
    typeLabel: "Interactive",
    age: "11 minutes ago",
    art: "widget-plant",
    viewport: "Desktop",
  },
  {
    id: "gallery-1",
    title: "Chloroplast micrographs",
    family: "gallery",
    typeLabel: "Grid",
    age: "1 hour ago",
    art: "photo-micrograph",
    itemCount: 6,
  },
  {
    id: "figure-1",
    title: "Right triangle with altitude",
    family: "figure",
    typeLabel: "Geometry",
    age: "3 hours ago",
    art: "geometry-triangle",
  },
  {
    id: "freeform-1",
    title: "Plant cell anatomy",
    family: "figure",
    typeLabel: "Freeform",
    age: "5 hours ago",
    art: "freeform-cell",
  },
  {
    id: "gallery-2",
    title: "Titration walkthrough",
    family: "gallery",
    typeLabel: "Single",
    age: "Yesterday",
    art: "video-lab",
    itemCount: 1,
    video: true,
  },
  {
    id: "widget-2",
    title: "Fraction Lab",
    family: "widget",
    typeLabel: "Interactive",
    age: "Yesterday",
    art: "widget-fractions",
    viewport: "Mobile",
  },
  {
    id: "freeform-2",
    title: "The water cycle",
    family: "figure",
    typeLabel: "Freeform",
    age: "Yesterday",
    art: "freeform-watercycle",
  },
  {
    id: "gallery-3",
    title: "Field trip photos",
    family: "gallery",
    typeLabel: "Strip",
    age: "2 days ago",
    art: "photo-landscape",
    itemCount: 14,
  },
  {
    id: "figure-2",
    title: "Unit circle reference",
    family: "figure",
    typeLabel: "Geometry",
    age: "2 days ago",
    art: "geometry-circle",
  },
  {
    id: "gallery-4",
    title: "Leaf specimen scans",
    family: "gallery",
    typeLabel: "Grid",
    age: "2 days ago",
    art: "photo-specimen",
    itemCount: 4,
  },
  {
    id: "block",
    title: "Block diagram: System architecture",
    family: "diagram",
    typeLabel: "Block",
    age: "2 days ago",
    art: "block",
  },
  {
    id: "requirement",
    title: "Requirement diagram: System requirements",
    family: "diagram",
    typeLabel: "Requirement",
    age: "2 days ago",
    art: "requirement",
  },
  {
    id: "journey-1",
    title: "Journey: Learning to code",
    family: "diagram",
    typeLabel: "Journey",
    age: "2 days ago",
    art: "journey",
  },
  {
    id: "pie-1",
    title: "Pie chart: Traffic sources",
    family: "diagram",
    typeLabel: "Pie",
    age: "2 days ago",
    art: "pie",
  },
  {
    id: "state-1",
    title: "State diagram: Order processing",
    family: "diagram",
    typeLabel: "State",
    age: "2 days ago",
    art: "state",
  },
  {
    id: "class-1",
    title: "Class diagram: Design patterns",
    family: "diagram",
    typeLabel: "Class",
    age: "2 days ago",
    art: "class",
  },
  {
    id: "flow-1",
    title: "Flowchart: Machine learning pipeline",
    family: "diagram",
    typeLabel: "Flowchart",
    age: "2 days ago",
    art: "flowchart",
  },
  {
    id: "flow-2",
    title: "Flowchart: Network routing",
    family: "diagram",
    typeLabel: "Flowchart",
    age: "2 days ago",
    art: "flowchart",
  },
  {
    id: "git",
    title: "Git graph: Feature branch workflow",
    family: "diagram",
    typeLabel: "Git graph",
    age: "2 days ago",
    art: "gitgraph",
  },
  {
    id: "quadrant",
    title: "Quadrant chart: Priority matrix",
    family: "diagram",
    typeLabel: "Quadrant",
    age: "2 days ago",
    art: "quadrant",
  },
  {
    id: "timeline",
    title: "Timeline: History of computing",
    family: "diagram",
    typeLabel: "Timeline",
    age: "2 days ago",
    art: "timeline",
  },
  {
    id: "mindmap",
    title: "Mindmap: Learning topics",
    family: "diagram",
    typeLabel: "Mindmap",
    age: "2 days ago",
    art: "mindmap",
  },
  {
    id: "gantt",
    title: "Gantt chart: Project timeline",
    family: "diagram",
    typeLabel: "Gantt",
    age: "2 days ago",
    art: "gantt",
  },
  {
    id: "er",
    title: "ER diagram: Blog database schema",
    family: "diagram",
    typeLabel: "ER",
    age: "2 days ago",
    art: "er",
  },
  {
    id: "state-2",
    title: "State diagram: Traffic light states",
    family: "diagram",
    typeLabel: "State",
    age: "2 days ago",
    art: "state",
  },
  {
    id: "class-2",
    title: "Class diagram: Simple OOP inheritance",
    family: "diagram",
    typeLabel: "Class",
    age: "2 days ago",
    art: "class",
  },
]

// ─── Miniature artwork ─────────────────────────────────────────────────────
// Stand-ins for the live render (mermaid SVG, widget iframe, figure SVG, media
// asset). Drawn to survive at 56px wide and hold up at 380px, since the
// concepts below reuse the same component at both extremes.

const ACCENT: Record<Family, string> = {
  widget: "text-avatar-text-purple",
  diagram: "text-avatar-text-cyan",
  gallery: "text-avatar-text-orange",
  figure: "text-avatar-text-mint",
}

const ACCENT_SURFACE: Record<Family, string> = {
  widget: "bg-avatar-background-purple",
  diagram: "bg-avatar-background-cyan",
  gallery: "bg-avatar-background-orange",
  figure: "bg-avatar-background-mint",
}

/** Scaffolding strokes stay neutral; the accent colour carries the payload. */
const LINE = "stroke-border-strong-base"
const FILL_MUTED = "fill-border-weak-base"

function Art(props: { kind: ArtKind; family: Family; className?: string }) {
  return (
    <svg
      viewBox="0 0 96 64"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
      className={cn("h-full w-full", ACCENT[props.family], props.className)}
    >
      <ArtBody kind={props.kind} />
    </svg>
  )
}

function ArtBody(props: { kind: ArtKind }) {
  switch (props.kind) {
    // ── html-widget ───────────────────────────────────────────────────────
    case "widget-plant":
      return (
        <g strokeWidth={2}>
          <rect x={4} y={4} width={88} height={56} rx={4} className={cn(LINE, "fill-background-base")} />
          <path d="M48 46V28" className="stroke-current" fill="none" />
          <path d="M48 32c-10 0-14-6-14-12 8 0 14 4 14 12z" className="fill-current" />
          <path d="M48 36c10 0 14-8 14-14-8 0-14 6-14 14z" className="fill-current opacity-60" />
          <path d="M38 46h20l-3 10H41z" className={cn(LINE, FILL_MUTED)} />
          <rect x={62} y={48} width={24} height={8} rx={4} className="fill-current" stroke="none" />
        </g>
      )

    case "widget-fractions":
      return (
        <g strokeWidth={2}>
          <rect x={4} y={4} width={88} height={56} rx={4} className={cn(LINE, "fill-background-base")} />
          <rect x={12} y={16} width={72} height={14} rx={2} className={cn(LINE, FILL_MUTED)} />
          <rect x={12} y={16} width={27} height={14} rx={2} className="fill-current" stroke="none" />
          <path d="M39 16v14M57 16v14M75 16v14" className={cn(LINE, "opacity-60")} />
          <rect x={12} y={38} width={72} height={14} rx={2} className={cn(LINE, FILL_MUTED)} />
          <rect x={12} y={38} width={48} height={14} rx={2} className="fill-current opacity-55" stroke="none" />
          <path d="M36 38v14M60 38v14" className={cn(LINE, "opacity-60")} />
        </g>
      )

    // ── media-presentation ────────────────────────────────────────────────
    case "photo-landscape":
      return (
        <g strokeWidth={2}>
          <rect x={4} y={6} width={88} height={52} rx={3} className={cn(LINE, FILL_MUTED)} />
          <circle cx={26} cy={22} r={7} className="fill-current" />
          <path d="M4 58l24-22 16 14 14-12 34 20z" className="fill-current opacity-55" />
          <rect x={4} y={6} width={88} height={52} rx={3} fill="none" className={LINE} />
        </g>
      )

    case "photo-micrograph":
      return (
        <g strokeWidth={2}>
          <rect x={4} y={6} width={88} height={52} rx={3} className={cn(LINE, FILL_MUTED)} />
          <g className="fill-current">
            <ellipse cx={26} cy={24} rx={11} ry={8} className="opacity-70" />
            <ellipse cx={58} cy={20} rx={9} ry={7} className="opacity-45" />
            <ellipse cx={44} cy={42} rx={12} ry={9} className="opacity-60" />
            <ellipse cx={74} cy={40} rx={8} ry={11} className="opacity-35" />
          </g>
          <circle cx={26} cy={24} r={3} className="fill-current" />
          <circle cx={44} cy={42} r={3} className="fill-current" />
          <rect x={4} y={6} width={88} height={52} rx={3} fill="none" className={LINE} />
        </g>
      )

    case "photo-specimen":
      return (
        <g strokeWidth={2}>
          <rect x={4} y={6} width={88} height={52} rx={3} className={cn(LINE, FILL_MUTED)} />
          <path
            d="M48 54c0-16 8-30 22-36-2 18-8 30-22 36z"
            className="fill-current opacity-70"
          />
          <path d="M48 54c0-16-8-30-22-36 2 18 8 30 22 36z" className="fill-current opacity-45" />
          <path d="M48 54V22" className="stroke-current" fill="none" />
          <rect x={4} y={6} width={88} height={52} rx={3} fill="none" className={LINE} />
        </g>
      )

    case "video-lab":
      return (
        <g strokeWidth={2}>
          <rect x={4} y={6} width={88} height={52} rx={3} className={cn(LINE, FILL_MUTED)} />
          <path d="M38 18h20l-2 16 8 16H32l8-16z" className="fill-current opacity-45" />
          <path d="M34 44h28l2 6H32z" className="fill-current" />
          <circle cx={48} cy={32} r={12} className="fill-background-base opacity-90" stroke="none" />
          <path d="M44 26l11 6-11 6z" className="fill-current" stroke="none" />
          <rect x={4} y={6} width={88} height={52} rx={3} fill="none" className={LINE} />
        </g>
      )

    // ── figure (geometry) ─────────────────────────────────────────────────
    case "geometry-triangle":
      return (
        <g strokeWidth={2} fill="none">
          <path d="M10 52h76L34 8z" className={cn("stroke-current", FILL_MUTED)} />
          <path d="M34 8v44" className={cn(LINE, "opacity-70")} strokeDasharray="4 3" />
          <path d="M34 46h6v6" className="stroke-current" />
          <circle cx={34} cy={8} r={3} className="fill-current" stroke="none" />
          <circle cx={10} cy={52} r={3} className="fill-current" stroke="none" />
          <circle cx={86} cy={52} r={3} className="fill-current" stroke="none" />
        </g>
      )

    case "geometry-circle":
      return (
        <g strokeWidth={2} fill="none">
          <circle cx={48} cy={32} r={24} className={cn("stroke-current", FILL_MUTED)} />
          <path d="M18 32h60M48 4v56" className={cn(LINE, "opacity-60")} />
          <path d="M48 32l17-17" className="stroke-current" />
          <path d="M60 32a12 12 0 0 0-3.5-8.5" className={cn("stroke-current", "opacity-60")} />
          <circle cx={65} cy={15} r={3.5} className="fill-current" stroke="none" />
        </g>
      )

    // ── freeform-figure ───────────────────────────────────────────────────
    case "freeform-cell":
      return (
        <g strokeWidth={2}>
          <rect x={8} y={10} width={80} height={44} rx={10} className={cn("stroke-current", FILL_MUTED)} fill="none" />
          <rect x={13} y={15} width={70} height={34} rx={7} className={cn(LINE, "opacity-50")} fill="none" />
          <ellipse cx={40} cy={32} rx={11} ry={9} className="fill-current opacity-70" />
          <circle cx={40} cy={32} r={3.5} className="fill-current" />
          <ellipse cx={66} cy={22} rx={7} ry={4} className="fill-current opacity-40" />
          <ellipse cx={70} cy={41} rx={6} ry={4} className="fill-current opacity-40" />
          <ellipse cx={22} cy={42} rx={5} ry={3.5} className="fill-current opacity-40" />
        </g>
      )

    case "freeform-watercycle":
      return (
        <g strokeWidth={2} fill="none">
          <path d="M22 22a9 9 0 0 1 17-3 7 7 0 0 1 10 3 8 8 0 0 1-1 15H24a8 8 0 0 1-2-15z" className="fill-current opacity-55" stroke="none" />
          <path d="M30 42v7M40 42v9M50 42v6" className="stroke-current" />
          <path d="M6 58h84" className={LINE} />
          <path d="M62 54c0-14 8-24 20-28" className={cn("stroke-current", "opacity-70")} strokeDasharray="4 3" />
          <path d="M78 24l4 2-1 5" className="stroke-current" />
          <path d="M6 58c8-6 16-6 24 0" className={cn(LINE, "opacity-60")} />
        </g>
      )

    // ── mermaid ───────────────────────────────────────────────────────────
    case "flowchart":
      return (
        <g strokeWidth={2} fill="none">
          <rect x={38} y={4} width={20} height={12} rx={2} className="fill-current" stroke="none" />
          <path d="M48 16v8M48 24H26v8M48 24h22v8" className={LINE} />
          <rect x={14} y={32} width={24} height={12} rx={2} className={cn(LINE, FILL_MUTED)} />
          <rect x={58} y={32} width={24} height={12} rx={2} className={cn(LINE, FILL_MUTED)} />
          <path d="M26 44v6h44v-6" className={LINE} />
          <rect x={58} y={50} width={24} height={10} rx={2} className={cn(LINE, FILL_MUTED)} />
        </g>
      )

    case "pie":
      return (
        <g>
          <circle cx={48} cy={32} r={24} className={FILL_MUTED} />
          <path d="M48 32V8a24 24 0 0 1 20.8 36z" className="fill-current" />
          <path d="M48 32l20.8 12A24 24 0 0 1 30 47z" className="fill-current opacity-50" />
          <circle cx={48} cy={32} r={24} fill="none" strokeWidth={2} className={LINE} />
        </g>
      )

    case "gantt":
      return (
        <g strokeWidth={2}>
          <path d="M6 12h84M6 26h84M6 40h84M6 54h84" className={cn(LINE, "opacity-25")} />
          <rect x={10} y={8} width={34} height={8} rx={4} className="fill-current" />
          <rect x={28} y={22} width={40} height={8} rx={4} className="fill-current opacity-60" />
          <rect x={46} y={36} width={26} height={8} rx={4} className="fill-current opacity-80" />
          <rect x={58} y={50} width={30} height={8} rx={4} className="fill-current opacity-40" />
        </g>
      )

    case "timeline":
      return (
        <g strokeWidth={2}>
          <path d="M6 32h84" className={LINE} />
          <circle cx={20} cy={32} r={5} className="fill-current" />
          <circle cx={44} cy={32} r={5} className="fill-current" />
          <circle cx={68} cy={32} r={5} className="fill-current" />
          <rect x={10} y={10} width={20} height={8} rx={2} className={FILL_MUTED} />
          <rect x={34} y={46} width={20} height={8} rx={2} className={FILL_MUTED} />
          <rect x={58} y={10} width={24} height={8} rx={2} className={FILL_MUTED} />
        </g>
      )

    case "mindmap":
      return (
        <g strokeWidth={2} fill="none">
          <path
            d="M48 32C36 32 34 14 22 14M48 32C36 32 34 50 22 50M48 32c12 0 14-14 26-14M48 32c12 0 14 14 26 14"
            className={LINE}
          />
          <ellipse cx={48} cy={32} rx={12} ry={9} className="fill-current" stroke="none" />
          <circle cx={18} cy={14} r={6} className={cn(LINE, FILL_MUTED)} />
          <circle cx={18} cy={50} r={6} className={cn(LINE, FILL_MUTED)} />
          <circle cx={78} cy={18} r={6} className={cn(LINE, FILL_MUTED)} />
          <circle cx={78} cy={46} r={6} className={cn(LINE, FILL_MUTED)} />
        </g>
      )

    case "state":
      return (
        <g strokeWidth={2} fill="none">
          <circle cx={12} cy={32} r={5} className="fill-current" stroke="none" />
          <path d="M17 32h13M62 32h12" className={LINE} />
          <rect x={30} y={22} width={32} height={20} rx={10} className={cn(LINE, FILL_MUTED)} />
          <circle cx={82} cy={32} r={7} className={LINE} />
          <circle cx={82} cy={32} r={3.5} className="fill-current" stroke="none" />
          <path d="M36 22a14 14 0 0 1 20 0" className={cn(LINE, "opacity-60")} />
        </g>
      )

    case "class":
      return (
        <g strokeWidth={2}>
          <rect x={32} y={4} width={32} height={22} rx={2} className={cn(LINE, FILL_MUTED)} />
          <path d="M32 12h32" className={LINE} />
          <rect x={32} y={4} width={32} height={8} rx={2} className="fill-current" stroke="none" />
          <path d="M48 26v8M48 34H20v8M48 34h28v8" className={LINE} fill="none" />
          <rect x={6} y={42} width={28} height={18} rx={2} className={cn(LINE, FILL_MUTED)} />
          <rect x={62} y={42} width={28} height={18} rx={2} className={cn(LINE, FILL_MUTED)} />
          <path d="M6 50h28M62 50h28" className={LINE} />
        </g>
      )

    case "er":
      return (
        <g strokeWidth={2}>
          <rect x={6} y={12} width={30} height={26} rx={2} className={cn(LINE, FILL_MUTED)} />
          <path d="M6 20h30M6 28h30" className={cn(LINE, "opacity-60")} />
          <rect x={60} y={26} width={30} height={26} rx={2} className={cn(LINE, FILL_MUTED)} />
          <path d="M60 34h30M60 42h30" className={cn(LINE, "opacity-60")} />
          <path d="M36 25h10l6 14h8" className={LINE} fill="none" />
          <circle cx={48} cy={32} r={4} className="fill-current" stroke="none" />
        </g>
      )

    case "journey":
      return (
        <g strokeWidth={2} fill="none">
          <path d="M8 46c14 0 12-26 26-26s12 20 26 20 12-18 28-18" className="stroke-current" />
          <circle cx={8} cy={46} r={4} className="fill-current" stroke="none" />
          <circle cx={34} cy={20} r={4} className="fill-current" stroke="none" />
          <circle cx={60} cy={40} r={4} className="fill-current" stroke="none" />
          <circle cx={88} cy={22} r={4} className="fill-current" stroke="none" />
          <path d="M6 58h84" className={cn(LINE, "opacity-40")} />
        </g>
      )

    case "quadrant":
      return (
        <g strokeWidth={2}>
          <rect x={8} y={6} width={80} height={52} rx={2} className={cn(LINE, FILL_MUTED)} />
          <path d="M48 6v52M8 32h80" className={LINE} />
          <circle cx={28} cy={20} r={4} className="fill-current opacity-50" />
          <circle cx={66} cy={17} r={5} className="fill-current" />
          <circle cx={72} cy={26} r={3.5} className="fill-current" />
          <circle cx={24} cy={45} r={3.5} className="fill-current opacity-50" />
          <circle cx={62} cy={47} r={4} className="fill-current opacity-70" />
        </g>
      )

    case "gitgraph":
      return (
        <g strokeWidth={2} fill="none">
          <path d="M8 44h80" className={LINE} />
          <path d="M28 44c0-12 6-16 16-16h28" className={cn(LINE, "opacity-70")} />
          <path d="M56 28c8 0 10 16 18 16" className={cn(LINE, "opacity-70")} />
          <circle cx={14} cy={44} r={5} className="fill-current" stroke="none" />
          <circle cx={38} cy={44} r={5} className="fill-current" stroke="none" />
          <circle cx={74} cy={44} r={5} className="fill-current" stroke="none" />
          <circle cx={50} cy={28} r={5} className={cn(LINE, "fill-background-base")} />
          <circle cx={68} cy={28} r={5} className={cn(LINE, "fill-background-base")} />
        </g>
      )

    case "block":
      return (
        <g strokeWidth={2}>
          <rect x={6} y={6} width={38} height={22} rx={2} className="fill-current" stroke="none" />
          <rect x={52} y={6} width={38} height={22} rx={2} className={cn(LINE, FILL_MUTED)} />
          <rect x={6} y={36} width={24} height={22} rx={2} className={cn(LINE, FILL_MUTED)} />
          <rect x={38} y={36} width={24} height={22} rx={2} className={cn(LINE, FILL_MUTED)} />
          <rect
            x={70}
            y={36}
            width={20}
            height={22}
            rx={2}
            className="fill-current opacity-60"
            stroke="none"
          />
        </g>
      )

    case "requirement":
      return (
        <g strokeWidth={2}>
          <rect x={10} y={6} width={44} height={24} rx={2} className={cn(LINE, FILL_MUTED)} />
          <path d="M10 14h44" className={cn(LINE, "opacity-60")} />
          <rect x={10} y={6} width={44} height={8} rx={2} className="fill-current" stroke="none" />
          <rect x={42} y={38} width={44} height={22} rx={2} className={cn(LINE, FILL_MUTED)} />
          <path d="M42 46h44" className={cn(LINE, "opacity-60")} />
          <path d="M32 30v10h10" className={LINE} fill="none" strokeDasharray="4 3" />
        </g>
      )
  }
}

// ─── Shared chrome ─────────────────────────────────────────────────────────

function familyIcon(family: Family) {
  if (family === "widget") return AppWindowIcon
  if (family === "gallery") return ImagesIcon
  if (family === "figure") return PencilRuler
  return WorkflowIcon
}

function familyLabel(family: Family): string {
  if (family === "widget") return "Widget"
  if (family === "gallery") return "Gallery"
  if (family === "figure") return "Figure"
  return "Diagram"
}

/**
 * The subtitle carries the kind-specific fact the shipped row drops: how many
 * photos are in the gallery, which viewport a widget targets, which mermaid
 * type a diagram is.
 */
function subtitle(item: Creation): string {
  if (item.family === "gallery") {
    // Never invent a count. itemCount is only known for fixtures; on live data
    // the objects index does not carry it, and defaulting to 1 renders a
    // confident "1 photo" on galleries that may hold fourteen.
    if (item.itemCount === undefined) return `Gallery · ${item.age}`
    const noun = item.video ? "video" : "photo"
    return `${item.itemCount} ${noun}${item.itemCount === 1 ? "" : "s"} · ${item.age}`
  }
  if (item.family === "widget") {
    return `${item.viewport ?? "Interactive"} widget · ${item.age}`
  }
  return `${item.typeLabel} ${familyLabel(item.family).toLowerCase()} · ${item.age}`
}

/**
 * Overlay on the thumbnail itself — a gallery reads as a stack with a count, a
 * video gets a play glyph, a widget gets a "live" marker. None of this is
 * recoverable from the current row.
 */
function ThumbBadge(props: { item: Creation; compact?: boolean }) {
  const { item } = props

  if (item.family === "gallery" && item.video) {
    return (
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="flex size-6 items-center justify-center rounded-full bg-background-base/85 text-text-strong">
          <PlayIcon className="size-3" aria-hidden />
        </span>
      </span>
    )
  }

  if (item.family === "gallery" && (item.itemCount ?? 0) > 1) {
    return (
      <span className="absolute bottom-0.5 right-0.5 flex items-center gap-0.5 rounded bg-background-base/85 px-1 py-px text-[10px] font-medium tabular-nums text-text-base">
        <ImageIcon className="size-2.5" aria-hidden />
        {item.itemCount}
      </span>
    )
  }

  if (item.family === "widget" && !props.compact) {
    return (
      <span className="absolute bottom-0.5 right-0.5 flex items-center gap-0.5 rounded bg-background-base/85 px-1 py-px text-[10px] font-medium text-text-base">
        <ZapIcon className="size-2.5" aria-hidden />
        Live
      </span>
    )
  }

  return null
}

/**
 * Directory for real previews. Set only when "Real previews" is on, and only
 * ever alongside the PREVIEW_CAP slice.
 *
 * Rendering CreationPreviewVisual is NOT free: a cold mermaid diagram does a
 * full browser render (main-thread) and then PUTs its render-record to warm the
 * server-side cache. That is fine one-at-a-time on hover, and fine in the real
 * drawer because RightWorkspaceVirtualList only mounts visible rows. This easel
 * does not virtualise and shows five panels at once, so it must cap instead.
 */
const DirectoryContext = createContext<string | undefined>(undefined)

/**
 * Galleries get a stacked-paper edge so multi-item objects read as plural.
 *
 * `allowLive` is opt-in per call site: each concept decides how many of its rows
 * may mount a real render, so the budget is a property of the layout rather than
 * a global slice.
 */
function Thumb(props: {
  item: Creation
  className: string
  padding?: string
  allowLive?: boolean
  /** Drops the thumb's own border and radius when a card already supplies them. */
  flush?: boolean
}) {
  const { item } = props
  const directory = useContext(DirectoryContext)
  const stacked = item.family === "gallery" && (item.itemCount ?? 0) > 1
  const live = props.allowLive && directory && item.live ? { directory, item: item.live } : undefined

  return (
    <span className={cn("relative shrink-0", props.className)}>
      {stacked ? (
        <>
          <span className="absolute inset-x-1.5 -top-1 h-2 rounded-t border border-b-0 border-border-weaker-base bg-surface-raised-base" />
          <span className="absolute inset-x-0.5 -top-0.5 h-2 rounded-t border border-b-0 border-border-weaker-base bg-surface-base" />
        </>
      ) : null}
      <span
        className={cn(
          "relative flex h-full w-full items-center justify-center overflow-hidden",
          props.flush ? undefined : "rounded border border-border-weaker-base",
          // The real render brings its own background; only the stand-in art
          // needs the family tint behind it.
          live ? "bg-background-base p-0" : cn(props.padding ?? "p-1", ACCENT_SURFACE[item.family]),
        )}
      >
        {live ? (
          <span className="pointer-events-none h-full w-full overflow-hidden [&_svg]:h-full [&_svg]:w-full">
            <CreationPreviewVisual directory={live.directory} item={live.item} />
          </span>
        ) : (
          <Art kind={item.art} family={item.family} />
        )}
        <ThumbBadge item={item} />
      </span>
    </span>
  )
}

function PanelShell(props: {
  name: string
  rationale: string
  density: string
  toolbar?: ReactNode
  searchValue?: string
  onSearchChange?: (value: string) => void
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
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-text-strong">
            Creations
          </h2>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="New creation">
            <PlusIcon aria-hidden />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Close Creations">
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
              readOnly={!props.onSearchChange}
              value={props.searchValue ?? ""}
              placeholder="Search creations..."
              aria-label="Search creations"
              className="pl-9"
              onChange={(event) => props.onSearchChange?.(event.target.value)}
            />
          </div>
        </div>

        {props.toolbar}

        <div className="min-h-0 flex-1 overflow-y-auto">{props.children}</div>
      </section>
    </div>
  )
}

function FilterBar() {
  return (
    <div className="flex shrink-0 items-center gap-2 px-3 py-2">
      <Button type="button" variant="outline" size="sm" className="gap-1.5">
        <ShapesIcon className="size-4" aria-hidden />
        All types
        <ChevronDownIcon className="size-4" aria-hidden />
      </Button>
      <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-text-weak">
        <Clock3Icon className="size-4" aria-hidden />
        Recent
      </span>
    </div>
  )
}

function SectionLabel(props: { children: ReactNode }) {
  return (
    <p className="px-1 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-text-weaker">
      {props.children}
    </p>
  )
}

// ─── Concept 1 · Contact sheet ─────────────────────────────────────────────
// Smallest change, biggest payoff: the 36px icon slot becomes a 56×40 render of
// the artifact, with the kind-specific overlay on top. Rows go 52 → 64px, so
// ~9 stay visible instead of ~11 — and every one is identifiable.

function ContactSheet(props: { items: Creation[] }) {
  return (
    <PanelShell
      name="1 · Contact sheet"
      density="64px rows"
      rationale="Icon slot becomes a live thumbnail; galleries stack and count their photos, videos get a play glyph, widgets read as live. Same list, same virtualiser."
      toolbar={<FilterBar />}
    >
      <div className="px-2 pb-3">
        <SectionLabel>Recent creations</SectionLabel>
        <ul className="flex flex-col gap-1">
          {props.items.map((item, index) => (
            <li key={item.id}>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-surface-base-hover"
              >
                <Thumb
                  item={item}
                  className="h-10 w-14"
                  allowLive={index < CONCEPT_LIVE_BUDGET}
                />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm text-text-base">{item.title}</span>
                  <span className="truncate text-xs text-text-weaker">{subtitle(item)}</span>
                </span>
                <ChevronRightIcon className="size-4 shrink-0 text-icon-base" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </PanelShell>
  )
}

// ─── Concept 2 · Mosaic ────────────────────────────────────────────────────
// Two columns of 4:3 tiles. Titles drop to two clamped lines beneath the art,
// so recognition is carried by shape. Highest artifacts-per-screen, and the
// only concept where photo galleries look like photo galleries.

function Mosaic(props: { items: Creation[] }) {
  return (
    <PanelShell
      name="2 · Mosaic"
      density="~2 rows per 190px"
      rationale="Grid of previews, title as caption. Photos and figures finally get room to be looked at; you find things by remembering what they looked like."
      toolbar={<FilterBar />}
    >
      <div className="px-3 pb-3">
        <SectionLabel>Recent creations</SectionLabel>
        <ul className="grid grid-cols-2 gap-x-2 gap-y-3">
          {props.items.map((item, index) => {
            const Icon = familyIcon(item.family)
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className="group flex w-full flex-col gap-1.5 rounded-lg p-1 text-left transition-colors hover:bg-surface-base-hover"
                >
                  <span className="relative w-full">
                    <Thumb
                      item={item}
                      className="block aspect-[4/3] w-full"
                      padding={item.family === "gallery" ? "p-0" : "p-3"}
                      allowLive={index < CONCEPT_LIVE_BUDGET}
                    />
                    <span className="absolute left-1.5 top-1.5 flex size-5 items-center justify-center rounded bg-background-base/85 text-icon-base">
                      <Icon className="size-3" aria-hidden />
                    </span>
                  </span>
                  <span className="flex flex-col gap-0.5 px-0.5">
                    <span className="line-clamp-2 text-xs leading-snug text-text-base">
                      {item.title}
                    </span>
                    <span className="truncate text-[11px] text-text-weaker">{subtitle(item)}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </PanelShell>
  )
}

// ─── Concept 3 · Shelves ───────────────────────────────────────────────────
// Group by kind, each group a horizontal filmstrip. Widgets, galleries and
// figures stop being buried under the mermaid tail, and duplicates ("Flowchart"
// ×2) sit side by side where the difference is visible. Replaces the type
// filter dropdown entirely.

type Shelf = { label: string; items: Creation[] }

const SHELF_ORDER = ["Widgets", "Galleries", "Figures"]

function shelfLabel(item: Creation): string {
  if (item.family === "widget") return "Widgets"
  if (item.family === "gallery") return "Galleries"
  if (item.family === "figure") return "Figures"
  return item.typeLabel
}

function buildShelves(items: Creation[]): Shelf[] {
  const groups = new Map<string, Shelf>()

  for (const item of items) {
    const label = shelfLabel(item)
    const shelf = groups.get(label) ?? { label, items: [] }
    shelf.items.push(item)
    groups.set(label, shelf)
  }

  return [...groups.values()].toSorted((left, right) => {
    const leftRank = SHELF_ORDER.indexOf(left.label)
    const rightRank = SHELF_ORDER.indexOf(right.label)
    if (leftRank !== rightRank) {
      return (
        (leftRank < 0 ? SHELF_ORDER.length : leftRank) -
        (rightRank < 0 ? SHELF_ORDER.length : rightRank)
      )
    }
    return right.items.length - left.items.length
  })
}

function Shelves(props: { items: Creation[] }) {
  const shelves = useMemo(() => buildShelves(props.items), [props.items])

  return (
    <PanelShell
      name="3 · Shelves"
      density="112px per kind"
      rationale="Grouped by kind — widgets, galleries and figures get their own shelf instead of drowning under nineteen diagrams. Each shelf scrolls sideways."
      toolbar={<FilterBar />}
    >
      <div className="flex flex-col gap-3 pb-3">
        {shelves.map((shelf, shelfIndex) => (
          <section key={shelf.label}>
            <div className="flex items-center justify-between gap-2 px-3 pb-1.5">
              <p className="text-xs font-medium text-text-base">{shelf.label}</p>
              <span className="text-[11px] tabular-nums text-text-weaker">{shelf.items.length}</span>
            </div>
            <ul className="flex gap-2 overflow-x-auto px-3 pb-1">
              {shelf.items.map((item, index) => (
                <li key={item.id} className="w-28 shrink-0">
                  <button type="button" className="flex w-full flex-col gap-1 rounded-md text-left">
                    {/* Budget spread across shelves rather than down one, so the
                        first few shelves each get a couple of live tiles. */}
                    <Thumb
                      item={item}
                      className="block aspect-[4/3] w-full"
                      padding={item.family === "gallery" ? "p-0" : "p-2"}
                      allowLive={shelfIndex < 3 && index < 2}
                    />
                    <span className="line-clamp-2 px-0.5 text-[11px] leading-snug text-text-weak">
                      {item.title.replace(/^[^:]+:\s*/u, "")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </PanelShell>
  )
}

// ─── Concept 4 · Peek ──────────────────────────────────────────────────────
// Compact rows at rest — denser than what ships today — but selecting one
// expands the preview inline instead of firing a popover over the chat. Kills
// the hover-timer machinery (prefetch/open/close timers, popover positioning)
// and makes the preview keyboard-reachable.

function Peek(props: { items: Creation[] }) {
  const [openID, setOpenID] = useState<string>("gallery-1")

  return (
    <PanelShell
      name="4 · Peek"
      density="44px rows · 200px expanded"
      rationale="Denser than today at rest. The hover popover becomes an inline expansion — no floating panel over the chat, no hover timers, and it works from the keyboard."
      toolbar={<FilterBar />}
    >
      <div className="px-2 pb-3">
        <SectionLabel>Recent creations</SectionLabel>
        <ul className="flex flex-col">
          {props.items.map((item) => {
            const Icon = item.video ? VideoIcon : familyIcon(item.family)
            const open = openID === item.id

            return (
              <li key={item.id}>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenID(open ? "" : item.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-base-hover",
                    open && "bg-surface-raised-base",
                  )}
                >
                  <Icon
                    className={cn("size-4 shrink-0", open ? ACCENT[item.family] : "text-icon-base")}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-text-base">
                    {item.title}
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-text-weaker">
                    {item.family === "gallery" ? `${item.itemCount}` : item.typeLabel}
                  </span>
                  <ChevronDownIcon
                    className={cn(
                      "size-4 shrink-0 text-icon-base transition-transform",
                      open && "rotate-180",
                    )}
                    aria-hidden
                  />
                </button>

                {open ? (
                  <div className="px-2 pb-2 pt-1">
                    {/* Peek only ever renders the one expanded row. */}
                    <Thumb
                      item={item}
                      className="block aspect-video w-full"
                      padding={item.family === "gallery" ? "p-0" : "p-4"}
                      allowLive
                    />
                    <div className="flex items-center gap-2 pt-2">
                      <Button type="button" size="sm" className="gap-1.5">
                        <PlayIcon className="size-3.5" aria-hidden />
                        Open on Bench
                      </Button>
                      <span className="text-[11px] text-text-weaker">{subtitle(item)}</span>
                    </div>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      </div>
    </PanelShell>
  )
}

// ─── Concept 5 · Split density ─────────────────────────────────────────────
// The recognition argument, taken seriously: a preview only earns its cost when
// it can separate two objects of the SAME type, which needs ~140px+ of width.
// Below that a render conveys less than a type glyph does. So spend the pixels
// on the handful of things you actually return to, and let the tail be a fast,
// scannable index.
//
// Render budget is 3 — constant at 20 objects or 1298 — because it is a property
// of the layout, not of the notebook.

const SPLIT_RECENT_COUNT = 3
/** Prototype only: the tail is plain rows, but no need to lay out 1298 of them. */
const SPLIT_TAIL_PREVIEW = 50
/** Live image thumbs in the tail — cheap (<img>), but still one view fetch each. */
const SPLIT_TAIL_LIVE_BUDGET = 24

/**
 * Whether a 56px thumbnail is worth showing for this kind.
 *
 * Photos and figures survive downsampling — you recognise them by colour and
 * composition — and they cost an <img> at most. Diagrams and widgets do not:
 * at 56px a mermaid render is unreadable mush, and it costs a main-thread
 * render (plus a record write) or a live iframe to produce. Those get a type
 * glyph, which is both more legible at that size and free.
 */
function thumbnailEarnsItsSpace(family: Family): boolean {
  return family === "gallery" || family === "figure"
}

function Split(props: { items: Creation[] }) {
  const [search, setSearch] = useState("")
  const query = search.trim().toLocaleLowerCase()
  const matches = query
    ? props.items.filter((item) => item.title.toLocaleLowerCase().includes(query))
    : props.items

  // "Recent" is just the default query. Searching swaps the ranking but keeps
  // the shape: the top few hits get full previews, the rest stays an index.
  const featured = matches.slice(0, SPLIT_RECENT_COUNT)
  const earlier = matches.slice(SPLIT_RECENT_COUNT, SPLIT_RECENT_COUNT + SPLIT_TAIL_PREVIEW)

  return (
    <PanelShell
      name="5 · Split density"
      density="~240px featured · 64px tail"
      rationale="Top 3 of the current query get full previews — recency is just the default query, so search promotes its own hits. The tail is a contact sheet where a thumbnail is cheap and legible (photos, figures) and a type glyph where it isn't (diagrams, widgets)."
      toolbar={<FilterBar />}
      searchValue={search}
      onSearchChange={setSearch}
    >
      <div className="px-3 pb-3">
        <SectionLabel>{query ? "Top matches" : "Recent"}</SectionLabel>
        {matches.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs text-text-weaker">
            No creations match “{search}”.
          </p>
        ) : null}
        {/*
          Separation between cards (16px) must beat the spacing inside one
          (8px), or the caption reads as belonging to whichever preview it
          happens to sit nearer. The card border is what actually resolves it:
          preview and caption share one container, so the unit is unambiguous.
        */}
        <ul className="flex flex-col gap-4">
          {featured.map((item, index) => {
            const Icon = item.video ? VideoIcon : familyIcon(item.family)
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className="group flex w-full flex-col overflow-hidden rounded-lg border border-border-base bg-surface-raised-base text-left transition-colors hover:border-border-strong-base"
                >
                  {/* 364 × 205 inside the card at the real drawer width. */}
                  <Thumb
                    item={item}
                    className="block aspect-video w-full"
                    padding={item.family === "gallery" ? "p-0" : "p-3"}
                    allowLive={index < SPLIT_RECENT_COUNT}
                    flush
                  />
                  <span className="flex items-start gap-2 border-t border-border-weaker-base px-2.5 py-2">
                    <Icon
                      className={cn("mt-0.5 size-4 shrink-0", ACCENT[item.family])}
                      aria-hidden
                    />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="line-clamp-2 text-sm leading-snug text-text-base">
                        {item.title}
                      </span>
                      <span className="truncate text-[11px] text-text-weaker">
                        {subtitle(item)}
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>

        {earlier.length > 0 ? (
          <>
            <div className="flex items-center gap-2 pt-4">
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-weaker">
                {query ? "More matches" : "Earlier"}
              </p>
              <span className="h-px flex-1 bg-border-weaker-base" />
              <span className="text-[11px] tabular-nums text-text-weaker">
                {matches.length - featured.length}
              </span>
            </div>

            <ul className="flex flex-col gap-1 pt-1">
              {earlier.map((item, index) => {
                const Icon = item.video ? VideoIcon : familyIcon(item.family)
                const showThumb = thumbnailEarnsItsSpace(item.family)

                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 rounded-md px-1 py-2 text-left transition-colors hover:bg-surface-base-hover"
                    >
                      {showThumb ? (
                        <Thumb
                          item={item}
                          className="h-10 w-14"
                          padding={item.family === "gallery" ? "p-0" : "p-1"}
                          allowLive={index < SPLIT_TAIL_LIVE_BUDGET}
                        />
                      ) : (
                        <span
                          className={cn(
                            "flex h-10 w-14 shrink-0 items-center justify-center rounded border border-border-weaker-base",
                            ACCENT_SURFACE[item.family],
                          )}
                        >
                          <Icon className={cn("size-4", ACCENT[item.family])} aria-hidden />
                        </span>
                      )}
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-sm text-text-base">{item.title}</span>
                        <span className="truncate text-xs text-text-weaker">{subtitle(item)}</span>
                      </span>
                      <ChevronRightIcon className="size-4 shrink-0 text-icon-base" aria-hidden />
                    </button>
                  </li>
                )
              })}
            </ul>
          </>
        ) : null}
      </div>
    </PanelShell>
  )
}

// ─── Today (control) ───────────────────────────────────────────────────────

function Today(props: { items: Creation[] }) {
  return (
    <PanelShell
      name="0 · Today"
      density="52px rows"
      rationale="Control. Five object kinds through three glyphs: a 14-photo gallery, a geometry figure and a mermaid pie chart differ only by a title you have to read."
      toolbar={<FilterBar />}
    >
      <div className="px-2 pb-3">
        <SectionLabel>Recent creations</SectionLabel>
        <ul className="flex flex-col gap-1">
          {props.items.map((item) => {
            // Today's row collapses gallery + figure + freeform-figure into one
            // "Media"/"Figure" label and one icon.
            const Icon = item.family === "figure" ? ImagesIcon : familyIcon(item.family)
            const label = item.family === "gallery" ? "Media" : familyLabel(item.family)

            return (
              <li key={item.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-surface-base-hover"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border-weaker-base bg-surface-raised-base text-icon-base">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm text-text-base">{item.title}</span>
                    <span className="truncate text-xs text-text-weaker">
                      {`${label} · ${item.age}`}
                    </span>
                  </span>
                  <ChevronRightIcon className="size-4 shrink-0 text-icon-base" aria-hidden />
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </PanelShell>
  )
}

// ─── Stage ─────────────────────────────────────────────────────────────────

/**
 * Hard ceiling on rows when real previews are on. Five panels × this many is
 * the total number of live renders on screen, so keep it small: the stage does
 * not virtualise, and a cold mermaid render is a main-thread render plus a
 * render-record write.
 */
const PREVIEW_CAP = 60

/**
 * How many rows an all-rows layout (contact sheet, mosaic) may render live.
 * These layouts have no natural budget — every visible row wants a preview — so
 * the ceiling has to be imposed. Split and Peek set their own, lower, budgets
 * structurally and ignore this.
 */
const CONCEPT_LIVE_BUDGET = 6

export function CreationsPanelRedesignsEasel(props: { directory?: string }) {
  const [showControl, setShowControl] = useState(true)
  const [sparse, setSparse] = useState(false)
  const [live, setLive] = useState(false)
  // Opt-in, and never on by default: mounting CreationPreviewVisual for a whole
  // notebook is what melted the app (1298 objects × 5 panels, each cold diagram
  // doing a browser render + a PUT).
  const [realPreviews, setRealPreviews] = useState(false)

  const objectsQuery = useQuery({
    ...workspaceObjectsQueryOptions(props.directory ?? ""),
    enabled: Boolean(props.directory),
  })
  const widgets = selectHtmlWidgetObjects(objectsQuery)
  const diagrams = selectMermaidObjects(objectsQuery)
  const media = selectMediaLibraryObjects(objectsQuery)

  const liveItems = useMemo(() => {
    const combined: CreationFeedItem[] = [
      ...widgets.map((object): CreationFeedItem => ({ kind: "widgets", object })),
      ...diagrams.map((object): CreationFeedItem => ({ kind: "diagrams", object })),
      ...media.map((object): CreationFeedItem => ({ kind: "media", object })),
    ]
    return combined
      .toSorted((left, right) => right.object.updatedAt.localeCompare(left.object.updatedAt))
      .map(toCreation)
  }, [diagrams, media, widgets])

  const liveAvailable = Boolean(props.directory) && liveItems.length > 0
  const usingLive = live && liveAvailable
  const usingRealPreviews = realPreviews && usingLive
  const source = usingLive ? liveItems : CREATIONS
  const items = useMemo(() => {
    // The cap is enforced here, not at the render site, so no panel can ever
    // mount more live previews than the budget regardless of layout.
    if (usingRealPreviews) return source.slice(0, PREVIEW_CAP)
    return sparse ? source.slice(0, 5) : source
  }, [sparse, source, usingRealPreviews])

  return (
    <DirectoryContext.Provider value={usingRealPreviews ? props.directory : undefined}>
      <div className="flex h-full min-h-0 w-full flex-col bg-surface-inset-base">
        <div className="flex shrink-0 flex-wrap items-center gap-4 border-b border-border-weaker-base px-4 py-2">
          <div className="flex min-w-0 flex-col">
            <p className="text-xs font-medium text-text-base">Creations drawer · four directions</p>
            <p className="text-[11px] text-text-weaker">
              Live notebook = real titles and kinds. Real previews = the actual render, capped to{" "}
              {PREVIEW_CAP} rows because this stage does not virtualise.
            </p>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-text-weak" htmlFor="easel-live">
              Live notebook
              <Switch
                id="easel-live"
                size="sm"
                checked={usingLive}
                disabled={!liveAvailable}
                onCheckedChange={setLive}
              />
            </label>
            <label
              className="flex items-center gap-2 text-xs text-text-weak"
              htmlFor="easel-previews"
            >
              Real previews
              <Switch
                id="easel-previews"
                size="sm"
                checked={usingRealPreviews}
                disabled={!usingLive}
                onCheckedChange={setRealPreviews}
              />
            </label>
            <label
              className="flex items-center gap-2 text-xs text-text-weak"
              htmlFor="easel-control"
            >
              Show control
              <Switch
                id="easel-control"
                size="sm"
                checked={showControl}
                onCheckedChange={setShowControl}
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-text-weak" htmlFor="easel-sparse">
              Near-empty
              <Switch
                id="easel-sparse"
                size="sm"
                checked={sparse}
                disabled={usingRealPreviews}
                onCheckedChange={setSparse}
              />
            </label>
            <Badge variant="outline">
              {items.length}
              {usingRealPreviews ? ` of ${source.length} · capped` : usingLive ? " live" : " fixture"}
            </Badge>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-x-auto">
          <div className="flex h-full min-h-0 items-stretch gap-6 p-4">
            <Split items={items} />
            {showControl ? <Today items={items} /> : null}
            <ContactSheet items={items} />
            <Mosaic items={items} />
            <Shelves items={items} />
            <Peek items={items} />
          </div>
        </div>
      </div>
    </DirectoryContext.Provider>
  )
}
