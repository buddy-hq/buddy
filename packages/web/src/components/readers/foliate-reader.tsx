import {
  forwardRef,
  startTransition,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from "react"
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ScrollArea,
  Separator,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
} from "@buddy/ui"
import {
  BookOpenIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FileQuestionIcon,
  InfoIcon,
  LayoutPanelLeftIcon,
  Loader2Icon,
  MapIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  ScrollTextIcon,
} from "lucide-react"
import { ensureFoliateRuntimeCompat } from "@/lib/foliate/ensure-foliate-runtime-compat"
import type {
  FoliateBook,
  FoliateMetadata,
  FoliateNavigationTarget,
  FoliateRelocationDetail,
  FoliateTocItem,
  View as FoliateView,
} from "foliate-js/view.js"

ensureFoliateRuntimeCompat()

const DEFAULT_TITLE = "Untitled publication"
const DEFAULT_AUTHOR = "Unknown author"
const DEFAULT_EMPTY_MESSAGE = "Select a compatible ebook or PDF to preview it here."
const DEFAULT_ERROR_TITLE = "Unable to open publication"
const DEFAULT_ERROR_MESSAGE = "Buddy could not initialize the foliate renderer for this source."
const TOC_EMPTY_MESSAGE = "This publication does not expose a table of contents."
const DETAILS_EMPTY_MESSAGE = "Metadata is limited for this publication."
const FLOW_PAGINATED = "paginated"
const FLOW_SCROLLED = "scrolled"
const SIDEBAR_CONTENTS = "contents"
const SIDEBAR_DETAILS = "details"
const VIEW_ELEMENT_CLASS_NAME = "buddy-foliate-view"
const VIEWPORT_CLASS_NAME = "buddy-foliate-viewport"
const READER_MARGIN_PX = 56
const READER_MAX_INLINE_SIZE_PX = 780
const READER_MAX_BLOCK_SIZE_PX = 1600
const READER_GAP_PERCENT = 8
const READER_LINE_HEIGHT = 1.6
const READER_FONT_SIZE_REM = 1.02
const READER_SIDE_PANEL_WIDTH_CLASS = "lg:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)]"

type KnownMetadataFieldKey =
  | "publisher"
  | "language"
  | "subject"
  | "identifier"
  | "source"
  | "rights"
  | "description"

export type FoliateReaderFlow = typeof FLOW_PAGINATED | typeof FLOW_SCROLLED
type FoliateReaderSidebarTab = typeof SIDEBAR_CONTENTS | typeof SIDEBAR_DETAILS
export type FoliateReaderThemeId = "paper" | "sepia" | "night"
export type FoliateReaderSource =
  | {
      kind: "file"
      file: File
    }
  | {
      kind: "blob"
      blob: Blob
      name: string
    }
  | {
      kind: "url"
      url: string
      name?: string
    }
  | {
      kind: "book"
      book: FoliateBook
      name?: string
    }

export type FoliateReaderSnapshot = {
  title: string
  author: string
  formatLabel: string
  isFixedLayout: boolean
  toc: FoliateTocItem[]
  pageList: FoliateTocItem[]
  metadata?: FoliateMetadata
  coverUrl?: string
  fileName?: string
}

export type FoliateReaderLocation = {
  fraction?: number
  cfi?: string
  tocLabel?: string
  pageLabel?: string
  locationLabel?: string
}

export type FoliateReaderHandle = {
  next: () => Promise<void>
  prev: () => Promise<void>
  goTo: (target: FoliateNavigationTarget) => Promise<void>
  setTheme: (theme: FoliateReaderThemeId) => void
  setFlow: (flow: FoliateReaderFlow) => void
  getSnapshot: () => FoliateReaderSnapshot | null
}

export type FoliateReaderProps = {
  source: FoliateReaderSource | null
  className?: string
  initialLocation?: FoliateNavigationTarget
  defaultTheme?: FoliateReaderThemeId
  defaultFlow?: FoliateReaderFlow
  defaultSidebarTab?: FoliateReaderSidebarTab
  showSidebar?: boolean
  showToolbar?: boolean
  emptyState?: ReactNode
  onReady?: (snapshot: FoliateReaderSnapshot) => void
  onLocationChange?: (location: FoliateReaderLocation) => void
  onOpenExternalLink?: (href: string) => void
  onError?: (error: Error) => void
}

type FoliateReaderThemeDefinition = {
  id: FoliateReaderThemeId
  label: string
  shellClassName: string
  viewportClassName: string
  contentBackground: string
  contentForeground: string
  contentMuted: string
  contentLink: string
  pdfFilter: string
}

type MetadataFieldDefinition = {
  key: KnownMetadataFieldKey
  label: string
}

type MetadataRow = {
  key: string
  label: string
  value: string
}

const READER_THEMES: FoliateReaderThemeDefinition[] = [
  {
    id: "paper",
    label: "Paper",
    shellClassName:
      "bg-[radial-gradient(circle_at_top,color-mix(in_oklab,var(--surface-raised-stronger)_60%,transparent)_0%,transparent_48%),linear-gradient(180deg,var(--surface-raised-base)_0%,var(--surface-base)_100%)]",
    viewportClassName: "bg-surface-inset-base",
    contentBackground: "var(--background-base)",
    contentForeground: "var(--text-strong)",
    contentMuted: "var(--text-weak)",
    contentLink: "var(--text-interactive-base)",
    pdfFilter: "none",
  },
  {
    id: "sepia",
    label: "Sepia",
    shellClassName:
      "bg-[radial-gradient(circle_at_top,color-mix(in_oklab,var(--surface-warning-base)_16%,transparent)_0%,transparent_52%),linear-gradient(180deg,color-mix(in_oklab,var(--surface-warning-base)_6%,var(--surface-base))_0%,color-mix(in_oklab,var(--surface-warning-base)_11%,var(--surface-inset-base))_100%)]",
    viewportClassName:
      "bg-[color:color-mix(in_oklab,var(--surface-warning-base)_9%,var(--surface-inset-base))]",
    contentBackground: "color-mix(in oklab, var(--surface-warning-base) 11%, white)",
    contentForeground: "color-mix(in oklab, var(--text-strong) 88%, #3c2616)",
    contentMuted: "color-mix(in oklab, var(--text-weak) 82%, #725341)",
    contentLink: "color-mix(in oklab, var(--text-interactive-base) 78%, #8b4c1f)",
    pdfFilter: "sepia(0.22) saturate(0.92) brightness(0.98)",
  },
  {
    id: "night",
    label: "Night",
    shellClassName:
      "bg-[radial-gradient(circle_at_top,color-mix(in_oklab,var(--surface-info-base)_12%,transparent)_0%,transparent_44%),linear-gradient(180deg,color-mix(in_oklab,var(--surface-strong)_68%,black)_0%,color-mix(in_oklab,var(--surface-inset-strong)_78%,black)_100%)]",
    viewportClassName: "bg-surface-strong",
    contentBackground: "color-mix(in oklab, var(--surface-strong) 92%, black)",
    contentForeground: "color-mix(in oklab, var(--text-stronger) 88%, white)",
    contentMuted: "color-mix(in oklab, var(--text-weak) 88%, white)",
    contentLink: "color-mix(in oklab, var(--text-interactive-base) 76%, white)",
    pdfFilter: "invert(1) hue-rotate(180deg) brightness(0.88) contrast(1.04)",
  },
]

const METADATA_FIELDS: MetadataFieldDefinition[] = [
  { key: "publisher", label: "Publisher" },
  { key: "language", label: "Language" },
  { key: "subject", label: "Subjects" },
  { key: "identifier", label: "Identifier" },
  { key: "source", label: "Source" },
  { key: "rights", label: "Rights" },
  { key: "description", label: "Description" },
]

function getThemeDefinition(themeId: FoliateReaderThemeId) {
  const theme = READER_THEMES.find((entry) => entry.id === themeId)
  return theme ?? READER_THEMES[0]
}

function isFoliateSidebarTab(value: string): value is FoliateReaderSidebarTab {
  return value === SIDEBAR_CONTENTS || value === SIDEBAR_DETAILS
}

function fileNameFromPath(path: string) {
  const normalized = path.replaceAll("\\", "/")
  const parts = normalized.split("/")
  return parts[parts.length - 1] ?? path
}

function getSourceName(source: FoliateReaderSource) {
  switch (source.kind) {
    case "file":
      return source.file.name
    case "blob":
      return source.name
    case "url": {
      if (source.name) return source.name
      try {
        return fileNameFromPath(new URL(source.url, window.location.href).pathname)
      } catch {
        return source.url
      }
    }
    case "book":
      return source.name
  }
}

function getSourceFormatLabel(source: FoliateReaderSource) {
  const name = getSourceName(source)
  if (!name) return "Book"

  const lowerName = name.toLowerCase()
  const lastDot = lowerName.lastIndexOf(".")
  if (lastDot < 0 || lastDot === lowerName.length - 1) return "Book"

  return lowerName.slice(lastDot + 1).toUpperCase()
}

function toFoliateInput(source: FoliateReaderSource): string | Blob | File | FoliateBook {
  switch (source.kind) {
    case "file":
      return source.file
    case "blob":
      return new File([source.blob], source.name, { type: source.blob.type })
    case "url":
      return source.url
    case "book":
      return source.book
  }
}

function isLocalizedTextRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  return Object.values(value).every((entry) => typeof entry === "string")
}

function readLocalizedText(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }

  if (!isLocalizedTextRecord(value)) return undefined

  for (const entry of Object.values(value)) {
    const trimmed = entry.trim()
    if (trimmed.length > 0) return trimmed
  }

  return undefined
}

function formatContributor(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const entries = value.map(formatContributor).filter((entry): entry is string => Boolean(entry))
    return entries.length > 0 ? entries.join(", ") : undefined
  }

  const directText = readLocalizedText(value)
  if (directText) return directText

  if (!value || typeof value !== "object") return undefined
  if (!("name" in value)) return undefined
  return readLocalizedText(value.name)
}

function formatMetadataValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const entries = value
      .map(formatMetadataValue)
      .filter((entry): entry is string => Boolean(entry))
    return entries.length > 0 ? entries.join(", ") : undefined
  }

  const contributor = formatContributor(value)
  if (contributor) return contributor

  return readLocalizedText(value)
}

function buildMetadataRows(metadata?: FoliateMetadata) {
  if (!metadata) return []

  const rows: MetadataRow[] = []
  for (const field of METADATA_FIELDS) {
    const value = formatMetadataValue(metadata[field.key])
    if (!value) continue
    rows.push({
      key: String(field.key),
      label: field.label,
      value,
    })
  }
  return rows
}

function buildLocationState(detail?: FoliateRelocationDetail): FoliateReaderLocation {
  if (!detail) return {}

  let locationLabel: string | undefined
  const locationCurrent = detail.location?.current
  const locationTotal = detail.location?.total
  if (typeof locationCurrent === "number") {
    locationLabel =
      typeof locationTotal === "number"
        ? `Location ${locationCurrent} / ${locationTotal}`
        : `Location ${locationCurrent}`
  }

  return {
    fraction: detail.fraction,
    cfi: detail.cfi,
    tocLabel: detail.tocItem?.label,
    pageLabel: detail.pageItem?.label,
    locationLabel,
  }
}

function toPercentLabel(fraction?: number) {
  if (typeof fraction !== "number") return undefined
  const percent = Math.max(0, Math.min(100, Math.round(fraction * 100)))
  return `${percent}%`
}

async function resolveCoverUrl(book: FoliateBook) {
  const cover = await Promise.resolve(book.getCover?.())
  if (!cover) return undefined
  return URL.createObjectURL(cover)
}

function releaseObjectUrl(url: string | undefined) {
  if (!url) return
  URL.revokeObjectURL(url)
}

function buildReaderStyles(theme: FoliateReaderThemeDefinition) {
  return `
    @namespace epub "http://www.idpf.org/2007/ops";

    html {
      color-scheme: light dark;
      background: ${theme.contentBackground};
      color: ${theme.contentForeground};
      font-size: ${READER_FONT_SIZE_REM}rem;
    }

    body {
      margin: 0 auto;
      background: ${theme.contentBackground};
      color: ${theme.contentForeground};
      accent-color: ${theme.contentLink};
    }

    p,
    li,
    blockquote,
    dd {
      line-height: ${READER_LINE_HEIGHT};
      text-align: justify;
      -webkit-hyphens: auto;
      hyphens: auto;
      -webkit-hyphenate-limit-before: 3;
      -webkit-hyphenate-limit-after: 2;
      -webkit-hyphenate-limit-lines: 2;
      hanging-punctuation: allow-end last;
      widows: 2;
    }

    h1,
    h2,
    h3,
    h4,
    h5,
    h6 {
      color: ${theme.contentForeground};
      line-height: 1.18;
      text-wrap: balance;
    }

    a {
      color: ${theme.contentLink};
    }

    a:visited {
      color: ${theme.contentLink};
    }

    img,
    svg,
    video {
      max-inline-size: 100%;
      block-size: auto;
    }

    hr {
      border: 0;
      border-top: 1px solid color-mix(in oklab, ${theme.contentMuted} 34%, transparent);
    }

    pre,
    code,
    samp,
    kbd {
      font-family:
        "SF Mono",
        "JetBrains Mono",
        "Fira Code",
        ui-monospace,
        monospace;
    }

    pre {
      white-space: pre-wrap !important;
    }

    blockquote {
      color: ${theme.contentMuted};
      border-inline-start: 2px solid color-mix(in oklab, ${theme.contentMuted} 28%, transparent);
      margin-inline: 0;
      padding-inline-start: 1rem;
    }

    aside[epub|type~="endnote"],
    aside[epub|type~="footnote"],
    aside[epub|type~="note"],
    aside[epub|type~="rearnote"] {
      display: none;
    }
  `
}

function applyReaderPreferences(
  view: FoliateView,
  theme: FoliateReaderThemeDefinition,
  flow: FoliateReaderFlow,
) {
  view.className = VIEW_ELEMENT_CLASS_NAME

  const renderer = view.renderer
  if (!renderer) return

  if (renderer.setStyles) {
    renderer.setStyles(buildReaderStyles(theme))
  }

  if (!view.isFixedLayout) {
    renderer.setAttribute("flow", flow)
    renderer.setAttribute("margin", `${READER_MARGIN_PX}px`)
    renderer.setAttribute("gap", `${READER_GAP_PERCENT}%`)
    renderer.setAttribute("max-inline-size", `${READER_MAX_INLINE_SIZE_PX}px`)
    renderer.setAttribute("max-block-size", `${READER_MAX_BLOCK_SIZE_PX}px`)
  }
}

function syncMarginals(
  view: FoliateView,
  snapshot: FoliateReaderSnapshot | null,
  location: FoliateReaderLocation,
) {
  const renderer = view.renderer
  const heads = renderer?.heads
  const feet = renderer?.feet
  if (!heads || !feet || !snapshot) return

  const leftLabel = snapshot.title
  const rightLabel = location.tocLabel ?? snapshot.author
  const progressLabel =
    location.pageLabel ?? location.locationLabel ?? toPercentLabel(location.fraction) ?? ""

  for (const head of heads) {
    head.textContent = leftLabel
  }
  for (const foot of feet) {
    foot.textContent = `${rightLabel}${progressLabel ? ` • ${progressLabel}` : ""}`
  }
}

function cleanupView(view: FoliateView | null, coverUrl: string | undefined) {
  if (!view) {
    releaseObjectUrl(coverUrl)
    return
  }

  const book = view.book
  view.close()
  view.remove()
  releaseObjectUrl(coverUrl)
  Promise.resolve(book?.destroy?.()).catch(() => {})
}

function createError(error: unknown) {
  if (error instanceof Error) return error
  return new Error(DEFAULT_ERROR_MESSAGE)
}

function renderMetadataSummary(location: FoliateReaderLocation) {
  const segments = [location.pageLabel, location.locationLabel, toPercentLabel(location.fraction)]
    .filter((entry): entry is string => Boolean(entry))
    .join(" • ")
  return segments.length > 0 ? segments : "Ready"
}

function FoliateMetadataPanel(props: { snapshot: FoliateReaderSnapshot | null }) {
  if (!props.snapshot) {
    return (
      <div className="rounded-xl border border-dashed border-border-base/80 bg-surface-weak/40 px-4 py-5 text-sm text-text-weak">
        {DETAILS_EMPTY_MESSAGE}
      </div>
    )
  }

  const metadataRows = buildMetadataRows(props.snapshot.metadata)
  const title = props.snapshot.title
  const author = props.snapshot.author

  return (
    <div className="space-y-4">
      <Card size="sm" className="bg-surface-raised-base/80">
        <CardHeader>
          <div className="flex items-start gap-3">
            {props.snapshot.coverUrl ? (
              <img
                src={props.snapshot.coverUrl}
                alt={`${title} cover`}
                className="h-28 w-20 shrink-0 rounded-lg border border-border-base/70 object-cover shadow-sm"
              />
            ) : (
              <div className="flex h-28 w-20 shrink-0 items-center justify-center rounded-lg border border-dashed border-border-base/70 bg-surface-weak/70 text-text-weak">
                <BookOpenIcon className="size-5" />
              </div>
            )}
            <div className="min-w-0 space-y-2">
              <div className="space-y-1">
                <CardTitle className="text-sm leading-snug">{title}</CardTitle>
                <p className="text-sm text-text-weak">{author}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{props.snapshot.formatLabel}</Badge>
                <Badge variant="outline">
                  {props.snapshot.isFixedLayout ? "Fixed layout" : "Reflowable"}
                </Badge>
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {metadataRows.length > 0 ? (
        <div className="space-y-3">
          {metadataRows.map((row) => (
            <div key={row.key} className="space-y-1">
              <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-weaker">
                {row.label}
              </div>
              <div className="text-sm text-text-base">{row.value}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border-base/80 bg-surface-weak/40 px-4 py-5 text-sm text-text-weak">
          {DETAILS_EMPTY_MESSAGE}
        </div>
      )}
    </div>
  )
}

function FoliateTocTree(props: {
  items: FoliateTocItem[]
  activeLabel?: string
  onSelect: (href: string) => void
  depth?: number
}) {
  const depth = props.depth ?? 0

  return (
    <div
      className={depth === 0 ? "space-y-1" : "ml-4 space-y-1 border-l border-border-base/60 pl-3"}
    >
      {props.items.map((item) => {
        const isActive = item.label === props.activeLabel
        return (
          <div key={`${depth}:${item.href}:${item.label}`} className="space-y-1">
            <button
              type="button"
              onClick={() => props.onSelect(item.href)}
              className={cn(
                "flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors",
                isActive
                  ? "bg-surface-interactive-weak text-text-strong"
                  : "text-text-weak hover:bg-surface-weak/70 hover:text-text-base",
              )}
            >
              <span className="mt-1 shrink-0 text-text-weaker">
                <MapIcon className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1">{item.label}</span>
            </button>
            {item.subitems && item.subitems.length > 0 ? (
              <FoliateTocTree
                items={item.subitems}
                activeLabel={props.activeLabel}
                onSelect={props.onSelect}
                depth={depth + 1}
              />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function FoliateContentsPanel(props: {
  snapshot: FoliateReaderSnapshot | null
  activeLabel?: string
  onSelect: (href: string) => void
}) {
  const items = props.snapshot?.toc ?? []
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border-base/80 bg-surface-weak/40 px-4 py-5 text-sm text-text-weak">
        {TOC_EMPTY_MESSAGE}
      </div>
    )
  }

  return <FoliateTocTree items={items} activeLabel={props.activeLabel} onSelect={props.onSelect} />
}

function FoliateEmptyState(props: { children?: ReactNode }) {
  return (
    <div className="flex h-full min-h-[22rem] items-center justify-center rounded-[1.2rem] border border-dashed border-border-base/70 bg-surface-weak/40 p-8">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl border border-border-base/80 bg-surface-raised-base text-text-weak shadow-sm">
          <ScrollTextIcon className="size-5" />
        </div>
        <div className="space-y-1">
          <div className="text-sm font-medium text-text-strong">Foliate reader ready</div>
          <div className="text-sm text-text-weak">{props.children ?? DEFAULT_EMPTY_MESSAGE}</div>
        </div>
      </div>
    </div>
  )
}

function FoliateErrorState(props: { error: Error }) {
  return (
    <div className="flex h-full min-h-[22rem] items-center justify-center rounded-[1.2rem] border border-border-critical-base/40 bg-surface-critical-weak/40 p-8">
      <div className="max-w-md space-y-3 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-border-critical-base/40 bg-surface-critical-weak text-icon-critical-base">
          <FileQuestionIcon className="size-5" />
        </div>
        <div className="space-y-1">
          <div className="text-sm font-medium text-text-strong">{DEFAULT_ERROR_TITLE}</div>
          <div className="text-sm text-text-weak">
            {props.error.message || DEFAULT_ERROR_MESSAGE}
          </div>
        </div>
      </div>
    </div>
  )
}

export const FoliateReader = forwardRef<FoliateReaderHandle, FoliateReaderProps>(
  function FoliateReader(
    {
      source,
      className,
      initialLocation,
      defaultTheme = "paper",
      defaultFlow = FLOW_PAGINATED,
      defaultSidebarTab = SIDEBAR_CONTENTS,
      showSidebar = true,
      showToolbar = true,
      emptyState,
      onReady,
      onLocationChange,
      onOpenExternalLink,
      onError,
    },
    ref,
  ) {
    const viewportRef = useRef<HTMLDivElement | null>(null)
    const viewRef = useRef<FoliateView | null>(null)
    const coverUrlRef = useRef<string | undefined>(undefined)
    const snapshotRef = useRef<FoliateReaderSnapshot | null>(null)
    const locationRef = useRef<FoliateReaderLocation>({})
    const preferencesRef = useRef<{
      themeId: FoliateReaderThemeId
      flow: FoliateReaderFlow
    }>({
      themeId: defaultTheme,
      flow: defaultFlow,
    })
    const callbacksRef = useRef({
      onReady,
      onLocationChange,
      onOpenExternalLink,
      onError,
    })
    const [themeId, setThemeId] = useState<FoliateReaderThemeId>(defaultTheme)
    const [flow, setFlow] = useState<FoliateReaderFlow>(defaultFlow)
    const [sidebarTab, setSidebarTab] = useState<FoliateReaderSidebarTab>(defaultSidebarTab)
    const [sidebarOpen, setSidebarOpen] = useState(showSidebar)
    const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle")
    const [snapshot, setSnapshot] = useState<FoliateReaderSnapshot | null>(null)
    const [location, setLocation] = useState<FoliateReaderLocation>({})
    const [error, setError] = useState<Error | null>(null)

    callbacksRef.current = {
      onReady,
      onLocationChange,
      onOpenExternalLink,
      onError,
    }
    preferencesRef.current = {
      themeId,
      flow,
    }
    snapshotRef.current = snapshot
    locationRef.current = location

    useImperativeHandle(
      ref,
      () => ({
        next: async () => {
          await viewRef.current?.next()
        },
        prev: async () => {
          await viewRef.current?.prev()
        },
        goTo: async (target) => {
          await viewRef.current?.goTo(target)
        },
        setTheme: (nextTheme) => {
          setThemeId(nextTheme)
        },
        setFlow: (nextFlow) => {
          setFlow(nextFlow)
        },
        getSnapshot: () => snapshot,
      }),
      [snapshot],
    )

    useEffect(() => {
      setSidebarOpen(showSidebar)
    }, [showSidebar])

    useEffect(() => {
      const view = viewRef.current
      if (!view) return
      const theme = getThemeDefinition(themeId)
      applyReaderPreferences(view, theme, flow)
      syncMarginals(view, snapshotRef.current, locationRef.current)
    }, [themeId, flow, snapshot, location])

    useEffect(() => {
      const host = viewportRef.current
      if (!host) return

      cleanupView(viewRef.current, coverUrlRef.current)
      viewRef.current = null
      coverUrlRef.current = undefined
      host.replaceChildren()

      if (!source) {
        snapshotRef.current = null
        locationRef.current = {}
        setStatus("idle")
        setSnapshot(null)
        setLocation({})
        setError(null)
        return
      }

      let cancelled = false
      snapshotRef.current = null
      locationRef.current = {}
      setStatus("loading")
      setSnapshot(null)
      setLocation({})
      setError(null)

      void (async () => {
        try {
          const module = await import("foliate-js/view.js")
          if (cancelled) return

          const view = new module.View()
          viewRef.current = view
          host.append(view)

          const relocateListener = (event: CustomEvent<FoliateRelocationDetail>) => {
            const nextLocation = buildLocationState(event.detail)
            locationRef.current = nextLocation
            startTransition(() => {
              setLocation(nextLocation)
            })
            syncMarginals(view, snapshotRef.current, nextLocation)
            callbacksRef.current.onLocationChange?.(nextLocation)
          }

          const externalLinkListener = (event: CustomEvent<{ href: string }>) => {
            if (!callbacksRef.current.onOpenExternalLink) return
            event.preventDefault()
            callbacksRef.current.onOpenExternalLink(event.detail.href)
          }

          view.addEventListener("relocate", relocateListener)
          view.addEventListener("external-link", externalLinkListener)

          await view.open(toFoliateInput(source))
          if (cancelled) return

          const theme = getThemeDefinition(preferencesRef.current.themeId)
          applyReaderPreferences(view, theme, preferencesRef.current.flow)

          const coverUrlPromise = resolveCoverUrl(view.book)
          await view.init({
            lastLocation: initialLocation,
            showTextStart: initialLocation === undefined,
          })
          const coverUrl = await coverUrlPromise
          if (cancelled) {
            releaseObjectUrl(coverUrl)
            return
          }

          const nextSnapshot: FoliateReaderSnapshot = {
            title:
              formatMetadataValue(view.book.metadata?.title) ??
              getSourceName(source) ??
              DEFAULT_TITLE,
            author:
              formatContributor(view.book.metadata?.author) ??
              formatContributor(view.book.metadata?.contributor) ??
              DEFAULT_AUTHOR,
            formatLabel: getSourceFormatLabel(source),
            isFixedLayout: view.isFixedLayout,
            toc: view.book.toc ?? [],
            pageList: view.book.pageList ?? [],
            metadata: view.book.metadata,
            coverUrl,
            fileName: getSourceName(source),
          }

          coverUrlRef.current = coverUrl
          const nextLocation = buildLocationState(view.lastLocation)
          snapshotRef.current = nextSnapshot
          locationRef.current = nextLocation

          startTransition(() => {
            setSnapshot(nextSnapshot)
            setLocation(nextLocation)
            setStatus("ready")
          })

          syncMarginals(view, nextSnapshot, nextLocation)
          callbacksRef.current.onReady?.(nextSnapshot)
          callbacksRef.current.onLocationChange?.(nextLocation)
        } catch (caughtError) {
          if (cancelled) return
          cleanupView(viewRef.current, coverUrlRef.current)
          viewRef.current = null
          coverUrlRef.current = undefined
          host.replaceChildren()
          const nextError = createError(caughtError)
          setError(nextError)
          setStatus("error")
          callbacksRef.current.onError?.(nextError)
        }
      })()

      return () => {
        cancelled = true
        cleanupView(viewRef.current, coverUrlRef.current)
        viewRef.current = null
        coverUrlRef.current = undefined
        host.replaceChildren()
      }
    }, [source, initialLocation])

    const theme = getThemeDefinition(themeId)
    const canChangeFlow = snapshot ? !snapshot.isFixedLayout : false
    const progressSummary = renderMetadataSummary(location)

    return (
      <section
        data-component="foliate-reader"
        data-theme={theme.id}
        className={cn(
          "grid min-h-0 overflow-hidden rounded-[1.4rem] border border-border-base/80 bg-surface-raised-base shadow-[0_18px_48px_color-mix(in_oklab,var(--surface-strong)_18%,transparent)]",
          theme.shellClassName,
          sidebarOpen ? READER_SIDE_PANEL_WIDTH_CLASS : "grid-cols-1",
          className,
        )}
      >
        <style>{`
        .${VIEWPORT_CLASS_NAME} > .${VIEW_ELEMENT_CLASS_NAME} {
          display: block;
          height: 100%;
          width: 100%;
        }

        .${VIEWPORT_CLASS_NAME} > .${VIEW_ELEMENT_CLASS_NAME}::part(head),
        .${VIEWPORT_CLASS_NAME} > .${VIEW_ELEMENT_CLASS_NAME}::part(foot) {
          color: var(--text-weak);
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        [data-component="foliate-reader"][data-theme="${theme.id}"] .${VIEWPORT_CLASS_NAME} > .${VIEW_ELEMENT_CLASS_NAME}::part(filter) {
          filter: ${theme.pdfFilter};
        }
      `}</style>

        {sidebarOpen ? (
          <aside className="min-h-0 border-b border-border-base/80 bg-surface-raised-base/80 backdrop-blur lg:border-r lg:border-b-0">
            <Tabs
              value={sidebarTab}
              onValueChange={(nextValue) => {
                if (isFoliateSidebarTab(nextValue)) {
                  setSidebarTab(nextValue)
                }
              }}
              className="h-full"
            >
              <div className="space-y-4 border-b border-border-base/80 px-4 py-4">
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5 rounded-md border border-border-base/70 bg-surface-weak/70 p-1.5 text-text-weak">
                      <BookOpenIcon className="size-4" />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <div className="truncate text-sm font-medium text-text-strong">
                        {snapshot?.title ??
                          (source ? getSourceName(source) : undefined) ??
                          DEFAULT_TITLE}
                      </div>
                      <div className="truncate text-xs text-text-weak">
                        {snapshot?.author ?? DEFAULT_AUTHOR}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">{snapshot?.formatLabel ?? "Book"}</Badge>
                    <Badge variant="outline">{progressSummary}</Badge>
                  </div>
                </div>

                <TabsList variant="line" className="w-full justify-start">
                  <TabsTrigger value={SIDEBAR_CONTENTS}>
                    <MapIcon className="size-4" />
                    Contents
                  </TabsTrigger>
                  <TabsTrigger value={SIDEBAR_DETAILS}>
                    <InfoIcon className="size-4" />
                    Details
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value={SIDEBAR_CONTENTS} className="min-h-0">
                <ScrollArea className="h-full px-4 py-4">
                  <FoliateContentsPanel
                    snapshot={snapshot}
                    activeLabel={location.tocLabel}
                    onSelect={(href) => {
                      void viewRef.current?.goTo(href)
                    }}
                  />
                </ScrollArea>
              </TabsContent>

              <TabsContent value={SIDEBAR_DETAILS} className="min-h-0">
                <ScrollArea className="h-full px-4 py-4">
                  <FoliateMetadataPanel snapshot={snapshot} />
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </aside>
        ) : null}

        <div className="flex min-h-0 flex-col">
          {showToolbar ? (
            <header className="flex flex-wrap items-center gap-2 border-b border-border-base/80 px-4 py-3 backdrop-blur">
              <div className="flex items-center gap-1 rounded-full border border-border-base/70 bg-surface-raised-base/80 p-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Previous page"
                  onClick={() => {
                    void viewRef.current?.goLeft()
                  }}
                  disabled={status !== "ready"}
                >
                  <ChevronLeftIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Next page"
                  onClick={() => {
                    void viewRef.current?.goRight()
                  }}
                  disabled={status !== "ready"}
                >
                  <ChevronRightIcon className="size-4" />
                </Button>
              </div>

              {showSidebar ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setSidebarOpen((current) => !current)}
                >
                  {sidebarOpen ? (
                    <PanelLeftCloseIcon className="size-4" />
                  ) : (
                    <PanelLeftOpenIcon className="size-4" />
                  )}
                  {sidebarOpen ? "Hide sidebar" : "Show sidebar"}
                </Button>
              ) : null}

              <div className="flex items-center gap-1 rounded-full border border-border-base/70 bg-surface-raised-base/80 p-1">
                {READER_THEMES.map((entry) => (
                  <Button
                    key={entry.id}
                    type="button"
                    variant={entry.id === themeId ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setThemeId(entry.id)}
                    disabled={status === "loading"}
                  >
                    {entry.label}
                  </Button>
                ))}
              </div>

              {canChangeFlow ? (
                <div className="flex items-center gap-1 rounded-full border border-border-base/70 bg-surface-raised-base/80 p-1">
                  <Button
                    type="button"
                    variant={flow === FLOW_PAGINATED ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setFlow(FLOW_PAGINATED)}
                  >
                    <LayoutPanelLeftIcon className="size-4" />
                    Pages
                  </Button>
                  <Button
                    type="button"
                    variant={flow === FLOW_SCROLLED ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setFlow(FLOW_SCROLLED)}
                  >
                    <ScrollTextIcon className="size-4" />
                    Scroll
                  </Button>
                </div>
              ) : null}

              <div className="min-w-0 flex-1 text-right text-xs text-text-weak">
                <span className="truncate">{progressSummary}</span>
              </div>
            </header>
          ) : null}

          <div className={cn("relative min-h-0 flex-1 p-3 sm:p-4", theme.viewportClassName)}>
            <div className="absolute inset-x-3 top-3 z-10 sm:inset-x-4 sm:top-4">
              {status === "loading" ? (
                <div className="inline-flex items-center gap-2 rounded-full border border-border-base/80 bg-surface-raised-base/85 px-3 py-1.5 text-xs text-text-weak shadow-sm backdrop-blur">
                  <Loader2Icon className="size-4 animate-spin" />
                  Preparing reader…
                </div>
              ) : null}
            </div>

            {status === "idle" ? (
              <FoliateEmptyState>{emptyState}</FoliateEmptyState>
            ) : status === "error" && error ? (
              <FoliateErrorState error={error} />
            ) : null}

            <div
              ref={viewportRef}
              className={cn(
                VIEWPORT_CLASS_NAME,
                "h-full min-h-[24rem] overflow-hidden rounded-[1.2rem] border border-border-base/70 bg-surface-raised-base/80 shadow-[inset_0_1px_0_color-mix(in_oklab,var(--surface-stronger)_18%,transparent)]",
                status === "idle" || status === "error" ? "hidden" : "block",
              )}
            />

            {snapshot ? (
              <div className="pointer-events-none absolute inset-x-6 bottom-5 hidden justify-center lg:flex">
                <Card
                  size="sm"
                  className="pointer-events-auto max-w-xl bg-surface-raised-base/86 shadow-lg backdrop-blur"
                >
                  <CardContent className="flex items-center gap-3 py-3">
                    <div className="flex size-9 items-center justify-center rounded-xl border border-border-base/70 bg-surface-weak/70 text-text-weak">
                      <BookOpenIcon className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-text-strong">
                        {snapshot.title}
                      </div>
                      <div className="truncate text-xs text-text-weak">
                        {location.tocLabel ?? location.pageLabel ?? snapshot.author}
                      </div>
                    </div>
                    <Separator orientation="vertical" className="h-8" />
                    <div className="text-right text-xs text-text-weak">
                      <div>{toPercentLabel(location.fraction) ?? "Ready"}</div>
                      <div>{location.locationLabel ?? snapshot.formatLabel}</div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    )
  },
)

FoliateReader.displayName = "FoliateReader"
