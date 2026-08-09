import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react"
import {
  Button,
  ChevronLeftIcon,
  ChevronRightIcon,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Field,
  FieldLabel,
  Input,
  ToggleGroup,
  ToggleGroupItem,
  cn,
  toast,
} from "@buddy/ui"
import {
  BookmarkIcon,
  CheckIcon,
  CircleHelpIcon,
  Columns2Icon,
  EllipsisIcon,
  FileIcon,
  LoaderCircleIcon,
  MapIcon,
  MinusIcon,
  PlusIcon,
  Redo2Icon,
  RotateCwIcon,
  Rows3Icon,
  Undo2Icon,
} from "@/icons/app-icons"
import { PasswordResponses } from "pdfjs-dist"
import "pdfjs-dist/web/pdf_viewer.css"
import {
  readerTextAnchorEquals,
  type PdfPositionAnchor,
  type PdfTextAnchor,
  type ReaderRelocation,
} from "@buddy/reader-contract"
import { ReaderAnnotationDialog } from "../ui/reader-annotation-dialog"
import { ReaderAnnotationPopover } from "../ui/reader-annotation-popover"
import { ReaderAnnotationsPopover } from "../ui/reader-annotations-popover"
import { ReaderBookmarksPopover } from "../ui/reader-bookmarks-popover"
import { ReaderErrorState } from "../ui/reader-error-state"
import { ReaderHelpDialog } from "../ui/reader-help-dialog"
import { ReaderMetadataHoverCard } from "../ui/reader-metadata-hover-card"
import { ReaderPreferencesPanel, ReaderPreferenceSlider } from "../ui/reader-preferences-panel"
import { ReaderPreferencesPopover } from "../ui/reader-preferences-popover"
import { ReaderProgressScrubber } from "../ui/reader-progress-scrubber"
import { ReaderSearchPopover } from "../ui/reader-search-popover"
import { ReaderSelectionToolbar } from "../ui/reader-selection-toolbar"
import { ReaderTocPopover } from "../ui/reader-toc-popover"
import {
  DEFAULT_ANNOTATION_COLOR_ID,
  READER_SELECTION_BACKGROUND,
  READER_SELECTION_FOREGROUND,
  READER_THEMES,
} from "../foliate-reader-constants"
import { getThemeDefinition } from "../utils/foliate-themes"
import { copyText } from "../utils/foliate-helpers"
import {
  clampPdfCustomScale,
  createLocalReaderStateRepository,
  createReaderRecordId,
  MAX_PDF_CUSTOM_SCALE,
  MIN_PDF_CUSTOM_SCALE,
  type ReaderDocumentState,
  type ReaderPreferences,
} from "../reader-storage"
import type {
  DocumentReaderHandle,
  DocumentReaderProps,
  PdfReaderLayout,
  PdfReaderMode,
  PdfReaderRotation,
  PdfReaderScaleMode,
  ReaderAnnotation,
  ReaderAnnotationEditorViewModel,
  ReaderBookmark,
  ReaderSearchResult,
  ReaderSearchRow,
  ReaderSearchViewModel,
  ReaderShortcut,
  ReaderSnapshot,
  ReaderSource,
  ReaderThemeId,
} from "../reader-types"
import { READER_SEARCH_SCOPE_DOCUMENT } from "../reader-types"
import {
  clearPdfSelection,
  indexPdfAnnotationsByPage,
  isPdfSelectionEventTarget,
  readPdfSelection,
  removePdfAnnotationLayers,
  removePdfSearchLayers,
  removePdfSelectionLayers,
  renderPdfAnnotations,
  renderPdfSearchResult,
  renderPdfSelection,
  type PdfSelectionAction,
} from "./pdf-dom-interactions"
import { shouldDismissPdfSelectionForRelocation } from "./pdf-reader-state"
import { createPdfSearchRowBatcher } from "./pdf-search-row-batcher"
import { shouldShowPdfPageTurnControls } from "./pdf-viewer-mode"
import { PdfViewerSession, type PdfSearchRequest } from "./pdf-viewer-session"

const PDF_LOCATION_PERSIST_DELAY_MS = 250
const PDF_HISTORY_NAVIGATION_SETTLE_MS = 400
const PDF_HISTORY_POSITION_DELTA = 0.15
const PDF_HISTORY_MAX_ENTRIES = 500
const PDF_BOOKMARK_POSITION_DELTA = 0.03
const PDF_KEYBOARD_PAN_DISTANCE_PX = 80
const PDF_SCALE_STEP = 0.05
const PDF_SCALE_PERCENT = 100
const PDF_PROGRESS_MAX = 1_000
const PDF_DEFAULT_ANNOTATION_STYLE = "highlight" as const
const PDF_SELECTION_LIMIT_MESSAGE =
  "That selection is too large to save reliably. Select a smaller passage and try again."

const PDF_READER_SHORTCUTS: ReaderShortcut[] = [
  { keys: "Ctrl/Cmd + F", label: "Search this PDF" },
  { keys: "Ctrl/Cmd + D", label: "Toggle bookmark" },
  { keys: "Ctrl/Cmd + L", label: "Open page navigation" },
  { keys: "Ctrl/Cmd + +/-/0", label: "Zoom in, out, or reset" },
  { keys: "Shift + Left / Right", label: "Pan across a zoomed page" },
  { keys: "Page Up / Page Down", label: "Previous or next page" },
  { keys: "Alt + Left / Right", label: "Reading history" },
  { keys: "Ctrl/Cmd + ,", label: "Open reader preferences" },
  { keys: "?", label: "Open keyboard help" },
  { keys: "Esc", label: "Close reader overlays" },
]

const PDF_LAYOUT_OPTIONS: Array<{ value: PdfReaderLayout; label: string }> = [
  { value: "continuous", label: "Continuous" },
  { value: "single-page", label: "Single" },
  { value: "two-up", label: "Two-up" },
]

const PDF_SCALE_OPTIONS: Array<{ value: PdfReaderScaleMode; label: string }> = [
  { value: "fit-width", label: "Fit width" },
  { value: "fit-page", label: "Fit page" },
  { value: "custom", label: "Custom" },
]

const PDF_ROTATIONS: PdfReaderRotation[] = [0, 90, 180, 270]

const READER_THEME_OPTIONS = READER_THEMES.map((theme) => ({
  id: theme.id,
  label: theme.label,
  contentBackground: theme.contentBackground,
  contentForeground: theme.contentForeground,
}))

type PdfReaderProps = Omit<DocumentReaderProps, "source"> & {
  source: ReaderSource
}

type PdfReaderStatus = "loading" | "ready" | "error"

type PdfReaderAnnotation = ReaderAnnotation & {
  anchor: PdfTextAnchor
}

type PdfPasswordPrompt = {
  updatePassword: (password: string) => void
  reason: number
}

type PdfHistoryState = {
  entries: PdfPositionAnchor[]
  cursor: number
  navigating: boolean
}

type PdfAnnotationEditorState = {
  view: ReaderAnnotationEditorViewModel
  annotationId?: string
  selection?: PdfSelectionAction
}

function isEditingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}

function sourceWithFingerprint(
  source: ReaderSource,
  fingerprint: string | undefined,
): ReaderSource {
  const contentFingerprint = source.contentFingerprint ?? fingerprint
  if (!contentFingerprint || contentFingerprint === source.contentFingerprint) return source
  if (source.kind === "file") return { ...source, contentFingerprint }
  if (source.kind === "blob") return { ...source, contentFingerprint }
  return { ...source, contentFingerprint }
}

function isPdfPosition(
  anchor: ReaderRelocation["anchor"] | undefined,
): anchor is PdfPositionAnchor {
  return anchor?.kind === "pdf-position"
}

function isCurrentBookmark(bookmark: ReaderBookmark, anchor: PdfPositionAnchor): boolean {
  if (bookmark.anchor.kind !== "pdf-position") return false
  return (
    bookmark.anchor.pageIndex === anchor.pageIndex &&
    Math.abs(bookmark.anchor.xRatio - anchor.xRatio) <= PDF_BOOKMARK_POSITION_DELTA &&
    Math.abs(bookmark.anchor.yRatio - anchor.yRatio) <= PDF_BOOKMARK_POSITION_DELTA
  )
}

function shouldAppendHistory(
  previous: PdfPositionAnchor | undefined,
  next: PdfPositionAnchor,
): boolean {
  if (!previous) return true
  return (
    previous.pageIndex !== next.pageIndex ||
    Math.abs(previous.xRatio - next.xRatio) >= PDF_HISTORY_POSITION_DELTA ||
    Math.abs(previous.yRatio - next.yRatio) >= PDF_HISTORY_POSITION_DELTA
  )
}

function emptySearchViewModel(): ReaderSearchViewModel {
  return {
    query: "",
    scope: READER_SEARCH_SCOPE_DOCUMENT,
    matchCase: false,
    matchWholeWords: false,
    matchDiacritics: false,
    running: false,
    progress: null,
    rows: [],
  }
}

function searchRequest(search: ReaderSearchViewModel): PdfSearchRequest {
  return {
    query: search.query,
    scope: search.scope,
    matchCase: search.matchCase,
    matchWholeWords: search.matchWholeWords,
    matchDiacritics: search.matchDiacritics,
  }
}

function searchResults(rows: ReaderSearchRow[]): ReaderSearchResult[] {
  return rows.flatMap((row) => (row.kind === "result" ? [row.result] : []))
}

function rotationAfter(rotation: PdfReaderRotation): PdfReaderRotation {
  const index = PDF_ROTATIONS.indexOf(rotation)
  return PDF_ROTATIONS[(index + 1) % PDF_ROTATIONS.length] ?? 0
}

function PdfEnginePreferences(props: {
  mode: PdfReaderMode
  currentScale: number
  onModeChange: (mode: PdfReaderMode) => void
}): React.JSX.Element {
  const setLayout = (layout: PdfReaderLayout) => props.onModeChange({ ...props.mode, layout })
  const setScaleMode = (scaleMode: PdfReaderScaleMode) =>
    props.onModeChange({
      ...props.mode,
      scaleMode,
      ...(scaleMode === "custom" ? { scale: props.currentScale } : {}),
    })
  return (
    <div className="flex flex-col gap-4 px-5">
      <Field>
        <FieldLabel id="pdf-reader-layout-label">Page layout</FieldLabel>
        <ToggleGroup
          type="single"
          variant="outline"
          value={props.mode.layout}
          aria-labelledby="pdf-reader-layout-label"
          onValueChange={(value) => {
            const option = PDF_LAYOUT_OPTIONS.find((candidate) => candidate.value === value)
            if (option) setLayout(option.value)
          }}
          className="w-full"
        >
          {PDF_LAYOUT_OPTIONS.map((option) => (
            <ToggleGroupItem key={option.value} value={option.value} className="flex-1">
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>
      <Field>
        <FieldLabel id="pdf-reader-scale-label">Page scale</FieldLabel>
        <ToggleGroup
          type="single"
          variant="outline"
          value={props.mode.scaleMode}
          aria-labelledby="pdf-reader-scale-label"
          onValueChange={(value) => {
            const option = PDF_SCALE_OPTIONS.find((candidate) => candidate.value === value)
            if (option) setScaleMode(option.value)
          }}
          className="w-full"
        >
          {PDF_SCALE_OPTIONS.map((option) => (
            <ToggleGroupItem key={option.value} value={option.value} className="flex-1">
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>
      {props.mode.scaleMode === "custom" ? (
        <ReaderPreferenceSlider
          id="pdf-reader-custom-scale"
          label="Zoom"
          min={MIN_PDF_CUSTOM_SCALE}
          max={MAX_PDF_CUSTOM_SCALE}
          step={PDF_SCALE_STEP}
          value={props.mode.scale ?? 1}
          onChange={(scale) => props.onModeChange({ ...props.mode, scale })}
          formatValue={(scale) => `${Math.round(scale * PDF_SCALE_PERCENT)}%`}
        />
      ) : null}
    </div>
  )
}

export const PdfReader = forwardRef<DocumentReaderHandle, PdfReaderProps>(function PdfReader(
  {
    source,
    className,
    persistenceSuffix,
    initialLocation,
    defaultTheme = "paper",
    showToolbar = true,
    onReady,
    onLocationChange,
    onChatSelection,
    onChatSelectionRemoved,
    onOpenExternalLink,
    onOpeningInteractionChange,
    onError,
    onAnnotationsChange,
  },
  ref,
) {
  const repositoryRef = useRef(createLocalReaderStateRepository())
  const rootRef = useRef<HTMLElement | null>(null)
  const readerSurfaceRef = useRef<HTMLDivElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const viewerElementRef = useRef<HTMLDivElement | null>(null)
  const sessionRef = useRef<PdfViewerSession | null>(null)
  const snapshotRef = useRef<ReaderSnapshot | null>(null)
  const locationRef = useRef<ReaderRelocation | null>(null)
  const persistenceSourceRef = useRef<ReaderSource>(source)
  const hydratedRef = useRef(false)
  const stagedSelectionKeyRef = useRef<string | null>(null)
  const selectionActionRef = useRef<PdfSelectionAction | null>(null)
  const activeSearchResultRef = useRef<ReaderSearchResult | undefined>(undefined)
  const pendingLocationRef = useRef<PdfPositionAnchor | null>(null)
  const searchAbortRef = useRef<AbortController | null>(null)
  const searchProgressFrameRef = useRef<number | null>(null)
  const pendingSearchProgressRef = useRef<number | null>(null)
  const locationPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const historySettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const historyRef = useRef<PdfHistoryState>({ entries: [], cursor: -1, navigating: false })
  const callbacksRef = useRef({
    onReady,
    onLocationChange,
    onChatSelection,
    onChatSelectionRemoved,
    onOpenExternalLink,
    onOpeningInteractionChange,
    onError,
    onAnnotationsChange,
  })

  const initialPreferences = useMemo(
    () => repositoryRef.current.loadPreferences(defaultTheme),
    [defaultTheme],
  )
  const initialDocumentState = useMemo(
    () => repositoryRef.current.loadDocument(source, persistenceSuffix),
    [persistenceSuffix, source],
  )
  const [status, setStatus] = useState<PdfReaderStatus>("loading")
  const [error, setError] = useState<Error | null>(null)
  const [snapshot, setSnapshot] = useState<ReaderSnapshot | null>(null)
  const [location, setLocation] = useState<ReaderRelocation | null>(null)
  const [preferences, setPreferences] = useState<ReaderPreferences>(initialPreferences)
  const [documentState, setDocumentState] = useState<ReaderDocumentState>(initialDocumentState)
  const [mode, setModeState] = useState<PdfReaderMode>(
    initialDocumentState.pdfMode ?? initialPreferences.pdfMode,
  )
  const [scale, setScale] = useState(initialDocumentState.pdfMode?.scale ?? 1)
  const [layoutFallback, setLayoutFallback] = useState<string | null>(null)
  const [selectionAction, setSelectionAction] = useState<PdfSelectionAction | null>(null)
  const [annotationPopover, setAnnotationPopover] = useState<{
    annotationId: string
    x: number
    y: number
  } | null>(null)
  const [annotationEditor, setAnnotationEditor] = useState<PdfAnnotationEditorState | null>(null)
  const [search, setSearch] = useState<ReaderSearchViewModel>(emptySearchViewModel)
  const searchRowsBatcher = useMemo(
    () =>
      createPdfSearchRowBatcher({
        schedule: (flush) => requestAnimationFrame(flush),
        cancelScheduled: (frame) => cancelAnimationFrame(frame),
        onRows: (rows) => {
          const firstResult = rows[0]?.result
          if (!firstResult) return
          setSearch((current) => ({
            ...current,
            rows: [...current.rows, ...rows],
            activeResultId: current.activeResultId ?? firstResult.id,
          }))
        },
      }),
    [],
  )
  const [searchOpen, setSearchOpen] = useState(false)
  const [preferencesOpen, setPreferencesOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [locationOpen, setLocationOpen] = useState(false)
  const [locationDraft, setLocationDraft] = useState("")
  const [passwordPrompt, setPasswordPrompt] = useState<PdfPasswordPrompt | null>(null)
  const [passwordDraft, setPasswordDraft] = useState("")
  const [historyRevision, setHistoryRevision] = useState(0)
  const [progressDraft, setProgressDraft] = useState<number | null>(null)
  const annotationPageIndex = useMemo(
    () => indexPdfAnnotationsByPage(documentState.annotations),
    [documentState.annotations],
  )
  const activeSearchResult = useMemo(
    () => searchResults(search.rows).find((result) => result.id === search.activeResultId),
    [search.activeResultId, search.rows],
  )
  const annotationPageIndexRef = useRef(annotationPageIndex)
  const documentStateRef = useRef(documentState)
  const modeRef = useRef(mode)

  callbacksRef.current = {
    onReady,
    onLocationChange,
    onChatSelection,
    onChatSelectionRemoved,
    onOpenExternalLink,
    onOpeningInteractionChange,
    onError,
    onAnnotationsChange,
  }
  snapshotRef.current = snapshot
  locationRef.current = location
  annotationPageIndexRef.current = annotationPageIndex
  documentStateRef.current = documentState
  modeRef.current = mode
  selectionActionRef.current = selectionAction
  activeSearchResultRef.current = activeSearchResult

  const removeStagedSelection = useCallback(() => {
    const selectionKey = stagedSelectionKeyRef.current
    if (!selectionKey) return
    callbacksRef.current.onChatSelectionRemoved?.(selectionKey)
    stagedSelectionKeyRef.current = null
  }, [])

  const dismissSelection = useCallback(
    (removeFromChat: boolean) => {
      if (removeFromChat) removeStagedSelection()
      selectionActionRef.current = null
      setSelectionAction(null)
      const root = readerSurfaceRef.current
      if (root) {
        clearPdfSelection(root)
        removePdfSelectionLayers(root)
      }
    },
    [removeStagedSelection],
  )

  const handleCopySelection = useCallback(
    async (text: string) => {
      removeStagedSelection()
      const copied = await copyText(text)
      if (copied) {
        dismissSelection(false)
        toast.success("Copied to clipboard")
        return
      }
      toast.error("Unable to copy to clipboard")
    },
    [dismissSelection, removeStagedSelection],
  )

  const renderAnnotations = useCallback(
    (pageIndex?: number) => {
      const root = readerSurfaceRef.current
      const session = sessionRef.current
      if (!root || !session) return
      renderPdfAnnotations({
        root,
        session,
        annotationsByPage: annotationPageIndexRef.current,
        ...(pageIndex !== undefined ? { pageIndex } : {}),
        onActivate: (activation) => {
          dismissSelection(true)
          setAnnotationPopover(activation)
        },
      })
    },
    [dismissSelection],
  )

  const renderSelection = useCallback((pageIndex?: number) => {
    const root = readerSurfaceRef.current
    const session = sessionRef.current
    if (!root || !session) return
    renderPdfSelection({
      root,
      session,
      selection: selectionActionRef.current?.selection,
      ...(pageIndex !== undefined ? { pageIndex } : {}),
    })
  }, [])

  const renderActiveSearchResult = useCallback((pageIndex?: number) => {
    const root = readerSurfaceRef.current
    const session = sessionRef.current
    if (!root || !session) return
    renderPdfSearchResult({
      root,
      session,
      result: activeSearchResultRef.current,
      ...(pageIndex !== undefined ? { pageIndex } : {}),
    })
  }, [])

  const updateHistory = useCallback((anchor: PdfPositionAnchor) => {
    const history = historyRef.current
    if (history.navigating) return
    const previous = history.entries[history.cursor]
    if (!shouldAppendHistory(previous, anchor)) return
    const entries = history.entries.slice(0, history.cursor + 1)
    entries.push(anchor)
    const boundedEntries = entries.slice(-PDF_HISTORY_MAX_ENTRIES)
    historyRef.current = {
      entries: boundedEntries,
      cursor: boundedEntries.length - 1,
      navigating: false,
    }
    setHistoryRevision((revision) => revision + 1)
  }, [])

  const queueLocationPersistence = useCallback((anchor: PdfPositionAnchor) => {
    if (!hydratedRef.current) return
    pendingLocationRef.current = anchor
    if (locationPersistTimerRef.current) clearTimeout(locationPersistTimerRef.current)
    locationPersistTimerRef.current = setTimeout(() => {
      locationPersistTimerRef.current = null
      pendingLocationRef.current = null
      setDocumentState((current) => ({ ...current, lastLocation: anchor }))
    }, PDF_LOCATION_PERSIST_DELAY_MS)
  }, [])

  const handleScaleChange = useCallback((nextScale: number, presetValue: string | undefined) => {
    if (presetValue !== undefined) {
      setScale(nextScale)
      return
    }
    const boundedScale = clampPdfCustomScale(nextScale)
    if (boundedScale !== nextScale) {
      sessionRef.current?.setCustomScale(boundedScale)
      return
    }
    setScale(boundedScale)
    const currentMode = modeRef.current
    const customMode: PdfReaderMode = {
      layout: currentMode.layout,
      scaleMode: "custom",
      scale: boundedScale,
      rotation: currentMode.rotation,
    }
    modeRef.current = customMode
    setModeState(customMode)
    setPreferences((current) => ({ ...current, pdfMode: customMode }))
    setDocumentState((current) => ({ ...current, pdfMode: customMode }))
  }, [])

  const cancelQueuedSearchProgress = useCallback(() => {
    if (searchProgressFrameRef.current !== null) {
      cancelAnimationFrame(searchProgressFrameRef.current)
      searchProgressFrameRef.current = null
    }
    pendingSearchProgressRef.current = null
  }, [])

  const queueSearchProgress = useCallback((nextProgress: number) => {
    pendingSearchProgressRef.current = nextProgress
    if (searchProgressFrameRef.current !== null) return
    searchProgressFrameRef.current = requestAnimationFrame(() => {
      searchProgressFrameRef.current = null
      const pendingProgress = pendingSearchProgressRef.current
      pendingSearchProgressRef.current = null
      if (pendingProgress === null) return
      setSearch((current) => ({ ...current, progress: pendingProgress }))
    })
  }, [])

  useEffect(() => {
    repositoryRef.current.savePreferences(preferences)
  }, [preferences])

  useEffect(() => {
    if (!hydratedRef.current) return
    repositoryRef.current.saveDocument(persistenceSourceRef.current, documentState)
  }, [documentState])

  useEffect(() => {
    if (!hydratedRef.current) return
    callbacksRef.current.onAnnotationsChange?.(documentState.annotations)
  }, [documentState.annotations])

  useEffect(() => {
    renderAnnotations()
    renderSelection()
  }, [documentState.annotations, mode, renderAnnotations, renderSelection])

  useEffect(() => {
    renderActiveSearchResult()
  }, [activeSearchResult, mode, renderActiveSearchResult])

  useEffect(() => {
    const root = readerSurfaceRef.current
    const container = containerRef.current
    const viewerElement = viewerElementRef.current
    const repository = repositoryRef.current
    if (!root || !container || !viewerElement) return
    setStatus("loading")
    setError(null)
    setSnapshot(null)
    locationRef.current = null
    setLocation(null)
    selectionActionRef.current = null
    activeSearchResultRef.current = undefined
    setSelectionAction(null)
    setAnnotationPopover(null)
    setSearch(emptySearchViewModel())
    setSearchOpen(false)
    removePdfSearchLayers(root)
    setLayoutFallback(null)
    setPasswordPrompt(null)
    setPasswordDraft("")
    hydratedRef.current = false
    pendingLocationRef.current = null
    persistenceSourceRef.current = source
    historyRef.current = { entries: [], cursor: -1, navigating: false }

    const openingPreferences = repository.loadPreferences(defaultTheme)
    const openingDocumentState = repository.loadDocument(source, persistenceSuffix)
    const openingMode = openingDocumentState.pdfMode ?? openingPreferences.pdfMode
    modeRef.current = openingMode
    setPreferences(openingPreferences)
    setModeState(openingMode)
    setDocumentState(openingDocumentState)
    const explicitInitialLocation =
      initialLocation?.kind === "pdf-position" ? initialLocation : undefined

    const session = new PdfViewerSession({
      container,
      viewerElement,
      source,
      mode: openingMode,
      callbacks: {
        onReady: (nextSnapshot, fingerprint) => {
          if (sessionRef.current !== session) return
          callbacksRef.current.onOpeningInteractionChange?.(false)
          const persistenceSource = sourceWithFingerprint(source, fingerprint)
          persistenceSourceRef.current = persistenceSource
          const stored = repository.loadDocument(persistenceSource, persistenceSuffix)
          const storedMode = stored.pdfMode ?? openingMode
          const pdfAnnotations = stored.annotations.filter(
            (annotation): annotation is PdfReaderAnnotation =>
              annotation.anchor.kind === "pdf-text",
          )
          const pdfBookmarks = stored.bookmarks.filter(
            (bookmark) => bookmark.anchor.kind === "pdf-position",
          )
          const hydratedState: ReaderDocumentState = {
            ...stored,
            annotations: pdfAnnotations,
            bookmarks: pdfBookmarks,
            pdfMode: storedMode,
          }
          hydratedRef.current = true
          modeRef.current = storedMode
          setDocumentState(hydratedState)
          setModeState(storedMode)
          setSnapshot(nextSnapshot)
          setStatus("ready")
          callbacksRef.current.onReady?.(nextSnapshot)
          const annotationsMissingGeometry = pdfAnnotations.filter((annotation) =>
            annotation.anchor.segments.some((segment) => segment.quads.length === 0),
          )
          if (annotationsMissingGeometry.length > 0) {
            void (async () => {
              const repairedAnchors = new Map<string, PdfTextAnchor>()
              for (const annotation of annotationsMissingGeometry) {
                if (sessionRef.current !== session) return
                try {
                  const repairedAnchor = await session.repairTextAnchor(annotation.anchor)
                  if (!readerTextAnchorEquals(annotation.anchor, repairedAnchor)) {
                    repairedAnchors.set(annotation.id, repairedAnchor)
                  }
                } catch {
                  if (sessionRef.current !== session) return
                }
              }
              if (sessionRef.current !== session || repairedAnchors.size === 0) return
              setDocumentState((current) => ({
                ...current,
                annotations: current.annotations.map((annotation) => {
                  const repairedAnchor = repairedAnchors.get(annotation.id)
                  return repairedAnchor ? { ...annotation, anchor: repairedAnchor } : annotation
                }),
              }))
            })()
          }
          const restored =
            explicitInitialLocation ??
            (stored.lastLocation?.kind === "pdf-position" ? stored.lastLocation : undefined)
          session.restoreView(storedMode, restored)
        },
        onLocationChange: (nextLocation) => {
          if (sessionRef.current !== session || nextLocation.anchor.kind !== "pdf-position") {
            return
          }
          const previousLocation = locationRef.current
          locationRef.current = nextLocation
          if (shouldDismissPdfSelectionForRelocation(previousLocation, nextLocation)) {
            dismissSelection(true)
          }
          setLocation(nextLocation)
          updateHistory(nextLocation.anchor)
          queueLocationPersistence(nextLocation.anchor)
          callbacksRef.current.onLocationChange?.(nextLocation)
        },
        onScaleChange: handleScaleChange,
        onPageRendered: (pageIndex) => {
          renderAnnotations(pageIndex)
          renderSelection(pageIndex)
          renderActiveSearchResult(pageIndex)
        },
        onTextLayerRendered: (pageIndex) => {
          renderAnnotations(pageIndex)
          renderSelection(pageIndex)
          renderActiveSearchResult(pageIndex)
        },
        onPassword: (updatePassword, reason) => {
          if (sessionRef.current !== session) return
          setPasswordDraft("")
          setPasswordPrompt({ updatePassword, reason })
          callbacksRef.current.onOpeningInteractionChange?.(true)
        },
        onLayoutFallback: setLayoutFallback,
        onExternalLink: (href) => {
          const handler = callbacksRef.current.onOpenExternalLink
          if (!handler) return false
          handler(href)
          return true
        },
        onError: (nextError) => {
          if (sessionRef.current !== session) return
          callbacksRef.current.onOpeningInteractionChange?.(false)
          setError(nextError)
          setStatus("error")
          callbacksRef.current.onError?.(nextError)
        },
      },
    })
    sessionRef.current = session

    let selectionFrame: number | null = null
    const handleSelectionPointerDown = (event: PointerEvent) => {
      if (
        event.button !== 0 ||
        !selectionActionRef.current ||
        !isPdfSelectionEventTarget(event.target, container)
      ) {
        return
      }
      removeStagedSelection()
      selectionActionRef.current = null
      setSelectionAction(null)
      removePdfSelectionLayers(root)
    }
    const handleSelection = () => {
      if (selectionFrame !== null) cancelAnimationFrame(selectionFrame)
      selectionFrame = requestAnimationFrame(() => {
        selectionFrame = null
        const action = readPdfSelection({
          root,
          session,
          onLimitExceeded: () => toast.error(PDF_SELECTION_LIMIT_MESSAGE),
        })
        if (!action) {
          removeStagedSelection()
          selectionActionRef.current = null
          setSelectionAction(null)
          removePdfSelectionLayers(root)
          return
        }
        const selection = {
          ...action.selection,
          selectionKey: createReaderRecordId("selection"),
        }
        removeStagedSelection()
        stagedSelectionKeyRef.current = selection.selectionKey
        const nextAction = { ...action, selection }
        selectionActionRef.current = nextAction
        setSelectionAction(nextAction)
        renderPdfSelection({ root, session, selection })
        clearPdfSelection(root)
        callbacksRef.current.onChatSelection?.(selection)
      })
    }
    const handleSelectionPointerUp = (event: PointerEvent) => {
      if (!isPdfSelectionEventTarget(event.target, container)) return
      handleSelection()
    }
    const handleSelectionKeyUp = (event: KeyboardEvent) => {
      if (!isPdfSelectionEventTarget(event.target, container)) return
      if (event.shiftKey || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a")) {
        handleSelection()
      }
    }
    root.addEventListener("pointerdown", handleSelectionPointerDown)
    root.addEventListener("pointerup", handleSelectionPointerUp)
    root.addEventListener("keyup", handleSelectionKeyUp)

    return () => {
      root.removeEventListener("pointerdown", handleSelectionPointerDown)
      root.removeEventListener("pointerup", handleSelectionPointerUp)
      root.removeEventListener("keyup", handleSelectionKeyUp)
      if (selectionFrame !== null) cancelAnimationFrame(selectionFrame)
      if (locationPersistTimerRef.current) {
        clearTimeout(locationPersistTimerRef.current)
        locationPersistTimerRef.current = null
      }
      const pendingLocation = pendingLocationRef.current
      if (hydratedRef.current && pendingLocation) {
        const finalState = { ...documentStateRef.current, lastLocation: pendingLocation }
        documentStateRef.current = finalState
        repository.saveDocument(persistenceSourceRef.current, finalState)
      }
      pendingLocationRef.current = null
      if (historySettleTimerRef.current) clearTimeout(historySettleTimerRef.current)
      cancelQueuedSearchProgress()
      searchRowsBatcher.cancel()
      searchAbortRef.current?.abort()
      callbacksRef.current.onOpeningInteractionChange?.(false)
      removeStagedSelection()
      removePdfAnnotationLayers(root)
      removePdfSearchLayers(root)
      removePdfSelectionLayers(root)
      sessionRef.current = null
      void session.destroy().catch(() => undefined)
    }
  }, [
    defaultTheme,
    cancelQueuedSearchProgress,
    dismissSelection,
    handleScaleChange,
    initialLocation,
    persistenceSuffix,
    queueLocationPersistence,
    removeStagedSelection,
    renderAnnotations,
    renderActiveSearchResult,
    renderSelection,
    source,
    searchRowsBatcher,
    updateHistory,
  ])

  const updateMode = useCallback((nextMode: PdfReaderMode) => {
    const scaleValue =
      nextMode.scaleMode === "custom"
        ? clampPdfCustomScale(nextMode.scale ?? sessionRef.current?.currentScale ?? 1)
        : undefined
    const normalized: PdfReaderMode = {
      ...nextMode,
      ...(scaleValue !== undefined ? { scale: scaleValue } : {}),
    }
    setModeState(normalized)
    setPreferences((current) => ({ ...current, pdfMode: normalized }))
    setDocumentState((current) => ({ ...current, pdfMode: normalized }))
    sessionRef.current?.setMode(normalized)
  }, [])

  const setTheme = useCallback((themeId: ReaderThemeId) => {
    setPreferences((current) => ({ ...current, themeId }))
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      next: async () => {
        sessionRef.current?.nextPage()
      },
      prev: async () => {
        sessionRef.current?.previousPage()
      },
      goTo: async (target) => {
        if (target.kind === "pdf-position") await sessionRef.current?.goTo(target)
      },
      setTheme,
      getSnapshot: () => snapshotRef.current,
    }),
    [setTheme],
  )

  const currentAnchor = isPdfPosition(location?.anchor) ? location.anchor : undefined
  const currentBookmark = currentAnchor
    ? documentState.bookmarks.find((bookmark) => isCurrentBookmark(bookmark, currentAnchor))
    : undefined
  const progress = location?.fraction ?? 0
  const progressValue = progressDraft ?? Math.round(progress * PDF_PROGRESS_MAX)
  const history = historyRef.current
  const canGoBack = historyRevision >= 0 && history.cursor > 0
  const canGoForward =
    historyRevision >= 0 && history.cursor >= 0 && history.cursor < history.entries.length - 1
  const theme = getThemeDefinition(preferences.themeId)

  const toggleBookmark = useCallback(() => {
    if (!currentAnchor) return
    setDocumentState((current) => {
      const existing = current.bookmarks.find((bookmark) =>
        isCurrentBookmark(bookmark, currentAnchor),
      )
      if (existing) {
        return {
          ...current,
          bookmarks: current.bookmarks.filter((bookmark) => bookmark.id !== existing.id),
        }
      }
      const bookmark: ReaderBookmark = {
        id: createReaderRecordId("bookmark"),
        anchor: currentAnchor,
        label: location?.locationLabel ?? `Page ${currentAnchor.pageIndex + 1}`,
        created: new Date().toISOString(),
      }
      return { ...current, bookmarks: [...current.bookmarks, bookmark] }
    })
  }, [currentAnchor, location?.locationLabel])

  const deleteAnnotation = useCallback((annotationId: string) => {
    setDocumentState((current) => ({
      ...current,
      annotations: current.annotations.filter((annotation) => annotation.id !== annotationId),
    }))
    setAnnotationPopover(null)
    setAnnotationEditor(null)
  }, [])

  const openCreateAnnotation = useCallback(() => {
    if (!selectionAction) return
    removeStagedSelection()
    setAnnotationEditor({
      selection: selectionAction,
      view: {
        mode: "create",
        text: selectionAction.selection.text,
        note: "",
        style: PDF_DEFAULT_ANNOTATION_STYLE,
        color: DEFAULT_ANNOTATION_COLOR_ID,
      },
    })
  }, [removeStagedSelection, selectionAction])

  const openEditAnnotation = useCallback((annotation: ReaderAnnotation) => {
    setAnnotationPopover(null)
    setAnnotationEditor({
      annotationId: annotation.id,
      view: {
        mode: "edit",
        text: annotation.text,
        note: annotation.note,
        style: annotation.style,
        color: annotation.color,
      },
    })
  }, [])

  const createQuickHighlight = useCallback(() => {
    if (!selectionAction) return
    const now = new Date().toISOString()
    const annotation: ReaderAnnotation = {
      id: createReaderRecordId("annotation"),
      anchor: selectionAction.selection.anchor,
      text: selectionAction.selection.text,
      note: "",
      style: PDF_DEFAULT_ANNOTATION_STYLE,
      color: DEFAULT_ANNOTATION_COLOR_ID,
      created: now,
      modified: now,
    }
    setDocumentState((current) => ({
      ...current,
      annotations: [...current.annotations, annotation],
    }))
    dismissSelection(true)
  }, [dismissSelection, selectionAction])

  const saveAnnotationEditor = useCallback(() => {
    if (!annotationEditor) return
    const now = new Date().toISOString()
    if (annotationEditor.view.mode === "edit" && annotationEditor.annotationId) {
      setDocumentState((current) => ({
        ...current,
        annotations: current.annotations.map((annotation) =>
          annotation.id === annotationEditor.annotationId
            ? {
                ...annotation,
                note: annotationEditor.view.note,
                style: annotationEditor.view.style,
                color: annotationEditor.view.color,
                modified: now,
              }
            : annotation,
        ),
      }))
    } else if (annotationEditor.selection) {
      const annotation: ReaderAnnotation = {
        id: createReaderRecordId("annotation"),
        anchor: annotationEditor.selection.selection.anchor,
        text: annotationEditor.selection.selection.text,
        note: annotationEditor.view.note,
        style: annotationEditor.view.style,
        color: annotationEditor.view.color,
        created: now,
        modified: now,
      }
      setDocumentState((current) => ({
        ...current,
        annotations: [...current.annotations, annotation],
      }))
      dismissSelection(true)
    }
    setAnnotationEditor(null)
  }, [annotationEditor, dismissSelection])

  const showAnnotation = useCallback(async (annotation: ReaderAnnotation) => {
    const session = sessionRef.current
    if (!session || annotation.anchor.kind !== "pdf-text") return
    try {
      const target = await session.resolveTextAnchorPosition(annotation.anchor)
      if (target) await session.goTo(target)
    } catch (annotationError) {
      callbacksRef.current.onError?.(
        annotationError instanceof Error
          ? annotationError
          : new Error("The PDF annotation could not be opened."),
      )
    }
  }, [])

  const showSearchResult = useCallback(async (result: ReaderSearchResult) => {
    setSearch((current) => ({ ...current, activeResultId: result.id }))
    try {
      await sessionRef.current?.showSearchResult(result)
    } catch (searchResultError) {
      callbacksRef.current.onError?.(
        searchResultError instanceof Error
          ? searchResultError
          : new Error("The PDF search result could not be opened."),
      )
    }
  }, [])

  const handleSearchQueryChange = useCallback(
    (query: string) => {
      searchAbortRef.current?.abort()
      searchAbortRef.current = null
      cancelQueuedSearchProgress()
      searchRowsBatcher.cancel()
      activeSearchResultRef.current = undefined
      const root = readerSurfaceRef.current
      if (root) removePdfSearchLayers(root)
      setSearch((current) => ({
        query,
        scope: current.scope,
        matchCase: current.matchCase,
        matchWholeWords: current.matchWholeWords,
        matchDiacritics: current.matchDiacritics,
        running: false,
        progress: null,
        rows: [],
      }))
    },
    [cancelQueuedSearchProgress, searchRowsBatcher],
  )

  const runSearch = useCallback(
    async (nextQuery?: string) => {
      const session = sessionRef.current
      const request = searchRequest({
        ...search,
        query: nextQuery ?? search.query,
      })
      if (!session || !request.query.trim()) return
      searchAbortRef.current?.abort()
      cancelQueuedSearchProgress()
      searchRowsBatcher.cancel()
      const abortController = new AbortController()
      searchAbortRef.current = abortController
      activeSearchResultRef.current = undefined
      const root = readerSurfaceRef.current
      if (root) removePdfSearchLayers(root)
      setSearch((current) => ({
        query: request.query,
        scope: current.scope,
        matchCase: current.matchCase,
        matchWholeWords: current.matchWholeWords,
        matchDiacritics: current.matchDiacritics,
        running: true,
        progress: 0,
        rows: [],
      }))
      try {
        const results = await session.search(
          request,
          abortController.signal,
          (nextProgress) => {
            queueSearchProgress(
              nextProgress.totalPages ? nextProgress.completedPages / nextProgress.totalPages : 0,
            )
          },
          (pageResults) => {
            if (abortController.signal.aborted || searchAbortRef.current !== abortController) {
              return
            }
            searchRowsBatcher.queue(pageResults)
          },
        )
        if (abortController.signal.aborted) return
        cancelQueuedSearchProgress()
        searchRowsBatcher.cancel()
        const rows: ReaderSearchRow[] = results.map((result) => ({
          id: result.id,
          kind: "result",
          result,
        }))
        setSearch((current) => ({
          ...current,
          running: false,
          progress: 1,
          rows,
          ...(current.activeResultId &&
          results.some((result) => result.id === current.activeResultId)
            ? { activeResultId: current.activeResultId }
            : results[0]
              ? { activeResultId: results[0].id }
              : {}),
        }))
      } catch (searchError) {
        if (abortController.signal.aborted) return
        cancelQueuedSearchProgress()
        searchRowsBatcher.cancel()
        setSearch((current) => ({ ...current, running: false, progress: null }))
        callbacksRef.current.onError?.(
          searchError instanceof Error ? searchError : new Error("PDF search failed."),
        )
      } finally {
        if (searchAbortRef.current === abortController) searchAbortRef.current = null
      }
    },
    [cancelQueuedSearchProgress, queueSearchProgress, search, searchRowsBatcher],
  )

  const cycleSearch = useCallback(
    (direction: 1 | -1) => {
      const results = searchResults(search.rows)
      if (results.length === 0) return
      const currentIndex = results.findIndex((result) => result.id === search.activeResultId)
      const nextIndex = (Math.max(0, currentIndex) + direction + results.length) % results.length
      const result = results[nextIndex]
      if (!result) return
      void showSearchResult(result)
    },
    [search, showSearchResult],
  )

  const navigateHistory = useCallback((direction: 1 | -1) => {
    const historyState = historyRef.current
    const cursor = historyState.cursor + direction
    const target = historyState.entries[cursor]
    if (!target) return
    historyRef.current = { ...historyState, cursor, navigating: true }
    setHistoryRevision((revision) => revision + 1)
    void sessionRef.current?.goTo(target)
    if (historySettleTimerRef.current) clearTimeout(historySettleTimerRef.current)
    historySettleTimerRef.current = setTimeout(() => {
      historyRef.current = { ...historyRef.current, navigating: false }
    }, PDF_HISTORY_NAVIGATION_SETTLE_MS)
  }, [])

  const handleKeyboard = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (isEditingTarget(event.target)) return
      const command = event.metaKey || event.ctrlKey
      if (command && event.key.toLowerCase() === "f") {
        event.preventDefault()
        setSearchOpen(true)
        return
      }
      if (command && event.key.toLowerCase() === "d") {
        event.preventDefault()
        toggleBookmark()
        return
      }
      if (command && event.key.toLowerCase() === "l") {
        event.preventDefault()
        setLocationDraft(location?.pageLabel ?? String((currentAnchor?.pageIndex ?? 0) + 1))
        setLocationOpen(true)
        return
      }
      if (command && event.key === ",") {
        event.preventDefault()
        setPreferencesOpen(true)
        return
      }
      if (command && (event.key === "+" || event.key === "=")) {
        event.preventDefault()
        sessionRef.current?.zoomIn()
        return
      }
      if (command && event.key === "-") {
        event.preventDefault()
        sessionRef.current?.zoomOut()
        return
      }
      if (command && event.key === "0") {
        event.preventDefault()
        updateMode({ ...mode, scaleMode: "fit-width" })
        return
      }
      if (event.altKey && event.key === "ArrowLeft") {
        event.preventDefault()
        navigateHistory(-1)
        return
      }
      if (event.altKey && event.key === "ArrowRight") {
        event.preventDefault()
        navigateHistory(1)
        return
      }
      if (event.shiftKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        const container = containerRef.current
        if (!container || container.scrollWidth <= container.clientWidth) return
        event.preventDefault()
        container.scrollLeft +=
          event.key === "ArrowLeft" ? -PDF_KEYBOARD_PAN_DISTANCE_PX : PDF_KEYBOARD_PAN_DISTANCE_PX
        return
      }
      if (event.key === "PageUp" || event.key === "ArrowLeft") {
        event.preventDefault()
        sessionRef.current?.previousPage()
        return
      }
      if (event.key === "PageDown" || event.key === "ArrowRight") {
        event.preventDefault()
        sessionRef.current?.nextPage()
        return
      }
      if (event.key === "?") {
        event.preventDefault()
        setHelpOpen(true)
        return
      }
      if (event.key === "Escape") {
        setSearchOpen(false)
        setPreferencesOpen(false)
        setAnnotationPopover(null)
        dismissSelection(true)
      }
    },
    [
      currentAnchor?.pageIndex,
      dismissSelection,
      location?.pageLabel,
      mode,
      navigateHistory,
      toggleBookmark,
      updateMode,
    ],
  )

  const commitProgressNavigation = useCallback((nextProgress: number) => {
    const pageCount = snapshotRef.current?.pageCount
    if (!pageCount) return
    setProgressDraft(null)
    const pageIndex = Math.min(
      pageCount - 1,
      Math.floor((nextProgress / PDF_PROGRESS_MAX) * pageCount),
    )
    void sessionRef.current
      ?.goTo({ kind: "pdf-position", pageIndex, xRatio: 0, yRatio: 0 })
      .catch(() => undefined)
  }, [])

  const cancelPasswordPrompt = useCallback(() => {
    const passwordError = new Error("A password is required to open this PDF.")
    const session = sessionRef.current
    sessionRef.current = null
    setPasswordPrompt(null)
    callbacksRef.current.onOpeningInteractionChange?.(false)
    setError(passwordError)
    setStatus("error")
    void session?.destroy().catch(() => undefined)
    callbacksRef.current.onError?.(passwordError)
  }, [])

  const submitPassword = useCallback(() => {
    if (!passwordPrompt || !passwordDraft) return
    passwordPrompt.updatePassword(passwordDraft)
    setPasswordPrompt(null)
    callbacksRef.current.onOpeningInteractionChange?.(false)
  }, [passwordDraft, passwordPrompt])

  return (
    <section
      ref={rootRef}
      tabIndex={0}
      data-component="pdf-reader"
      data-reader-theme={theme.id}
      data-appearance={theme.appearance}
      onKeyDown={handleKeyboard}
      className={cn(
        "flex h-full min-h-0 w-full flex-col overflow-hidden bg-surface-base text-text-base",
        preferences.autohideCursor && "cursor-none",
        className,
      )}
    >
      {showToolbar ? (
        <header className="relative z-20 shrink-0 border-b border-border-base/40">
          <div className="absolute inset-x-0 top-0 h-px bg-border-base/30">
            <div
              className="h-full bg-text-interactive-base"
              style={{ width: `${Math.round(progress * PDF_SCALE_PERCENT)}%` }}
            />
          </div>
          <div className="relative flex h-11 min-w-0 items-center gap-1 px-2">
            <ReaderTocPopover
              items={snapshot?.toc ?? []}
              activeLabel={location?.tocLabel}
              onSelect={(navigationId) => void sessionRef.current?.navigate(navigationId)}
            />
            <ReaderBookmarksPopover
              bookmarks={documentState.bookmarks}
              currentBookmarkId={currentBookmark?.id}
              onToggleBookmark={toggleBookmark}
              onGoToBookmark={(target) => {
                if (target.kind === "pdf-position") void sessionRef.current?.goTo(target)
              }}
              onDeleteBookmark={(bookmarkId) =>
                setDocumentState((current) => ({
                  ...current,
                  bookmarks: current.bookmarks.filter((bookmark) => bookmark.id !== bookmarkId),
                }))
              }
            />
            <ReaderAnnotationsPopover
              annotations={documentState.annotations}
              onShowAnnotation={(annotation) => void showAnnotation(annotation)}
              onEditAnnotation={openEditAnnotation}
              onDeleteAnnotation={deleteAnnotation}
            />

            <div className="min-w-0 flex-1" />
            <div className="pointer-events-none absolute inset-0 hidden items-center justify-center px-72 md:flex">
              <ReaderMetadataHoverCard snapshot={snapshot}>
                <button
                  type="button"
                  className="pointer-events-auto max-w-full truncate text-xs font-medium"
                >
                  {snapshot?.title ?? source.sourceId}
                </button>
              </ReaderMetadataHoverCard>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Zoom out"
              onClick={() => sessionRef.current?.zoomOut()}
            >
              <MinusIcon />
            </Button>
            <button
              type="button"
              onClick={() => updateMode({ ...mode, scaleMode: "fit-width" })}
              className="min-w-12 px-1 text-center font-mono text-xs text-text-weaker hover:text-text-base"
              aria-label="Reset to fit width"
            >
              {Math.round(scale * PDF_SCALE_PERCENT)}%
            </button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Zoom in"
              onClick={() => sessionRef.current?.zoomIn()}
            >
              <PlusIcon />
            </Button>
            <ReaderSearchPopover
              search={search}
              onQueryChange={handleSearchQueryChange}
              onRunSearch={() => void runSearch()}
              onCycleResults={cycleSearch}
              onScopeChange={(scope) => setSearch((current) => ({ ...current, scope }))}
              onMatchCaseChange={(matchCase) => setSearch((current) => ({ ...current, matchCase }))}
              onMatchWholeWordsChange={(matchWholeWords) =>
                setSearch((current) => ({ ...current, matchWholeWords }))
              }
              onMatchDiacriticsChange={(matchDiacritics) =>
                setSearch((current) => ({ ...current, matchDiacritics }))
              }
              onShowResult={(target) => {
                const result = searchResults(search.rows).find((candidate) =>
                  readerTextAnchorEquals(candidate.anchor, target),
                )
                if (result) void showSearchResult(result)
              }}
              canSearchSection={Boolean(snapshot?.toc.length)}
              ready={status === "ready"}
              open={searchOpen}
              onOpenChange={setSearchOpen}
            />
            <ReaderPreferencesPopover open={preferencesOpen} onOpenChange={setPreferencesOpen}>
              <ReaderPreferencesPanel
                preferences={preferences}
                themes={READER_THEME_OPTIONS}
                onThemeChange={setTheme}
                onReduceMotionChange={(reduceMotion) =>
                  setPreferences((current) => ({ ...current, reduceMotion }))
                }
                onAutohideCursorChange={(autohideCursor) =>
                  setPreferences((current) => ({ ...current, autohideCursor }))
                }
                engineControls={
                  <PdfEnginePreferences
                    mode={mode}
                    currentScale={scale}
                    onModeChange={updateMode}
                  />
                }
              />
            </ReaderPreferencesPopover>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={currentBookmark ? "Remove bookmark" : "Add bookmark"}
              onClick={toggleBookmark}
            >
              <BookmarkIcon className={cn(currentBookmark && "fill-current")} />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Reader actions">
                  <EllipsisIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem
                  onClick={() => {
                    setLocationDraft(
                      location?.pageLabel ?? String((currentAnchor?.pageIndex ?? 0) + 1),
                    )
                    setLocationOpen(true)
                  }}
                >
                  <MapIcon data-icon="inline-start" />
                  Go to page
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {PDF_LAYOUT_OPTIONS.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    onClick={() => updateMode({ ...mode, layout: option.value })}
                  >
                    <CheckIcon
                      data-icon="inline-start"
                      className={cn(mode.layout !== option.value && "invisible")}
                    />
                    {option.value === "continuous" ? (
                      <Rows3Icon data-icon="inline-start" />
                    ) : option.value === "two-up" ? (
                      <Columns2Icon data-icon="inline-start" />
                    ) : (
                      <FileIcon data-icon="inline-start" />
                    )}
                    {option.label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem
                  onClick={() => updateMode({ ...mode, rotation: rotationAfter(mode.rotation) })}
                >
                  <RotateCwIcon data-icon="inline-start" />
                  Rotate clockwise ({mode.rotation}°)
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setHelpOpen(true)}>
                  <CircleHelpIcon data-icon="inline-start" />
                  Keyboard shortcuts
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
      ) : null}

      {layoutFallback ? (
        <div role="status" className="z-10 border-b bg-surface-warning-weak px-3 py-2 text-xs">
          {layoutFallback}
        </div>
      ) : null}

      <div
        ref={readerSurfaceRef}
        className={cn("relative min-h-0 min-w-0 flex-1", theme.viewportClassName)}
      >
        {status === "loading" ? (
          <div className="pointer-events-none absolute inset-x-3 top-3 z-30">
            <div className="inline-flex items-center gap-2 rounded-full border bg-surface-raised-base px-3 py-1.5 text-xs shadow-sm">
              <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" />
              Opening PDF…
            </div>
          </div>
        ) : null}
        {status === "error" && error ? <ReaderErrorState error={error} /> : null}
        <div
          ref={containerRef}
          className={cn(
            "buddy-pdfjs-scope absolute inset-0 overflow-y-auto overscroll-contain",
            mode.scaleMode === "custom" ? "overflow-x-auto" : "overflow-x-hidden",
            status === "error" && "hidden",
          )}
        >
          <div ref={viewerElementRef} className="pdfViewer" />
        </div>

        {status === "ready" && shouldShowPdfPageTurnControls(mode, layoutFallback !== null) ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Previous page"
              onClick={() => sessionRef.current?.previousPage()}
              className="absolute left-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-surface-raised-base shadow-sm"
            >
              <ChevronLeftIcon />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Next page"
              onClick={() => sessionRef.current?.nextPage()}
              className="absolute right-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-surface-raised-base shadow-sm"
            >
              <ChevronRightIcon />
            </Button>
          </>
        ) : null}

        <ReaderSelectionToolbar
          selectionAction={
            selectionAction
              ? {
                  text: selectionAction.selection.text,
                  x: selectionAction.x,
                  y: selectionAction.y,
                }
              : null
          }
          anchorRoot={readerSurfaceRef.current}
          onCopyText={(text) => void handleCopySelection(text)}
          onHighlight={createQuickHighlight}
          onOpenAnnotationDialog={openCreateAnnotation}
          onSearch={(query) => {
            removeStagedSelection()
            setSearch((current) => ({ ...current, query }))
            setSearchOpen(true)
            void runSearch(query)
          }}
          onClose={() => dismissSelection(true)}
        />
        <ReaderAnnotationPopover
          popover={annotationPopover}
          anchorRoot={readerSurfaceRef.current}
          annotations={documentState.annotations}
          onEditAnnotation={openEditAnnotation}
          onDeleteAnnotation={deleteAnnotation}
        />
      </div>

      {snapshot && status === "ready" ? (
        <footer className="z-20 flex h-10 shrink-0 flex-col justify-center border-t px-5">
          <div className="flex items-center justify-between gap-4">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Go back in reading history"
              onClick={() => navigateHistory(-1)}
              disabled={!canGoBack}
            >
              <Undo2Icon />
            </Button>
            <div className="min-w-0 truncate text-xs text-text-weaker">
              <span>{location?.tocLabel ?? snapshot.title}</span>
              <span aria-hidden="true" className="px-2">
                ·
              </span>
              <span className="font-mono">
                {location?.locationLabel ?? `${Math.round(progress * PDF_SCALE_PERCENT)}%`}
              </span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Go forward in reading history"
              onClick={() => navigateHistory(1)}
              disabled={!canGoForward}
            >
              <Redo2Icon />
            </Button>
          </div>
          <ReaderProgressScrubber
            max={PDF_PROGRESS_MAX}
            value={progressValue}
            onPreview={setProgressDraft}
            onCommit={commitProgressNavigation}
            onCancel={() => setProgressDraft(null)}
            className="h-1 w-full cursor-pointer accent-text-interactive-base"
          />
        </footer>
      ) : null}

      <style>{`
          .buddy-pdfjs-scope {
            position: absolute;
            inset: 0;
          }

          .buddy-pdfjs-scope .pdfViewer {
            min-width: min-content;
            --page-bg-color: ${theme.contentBackground};
          }

          .buddy-pdfjs-scope .canvasWrapper,
          .buddy-pdfjs-scope .annotationLayer {
            filter: ${theme.pdfFilter};
          }

          .buddy-pdfjs-scope .textLayer {
            cursor: text;
          }

          .buddy-pdfjs-scope .page {
            box-sizing: content-box;
            isolation: isolate;
          }

          .buddy-pdfjs-scope .textLayer ::selection {
            background: ${READER_SELECTION_BACKGROUND};
            color: ${READER_SELECTION_FOREGROUND};
          }

          .buddy-pdfjs-scope .textLayer .endOfContent::selection {
            background: transparent;
          }

          .buddy-pdfjs-scope,
          .buddy-pdfjs-scope * {
            scrollbar-width: thin;
            scrollbar-color: color-mix(in oklab, var(--text-weak) 36%, transparent) transparent;
          }
        `}</style>

      <ReaderAnnotationDialog
        dialog={annotationEditor?.view ?? null}
        onChangeNote={(note) =>
          setAnnotationEditor((current) =>
            current ? { ...current, view: { ...current.view, note } } : null,
          )
        }
        onChangeStyle={(style) =>
          setAnnotationEditor((current) =>
            current ? { ...current, view: { ...current.view, style } } : null,
          )
        }
        onChangeColor={(color) =>
          setAnnotationEditor((current) =>
            current ? { ...current, view: { ...current.view, color } } : null,
          )
        }
        onSave={saveAnnotationEditor}
        onCancel={() => setAnnotationEditor(null)}
        onDelete={
          annotationEditor?.annotationId
            ? () => deleteAnnotation(annotationEditor.annotationId ?? "")
            : undefined
        }
      />

      <Dialog open={locationOpen} onOpenChange={setLocationOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Go to page</DialogTitle>
            <DialogDescription>
              Enter a page number or a page label from this PDF.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="pdf-reader-page-target">Page</FieldLabel>
            <Input
              id="pdf-reader-page-target"
              value={locationDraft}
              onChange={(event) => setLocationDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return
                event.preventDefault()
                sessionRef.current?.goToPage(locationDraft.trim())
                setLocationOpen(false)
              }}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setLocationOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                sessionRef.current?.goToPage(locationDraft.trim())
                setLocationOpen(false)
              }}
            >
              Go
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(passwordPrompt)}
        onOpenChange={(open) => {
          if (!open && passwordPrompt) cancelPasswordPrompt()
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Password required</DialogTitle>
            <DialogDescription>
              {passwordPrompt?.reason === PasswordResponses.INCORRECT_PASSWORD
                ? "That password was not accepted. Try again."
                : "Enter the password for this PDF."}
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="pdf-reader-password">Password</FieldLabel>
            <Input
              id="pdf-reader-password"
              type="password"
              autoFocus
              value={passwordDraft}
              onChange={(event) => setPasswordDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return
                event.preventDefault()
                submitPassword()
              }}
            />
          </Field>
          <DialogFooter>
            <Button type="button" onClick={submitPassword} disabled={!passwordDraft}>
              Unlock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReaderHelpDialog
        open={helpOpen}
        onOpenChange={setHelpOpen}
        shortcuts={PDF_READER_SHORTCUTS}
      />
    </section>
  )
})

PdfReader.displayName = "PdfReader"

export default PdfReader
