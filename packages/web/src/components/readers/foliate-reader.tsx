import {
  forwardRef,
  startTransition,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react"
import {
  Button,
  cn,
  toast,
  // Icons from @buddy/ui
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@buddy/ui"
import { Loader2Icon } from "@/icons/app-icons"
import { useBenchSurfaceActive } from "@/components/bench/bench-surface-activity"
import { ReaderEmptyState } from "./ui/reader-empty-state"
import { ReaderErrorState } from "./ui/reader-error-state"
import { ReaderFocusExit } from "./ui/reader-focus-exit"
import { ReaderLocationPopover } from "./ui/reader-location-popover"
import { ReaderMarksPopover } from "./ui/reader-marks-popover"
import { ReaderMetadataHoverCard } from "./ui/reader-metadata-hover-card"
import { ReaderProgressRail } from "./ui/reader-progress-rail"
import { ReaderPreferencesPopover } from "./ui/reader-preferences-popover"
import { ReaderSearchPopover } from "./ui/reader-search-popover"
import { ReaderStatusPill } from "./ui/reader-status-pill"
import { ReaderToolbar } from "./ui/reader-toolbar"
import { ReaderTocPopover } from "./ui/reader-toc-popover"
import { useReaderRecentLocations } from "./ui/use-reader-recent-locations"
import { ReaderHelpDialog } from "./ui/reader-help-dialog"
import { FoliateLocationDialog } from "./ui/foliate-location-dialog"
import { ReaderAnnotationDialog } from "./ui/reader-annotation-dialog"
import { ReaderAnnotationPopover } from "./ui/reader-annotation-popover"
import { ReaderSelectionToolbar } from "./ui/reader-selection-toolbar"
import { FoliatePreferencesPanel } from "./ui/foliate-preferences-panel"
import { ensureFoliateRuntimeCompat } from "@/lib/foliate/ensure-foliate-runtime-compat"
import type {
  FoliateDrawAnnotationEventDetail,
  FoliateNavigationTarget,
  FoliateRelocationDetail,
  FoliateSearchResult,
  View as FoliateView,
} from "foliate-js/view.js"
import { FoliateMetadataValueSchema, formatContributor, formatMetadataValue } from "./utils/foliate-formatters"
import type {
  FoliateReaderHandle,
  FoliateReaderLocation,
  FoliateReaderProps,
  FoliateReaderSnapshot,
  FoliateReaderSource,
  ReaderAnnotation,
  ReaderAnnotationDialogState,
  ReaderAnnotationPopoverState,
  ReaderBookmark,
  ReaderSearchRow,
  ReaderSearchState,
  ReaderSelectionAction,
  ReaderSelectionToolbarState,
} from "./foliate-reader-types"
import {
  ANNOTATION_COLOR_IDS,
  ANNOTATION_STYLE_HIGHLIGHT,
  DEFAULT_ANNOTATION_COLOR_ID,
  DEFAULT_AUTHOR,
  DEFAULT_PROGRESS_STEPS,
  DEFAULT_TITLE,
  FLOW_PAGINATED,
  FLOW_SCROLLED,
  SEARCH_RESULT_KEY_PREFIX,
  SEARCH_SCOPE_BOOK,
  SEARCH_SCOPE_SECTION,
  SEARCH_SECTION_KEY_PREFIX,
  SHORTCUTS,
  VIEWPORT_CLASS_NAME,
  VIEW_ELEMENT_CLASS_NAME,
  resolveReaderContentFilter,
} from "./foliate-reader-constants"
import {
  buildLandmarks,
  buildLocationState,
  buildNavigationTargetDependencyKey,
  buildSourceDependencyKey,
  cleanupView,
  copyText,
  flattenTocItems,
  getAnnotationAtValue,
  getAnnotationColorId,
  getAnnotationColorValue,
  getAnnotationStyle,
  getBookmarkAtLocation,
  getOverlayPosition,
  getSearchResultRows,
  getSourceFormatLabel,
  getSourceName,
  isEditingTarget,
  readSelectedRange,
  releaseObjectUrl,
  resolveAnnotationColorValue,
  resolveRestorableNavigationTarget,
  resolveCoverUrl,
  syncMarginals,
  toFoliateInput,
} from "./utils/foliate-helpers"
import {
  buildBookPersistenceKey,
  loadBookState,
  loadGlobalPreferences,
  loadMirroredEpubBookState,
  saveFoliateBookPersistenceTarget,
  saveGlobalPreferences,
  type FoliateBookPersistenceTarget,
} from "./utils/foliate-storage"
import {
  applyReaderPreferences,
  getThemeDefinition,
  syncReaderResponsiveMargin,
} from "./utils/foliate-themes"
import {
  READER_NAVIGATION_GO_LEFT,
  READER_NAVIGATION_GO_RIGHT,
  READER_NAVIGATION_NEXT,
  resolveReaderArrowNavigation,
  resolveReaderWheelNavigation,
} from "./utils/foliate-navigation"
import { drawAnnotation, toAnnotationDialogState } from "./utils/foliate-drawing"
import {
  removeFoliateAnnotation,
  renderFoliateAnnotation,
  revealFoliateAnnotation,
} from "./utils/foliate-annotations"
import { withReaderSourceContentFingerprint } from "./reader-storage"
import type {
  ReaderAnnotationViewModel,
  ReaderBookmark as CommonReaderBookmark,
} from "./reader-types"
import {
  foliateAnnotationDialogToReaderEditor,
  foliateAnnotationsToReaderAnnotations,
  foliateBookmarksToReaderBookmarks,
  foliateSearchToReaderSearch,
  foliateSnapshotToReaderSnapshot,
  readerPositionAnchorToFoliateTarget,
  readerSearchScopeToFoliateScope,
  readerTextAnchorToFoliateCfi,
} from "./foliate-reader-adapters"
import { foliateLocationToReaderRelocation } from "./document-reader-adapters"
// Components already imported above

ensureFoliateRuntimeCompat()

const WHEEL_GESTURE_IDLE_THRESHOLD_MS = 180
const READER_PERCENT_MAX = 100
const HOST_THEME_ATTRIBUTE_FILTER = ["class", "style", "data-theme", "data-color-scheme"]

function drawAnnotationListener(event: CustomEvent<FoliateDrawAnnotationEventDetail>) {
  drawAnnotation(event)
}

function foliateBookmarkOrder(bookmark: CommonReaderBookmark): string {
  return bookmark.anchor.kind === "cfi-position" ? bookmark.anchor.cfi : ""
}

function foliateAnnotationOrder(annotation: ReaderAnnotationViewModel): string {
  return annotation.anchor.kind === "cfi-text" ? annotation.anchor.cfi : ""
}

function readAnnotationThemeSignature(): string {
  const root = globalThis.document?.documentElement
  if (!root) return ""
  return ANNOTATION_COLOR_IDS.map((colorId) =>
    resolveAnnotationColorValue(colorId, root),
  ).join("\0")
}

function useAnnotationThemeSignature(): string {
  const [signature, setSignature] = useState(readAnnotationThemeSignature)

  useEffect(() => {
    const syncSignature = () => setSignature(readAnnotationThemeSignature())
    syncSignature()
    if (!("MutationObserver" in globalThis)) return

    const observer = new MutationObserver(syncSignature)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: HOST_THEME_ATTRIBUTE_FILTER,
    })
    return () => observer.disconnect()
  }, [])

  return signature
}

function createSelectionKey() {
  const random = Math.random().toString(36).slice(2, 10)
  return `sel_${Date.now().toString(36)}_${random}`
}

export type {
  FoliateReaderAnnotationStyle,
  FoliateReaderFlow,
  FoliateReaderFontPreset,
  FoliateReaderHandle,
  FoliateReaderLandmark,
  FoliateReaderLocation,
  FoliateReaderSelection,
  FoliateReaderSearchScope,
  FoliateReaderSnapshot,
  FoliateReaderSource,
  FoliateReaderThemeId,
  ReaderAnnotationColorId,
  ReaderShortcut,
} from "./foliate-reader-types"

export const FoliateReader = forwardRef<FoliateReaderHandle, FoliateReaderProps>(
  function FoliateReader(
    {
      source,
      readerSource,
      className,
      initialLocation,
      defaultTheme = "paper",
      defaultFlow = FLOW_PAGINATED,
      showToolbar = true,
      emptyState,
      onReady,
      onLocationChange,
      onChatSelection,
      onChatSelectionRemoved,
      onOpenExternalLink,
      onError,
      onAnnotationsChange,
      persistenceSuffix,
    },
    ref,
  ) {
    const rootRef = useRef<HTMLElement | null>(null)
    const readerSurfaceRef = useRef<HTMLDivElement | null>(null)
    const viewportRef = useRef<HTMLDivElement | null>(null)
    const viewRef = useRef<FoliateView | null>(null)
    const coverUrlRef = useRef<string | undefined>(undefined)
    const snapshotRef = useRef<FoliateReaderSnapshot | null>(null)
    const locationRef = useRef<FoliateReaderLocation>({})
    const searchGeneratorRef = useRef<AsyncGenerator<FoliateSearchResult> | null>(null)
    const searchRunIdRef = useRef(0)
    const selectionActionRef = useRef<ReaderSelectionAction | null>(null)
    const stagedSelectionKeyRef = useRef<string | null>(null)
    const wheelNavigationGestureRef = useRef<{
      command: ReturnType<typeof resolveReaderWheelNavigation>
      lastEventAt: number | undefined
    }>({ command: undefined, lastEventAt: undefined })
    const annotationRefreshFrameRef = useRef<number | undefined>(undefined)
    const responsiveMarginObserverRef = useRef<ResizeObserver | null>(null)
    const callbacksRef = useRef({
      onReady,
      onLocationChange,
      onChatSelection,
      onChatSelectionRemoved,
      onOpenExternalLink,
      onError,
      onAnnotationsChange,
    })
    const [preferences, setPreferences] = useState(() =>
      loadGlobalPreferences(defaultTheme, defaultFlow),
    )
    const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle")
    const [snapshot, setSnapshot] = useState<FoliateReaderSnapshot | null>(null)
    const [location, setLocation] = useState<FoliateReaderLocation>({})
    const [error, setError] = useState<Error | null>(null)
    const [historyState, setHistoryState] = useState({ canGoBack: false, canGoForward: false })
    const [persistenceTarget, setPersistenceTarget] = useState<FoliateBookPersistenceTarget | null>(
      null,
    )
    const [bookmarks, setBookmarks] = useState<ReaderBookmark[]>([])
    const [annotations, setAnnotations] = useState<ReaderAnnotation[]>([])
    const [searchState, setSearchState] = useState<ReaderSearchState>({
      query: "",
      scope: SEARCH_SCOPE_BOOK,
      matchCase: false,
      matchWholeWords: false,
      matchDiacritics: false,
      running: false,
      progress: null,
      rows: [],
    })
    const [selectionToolbar, setSelectionToolbar] = useState<ReaderSelectionToolbarState | null>(
      null,
    )
    const [annotationPopover, setAnnotationPopover] = useState<ReaderAnnotationPopoverState | null>(
      null,
    )
    const [annotationDialog, setAnnotationDialog] = useState<ReaderAnnotationDialogState | null>(
      null,
    )
    const [searchOpen, setSearchOpen] = useState(false)
    const [tocOpen, setTocOpen] = useState(false)
    const [marksOpen, setMarksOpen] = useState(false)
    const [preferencesOpen, setPreferencesOpen] = useState(false)
    const [helpOpen, setHelpOpen] = useState(false)
    const [locationDialogOpen, setLocationDialogOpen] = useState(false)
    const [locationDraft, setLocationDraft] = useState("")
    const [goToOpen, setGoToOpen] = useState(false)
    const [goToDraft, setGoToDraft] = useState("")
    const [focus, setFocus] = useState(false)
    const [progressDraft, setProgressDraft] = useState<number | null>(null)
    const preferencesRef = useRef(preferences)
    const annotationsRef = useRef(annotations)
    const bookmarksRef = useRef(bookmarks)
    const searchStateRef = useRef(searchState)
    const annotationDialogRef = useRef(annotationDialog)
    // ReaderSource also carries persistence metadata such as sourceId. That metadata may resolve
    // after the Blob is already opening and must not restart Foliate's content lifecycle.
    const readerSourceRef = useRef(readerSource)
    const persistenceSuffixRef = useRef(persistenceSuffix)
    const benchSurfaceActive = useBenchSurfaceActive()
    const benchSurfaceActiveRef = useRef(benchSurfaceActive)
    benchSurfaceActiveRef.current = benchSurfaceActive

    const sourceDependencyKey = buildSourceDependencyKey(source)
    const initialLocationDependencyKey = buildNavigationTargetDependencyKey(initialLocation)
    const stableSourceRef = useRef<{ key: string; value: FoliateReaderSource | null }>({
      key: sourceDependencyKey,
      value: source,
    })
    const stableInitialLocationRef = useRef<{
      key: string
      value: FoliateNavigationTarget | undefined
    }>({
      key: initialLocationDependencyKey,
      value: initialLocation,
    })

    if (stableSourceRef.current.key !== sourceDependencyKey) {
      stableSourceRef.current = { key: sourceDependencyKey, value: source }
    }
    if (stableInitialLocationRef.current.key !== initialLocationDependencyKey) {
      stableInitialLocationRef.current = {
        key: initialLocationDependencyKey,
        value: initialLocation,
      }
    }

    const stableSource = stableSourceRef.current.value
    const stableInitialLocation = stableInitialLocationRef.current.value
    const annotationThemeSignature = useAnnotationThemeSignature()
    const theme = getThemeDefinition(preferences.themeId)
    const canChangeFlow = snapshot ? !snapshot.isFixedLayout : false
    const showPageTurnControls =
      status === "ready" &&
      snapshot !== null &&
      (snapshot.isFixedLayout || preferences.flow === FLOW_PAGINATED)
    const currentBookmark = useMemo(
      () => getBookmarkAtLocation(bookmarks, location.cfi),
      [bookmarks, location.cfi],
    )
    const flattenedToc = useMemo(() => flattenTocItems(snapshot?.toc ?? []), [snapshot?.toc])
    const readerLandmarks = snapshot?.landmarks ?? []
    const readerSnapshot = useMemo(() => foliateSnapshotToReaderSnapshot(snapshot), [snapshot])
    const readerBookmarks = useMemo(() => foliateBookmarksToReaderBookmarks(bookmarks), [bookmarks])
    const readerAnnotations = useMemo(
      () => foliateAnnotationsToReaderAnnotations(annotations),
      [annotations],
    )
    const readerSearch = useMemo(() => foliateSearchToReaderSearch(searchState), [searchState])
    const readerAnnotationEditor = useMemo(
      () => foliateAnnotationDialogToReaderEditor(annotationDialog),
      [annotationDialog],
    )
    const readerAnnotationPopover = annotationPopover
      ? {
          annotationId: annotationPopover.value,
          x: annotationPopover.x,
          y: annotationPopover.y,
        }
      : null
    const readerRelocation = useMemo(() => foliateLocationToReaderRelocation(location), [location])
    const recentLocations = useReaderRecentLocations({
      sourceKey: sourceDependencyKey,
      relocation: readerRelocation,
    })

    callbacksRef.current = {
      onReady,
      onLocationChange,
      onChatSelection,
      onChatSelectionRemoved,
      onOpenExternalLink,
      onError,
      onAnnotationsChange,
    }
    preferencesRef.current = preferences
    annotationsRef.current = annotations
    bookmarksRef.current = bookmarks
    searchStateRef.current = searchState
    annotationDialogRef.current = annotationDialog
    readerSourceRef.current = readerSource
    persistenceSuffixRef.current = persistenceSuffix

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
          setPreferences((current) => ({ ...current, themeId: nextTheme }))
        },
        setFlow: (nextFlow) => {
          setPreferences((current) => ({ ...current, flow: nextFlow }))
        },
        getSnapshot: () => snapshotRef.current,
      }),
      [],
    )

    const hydrateAnnotations = useCallback(
      async (view: FoliateView, nextAnnotations: ReaderAnnotation[], onlyIndex?: number) => {
        for (const annotation of nextAnnotations) {
          if (viewRef.current !== view) return
          let info
          try {
            info = await renderFoliateAnnotation(
              view,
              {
                ...annotation,
                color: resolveAnnotationColorValue(
                  getAnnotationColorId(annotation.color),
                  readerSurfaceRef.current,
                ),
              },
              onlyIndex,
            )
          } catch (error) {
            if (viewRef.current !== view) return
            console.warn("Failed to hydrate reader annotation", {
              annotation,
              error,
            })
            continue
          }
          if (viewRef.current !== view) return
          if (!info) continue
          if (annotation.index === info.index && annotation.label === info.label) continue
          setAnnotations((current) =>
            current.map((entry) =>
              entry.value === annotation.value
                ? { ...entry, index: info.index, label: info.label }
                : entry,
            ),
          )
        }
      },
      [],
    )

    const scheduleAnnotationRefresh = useCallback(
      (view: FoliateView, nextAnnotations: ReaderAnnotation[], onlyIndex?: number) => {
        const pendingFrame = annotationRefreshFrameRef.current
        if (pendingFrame !== undefined) cancelAnimationFrame(pendingFrame)
        annotationRefreshFrameRef.current = requestAnimationFrame(() => {
          annotationRefreshFrameRef.current = requestAnimationFrame(() => {
            annotationRefreshFrameRef.current = undefined
            if (viewRef.current !== view) return
            void hydrateAnnotations(view, nextAnnotations, onlyIndex)
          })
        })
      },
      [hydrateAnnotations],
    )

    useLayoutEffect(() => {
      const view = viewRef.current
      if (!view?.renderer) return

      if (!benchSurfaceActive) {
        responsiveMarginObserverRef.current?.disconnect()
        responsiveMarginObserverRef.current = null
        return
      }

      scheduleAnnotationRefresh(view, annotationsRef.current, locationRef.current.index)
    }, [benchSurfaceActive, scheduleAnnotationRefresh])

    useLayoutEffect(() => {
      if (!benchSurfaceActive || status !== "ready") return
      const view = viewRef.current
      const surface = readerSurfaceRef.current
      if (!view?.renderer || !surface || view.isFixedLayout) return

      const syncResponsiveMargin = () => {
        if (
          !benchSurfaceActiveRef.current ||
          viewRef.current !== view ||
          view.isFixedLayout ||
          view.getBoundingClientRect().width <= 0
        ) {
          return
        }
        syncReaderResponsiveMargin(view, preferencesRef.current)
      }

      // Activation position restoration is deliberately separate from responsive layout. This
      // observer watches only the visible host and writes the margin only when the value changes.
      syncResponsiveMargin()
      if (!("ResizeObserver" in globalThis)) return
      const resizeObserver = new ResizeObserver(syncResponsiveMargin)
      responsiveMarginObserverRef.current = resizeObserver
      resizeObserver.observe(surface)
      return () => {
        resizeObserver.disconnect()
        if (responsiveMarginObserverRef.current === resizeObserver) {
          responsiveMarginObserverRef.current = null
        }
      }
    }, [benchSurfaceActive, status])

    useEffect(() => {
      return () => {
        const pendingFrame = annotationRefreshFrameRef.current
        if (pendingFrame !== undefined) cancelAnimationFrame(pendingFrame)
        annotationRefreshFrameRef.current = undefined
      }
    }, [])

    useEffect(() => {
      saveGlobalPreferences(preferences)
      const view = viewRef.current
      if (!view) return
      applyReaderPreferences(view, theme, preferences)
      syncMarginals(view, snapshotRef.current, locationRef.current)
    }, [preferences, theme])

    useEffect(() => {
      const view = viewRef.current
      if (!view) return
      void (async () => {
        for (const annotation of annotationsRef.current) {
          if (viewRef.current !== view) return
          try {
            await removeFoliateAnnotation(view, annotation)
            if (viewRef.current !== view) return
            await renderFoliateAnnotation(view, {
              ...annotation,
              color: resolveAnnotationColorValue(
                getAnnotationColorId(annotation.color),
                readerSurfaceRef.current,
              ),
            })
          } catch (error) {
            if (viewRef.current !== view) return
            console.warn("Failed to refresh reader annotation color", { annotation, error })
          }
        }
      })()
    }, [annotationThemeSignature])

    useEffect(() => {
      if (!persistenceTarget) return
      const state = {
        lastLocation: location.cfi,
        bookmarks,
        annotations,
      }
      saveFoliateBookPersistenceTarget(persistenceTarget, state)
    }, [annotations, bookmarks, location.cfi, persistenceTarget])

    useEffect(() => {
      callbacksRef.current.onAnnotationsChange?.(annotations)
    }, [annotations])

    useEffect(() => {
      return () => {
        const generator = searchGeneratorRef.current
        if (generator) {
          void generator.return?.(undefined)
        }
        removeCurrentChatSelection()
      }
    }, [])

    function resetTransientUi() {
      clearPositionedOverlays()
      setAnnotationDialog(null)
      setProgressDraft(null)
      setSearchOpen(false)
      setPreferencesOpen(false)
    }

    function clearPositionedOverlays() {
      removeCurrentChatSelection()
      selectionActionRef.current = null
      setSelectionToolbar(null)
      setAnnotationPopover(null)
    }

    async function resetSearch(view = viewRef.current) {
      const generator = searchGeneratorRef.current
      if (generator) {
        await generator.return?.(undefined)
      }
      searchGeneratorRef.current = null
      view?.clearSearch()
      setSearchState((current) => ({
        ...current,
        running: false,
        progress: null,
        rows: current.query.trim().length === 0 ? [] : current.rows,
      }))
    }

    async function runSearch(nextQuery?: string) {
      const view = viewRef.current
      if (!view) return

      const query = (nextQuery ?? searchState.query).trim()
      await resetSearch(view)

      if (!query) {
        setSearchState((current) => ({
          ...current,
          query,
          running: false,
          progress: null,
          rows: [],
          activeResultCfi: undefined,
        }))
        return
      }

      const runId = searchRunIdRef.current + 1
      searchRunIdRef.current = runId
      setSearchState((current) => ({
        ...current,
        query,
        running: true,
        progress: null,
        rows: [],
        activeResultCfi: undefined,
      }))

      const generator = view.search({
        query,
        matchCase: searchState.matchCase,
        matchWholeWords: searchState.matchWholeWords,
        matchDiacritics: searchState.matchDiacritics,
        index: searchState.scope === SEARCH_SCOPE_SECTION ? locationRef.current.index : null,
      })
      searchGeneratorRef.current = generator

      const rows: ReaderSearchRow[] = []
      for await (const result of generator) {
        if (runId !== searchRunIdRef.current) return
        if (result === "done") {
          setSearchState((current) => ({
            ...current,
            running: false,
            progress: null,
            rows,
            activeResultCfi: rows.find((row) => row.kind === "result")?.cfi,
          }))
          return
        }
        if ("progress" in result) {
          setSearchState((current) => ({ ...current, progress: result.progress }))
          continue
        }
        if ("subitems" in result) {
          rows.push({
            key: `${SEARCH_SECTION_KEY_PREFIX}${rows.length}`,
            kind: "section",
            label: result.label ?? "Section",
          })
          for (const item of result.subitems) {
            rows.push({
              key: `${SEARCH_RESULT_KEY_PREFIX}${item.cfi}`,
              kind: "result",
              cfi: item.cfi,
              excerpt: item.excerpt,
            })
          }
        } else {
          rows.push({
            key: `${SEARCH_RESULT_KEY_PREFIX}${result.cfi}`,
            kind: "result",
            cfi: result.cfi,
            excerpt: result.excerpt,
          })
        }
        setSearchState((current) => ({
          ...current,
          rows: [...rows],
          progress: current.running ? current.progress : null,
        }))
      }
    }

    function updateHistoryState(view: FoliateView) {
      setHistoryState({
        canGoBack: view.history.canGoBack,
        canGoForward: view.history.canGoForward,
      })
    }

    function openSelectionToolbar(action: ReaderSelectionAction) {
      if (!action.text.trim()) {
        return
      }
      removeCurrentChatSelection()
      selectionActionRef.current = action
      stagedSelectionKeyRef.current = action.selectionKey
      setAnnotationPopover(null)
      setSelectionToolbar(
        Object.assign(
          {
            text: action.text,
            cfi: action.cfi,
            x: action.x,
            y: action.y,
          },
          action.tocLabel ? { tocLabel: action.tocLabel } : undefined,
          action.pageLabel ? { pageLabel: action.pageLabel } : undefined,
          action.locationLabel ? { locationLabel: action.locationLabel } : undefined,
        ),
      )
      callbacksRef.current.onChatSelection?.(
        Object.assign(
          {
            text: action.text,
            cfi: action.cfi,
            index: action.index,
            selectionKey: action.selectionKey,
          },
          action.tocLabel ? { tocLabel: action.tocLabel } : undefined,
          action.pageLabel ? { pageLabel: action.pageLabel } : undefined,
          action.locationLabel ? { locationLabel: action.locationLabel } : undefined,
        ),
      )
    }

    function removeCurrentChatSelection() {
      const selectionKey = stagedSelectionKeyRef.current
      if (!selectionKey) return
      stagedSelectionKeyRef.current = null
      callbacksRef.current.onChatSelectionRemoved?.(selectionKey)
    }

    function openAnnotationSurface(value: string, range: Range) {
      const annotation = getAnnotationAtValue(annotationsRef.current, value)
      if (annotation?.note?.trim()) {
        openAnnotationDialog(annotation)
        return
      }
      openAnnotationPopover(value, range)
    }

    function openAnnotationPopover(value: string, range: Range) {
      const container = readerSurfaceRef.current
      if (!container) return
      const position = getOverlayPosition(range, container)
      removeCurrentChatSelection()
      selectionActionRef.current = null
      setSelectionToolbar(null)
      setAnnotationPopover({
        value,
        x: position.x,
        y: position.y,
      })
    }

    function openAnnotationDialog(annotation?: ReaderAnnotation) {
      if (annotation) {
        setAnnotationDialog(toAnnotationDialogState(annotation))
      } else {
        const selectionAction = selectionActionRef.current
        setAnnotationDialog({
          mode: "create",
          value: selectionAction?.cfi ?? "",
          text: selectionAction?.text ?? "",
          note: "",
          style: ANNOTATION_STYLE_HIGHLIGHT,
          color: DEFAULT_ANNOTATION_COLOR_ID,
        })
      }
      setSelectionToolbar(null)
      setAnnotationPopover(null)
    }

    function dismissSelectionToolbar(clearSelection: boolean) {
      removeCurrentChatSelection()
      if (clearSelection) {
        selectionActionRef.current = null
        viewRef.current?.deselect()
      }
      setSelectionToolbar(null)
    }

    async function handleCopySelection(text: string) {
      removeCurrentChatSelection()
      const copied = await copyText(text)
      dismissSelectionToolbar(copied)
      if (copied) {
        toast.success("Copied to clipboard")
      } else {
        toast.error("Unable to copy to clipboard")
      }
    }

    async function showAnnotation(annotation: ReaderAnnotation) {
      const view = viewRef.current
      if (!view) return
      const range = await revealFoliateAnnotation(view, annotation)
      if (annotation.note?.trim()) {
        openAnnotationDialog(annotation)
      } else if (range) {
        openAnnotationSurface(annotation.value, range)
      }
    }

    async function createOrUpdateAnnotation(nextDialog: ReaderAnnotationDialogState) {
      const view = viewRef.current
      if (!view) return

      if (nextDialog.mode === "create") {
        const selectionAction = selectionActionRef.current
        if (!selectionAction) return
        const now = new Date().toISOString()
        const annotation: ReaderAnnotation = {
          value: selectionAction.cfi,
          text: selectionAction.text,
          note: nextDialog.note.trim(),
          style: nextDialog.style,
          color: getAnnotationColorValue(nextDialog.color),
          created: now,
          modified: now,
        }
        // Clear the native selection before Foliate paints the committed mark. If
        // deselection happens after addAnnotation(), WebKit can leave the new SVG
        // overlayer stale until the reader is resized or remounted.
        dismissSelectionToolbar(true)
        const info = await renderFoliateAnnotation(view, {
          ...annotation,
          color: resolveAnnotationColorValue(nextDialog.color, readerSurfaceRef.current),
        })
        if (info) {
          annotation.index = info.index
          annotation.label = info.label
        }
        setAnnotations((current) =>
          [...current, annotation].toSorted((a, b) => a.value.localeCompare(b.value)),
        )
        scheduleAnnotationRefresh(view, [annotation], annotation.index)
        setAnnotationDialog(null)
        return
      }

      const existing = getAnnotationAtValue(annotations, nextDialog.value)
      if (!existing) return
      const updated: ReaderAnnotation = {
        ...existing,
        note: nextDialog.note.trim(),
        style: nextDialog.style,
        color: getAnnotationColorValue(nextDialog.color),
        modified: new Date().toISOString(),
      }
      await removeFoliateAnnotation(view, existing)
      const info = await renderFoliateAnnotation(view, {
        ...updated,
        color: resolveAnnotationColorValue(nextDialog.color, readerSurfaceRef.current),
      })
      if (info) {
        updated.index = info.index
        updated.label = info.label
      }
      setAnnotations((current) =>
        current.map((annotation) => (annotation.value === updated.value ? updated : annotation)),
      )
      setAnnotationDialog(null)
      setAnnotationPopover(null)
    }

    async function deleteAnnotationValue(value: string) {
      const view = viewRef.current
      const annotation = getAnnotationAtValue(annotations, value)
      if (!view || !annotation) return
      await removeFoliateAnnotation(view, annotation)
      setAnnotations((current) => current.filter((entry) => entry.value !== value))
      setAnnotationDialog(null)
      setAnnotationPopover(null)
    }

    async function toggleBookmark() {
      const cfi = locationRef.current.cfi
      if (!cfi) return
      const existing = getBookmarkAtLocation(bookmarksRef.current, cfi)
      if (existing) {
        setBookmarks((current) => current.filter((bookmark) => bookmark.value !== cfi))
        return
      }
      const bookmark: ReaderBookmark = {
        value: cfi,
        label: locationRef.current.tocLabel ?? locationRef.current.pageLabel ?? cfi,
        created: new Date().toISOString(),
      }
      setBookmarks((current) =>
        [...current, bookmark].toSorted((a, b) => a.value.localeCompare(b.value)),
      )
    }

    async function showSearchResult(cfi: string) {
      const view = viewRef.current
      if (!view) return
      setSearchState((current) => ({ ...current, activeResultCfi: cfi }))
      await view.goTo(cfi)
    }

    async function cycleSearchResults(direction: 1 | -1) {
      const results = getSearchResultRows(searchState)
      if (results.length === 0) return
      const currentIndex = results.findIndex((row) => row.cfi === searchState.activeResultCfi)
      const baseIndex = currentIndex < 0 ? 0 : currentIndex
      const nextIndex = (baseIndex + direction + results.length) % results.length
      await showSearchResult(results[nextIndex].cfi)
    }

    function revealSearchPanel(query: string) {
      setSearchState((current) => ({ ...current, query }))
      setSearchOpen(true)
    }

    function openSearchWithQuery(query: string) {
      revealSearchPanel(query)
      void runSearch(query)
    }

    function openLocationDialog() {
      setLocationDraft(locationRef.current.cfi ?? "")
      setLocationDialogOpen(true)
    }

    async function goToLocationTarget(target: string) {
      const value = target.trim()
      if (!value) return
      const percent = Number(value.replace(/%$/, ""))
      if (Number.isFinite(percent) && percent >= 0 && percent <= READER_PERCENT_MAX) {
        await viewRef.current?.goToFraction(percent / READER_PERCENT_MAX)
        setLocationDialogOpen(false)
        setGoToOpen(false)
        return
      }
      await viewRef.current?.goTo(value)
      setLocationDialogOpen(false)
      setGoToOpen(false)
    }

    function runNavigationCommand(command: ReturnType<typeof resolveReaderArrowNavigation>) {
      const view = viewRef.current
      if (!view || !command) return
      if (command === READER_NAVIGATION_GO_LEFT) {
        void view.goLeft()
        return
      }
      if (command === READER_NAVIGATION_GO_RIGHT) {
        void view.goRight()
        return
      }
      if (command === READER_NAVIGATION_NEXT) {
        void view.next()
        return
      }
      void view.prev()
    }

    function handleShortcut(event: KeyboardEvent | ReactKeyboardEvent<HTMLElement>) {
      if (isEditingTarget(event.target)) return
      const key = event.key
      const command = event.metaKey || event.ctrlKey
      if (command && key === ".") {
        event.preventDefault()
        setFocus((current) => !current)
        return
      }
      if (command && key.toLowerCase() === "f") {
        event.preventDefault()
        revealSearchPanel(searchStateRef.current.query)
        return
      }
      if (command && key.toLowerCase() === "d") {
        event.preventDefault()
        void toggleBookmark()
        return
      }
      if (command && key.toLowerCase() === "l") {
        event.preventDefault()
        openLocationDialog()
        return
      }
      if (command && key === ",") {
        event.preventDefault()
        setPreferencesOpen(true)
        return
      }
      if (event.altKey && key === "ArrowLeft") {
        event.preventDefault()
        viewRef.current?.history.back()
        return
      }
      if (event.altKey && key === "ArrowRight") {
        event.preventDefault()
        viewRef.current?.history.forward()
        return
      }
      const navigationCommand = resolveReaderArrowNavigation({
        flow: preferencesRef.current.flow,
        isFixedLayout: snapshotRef.current?.isFixedLayout ?? false,
        key,
      })
      if (navigationCommand) {
        event.preventDefault()
        runNavigationCommand(navigationCommand)
        return
      }
      if (key === "?" || (event.shiftKey && key === "/")) {
        event.preventDefault()
        setHelpOpen(true)
        return
      }
      if (key === "Escape") {
        setFocus(false)
        clearPositionedOverlays()
        setTocOpen(false)
        setMarksOpen(false)
        setSearchOpen(false)
        setPreferencesOpen(false)
        setGoToOpen(false)
        setLocationDialogOpen(false)
        if (annotationDialogRef.current) setAnnotationDialog(null)
      }
    }

    useEffect(() => {
      const host = viewportRef.current
      if (!host) return

      cleanupView(viewRef.current, coverUrlRef.current)
      viewRef.current = null
      coverUrlRef.current = undefined
      host.replaceChildren()

      void resetSearch(null)
      resetTransientUi()
      setPersistenceTarget(null)

      if (!stableSource) {
        snapshotRef.current = null
        locationRef.current = {}
        setStatus("idle")
        setSnapshot(null)
        setLocation({})
        setBookmarks([])
        setAnnotations([])
        setHistoryState({ canGoBack: false, canGoForward: false })
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
      setBookmarks([])
      setAnnotations([])
      setHistoryState({ canGoBack: false, canGoForward: false })
      void (async () => {
        try {
          const module = await import("foliate-js/view.js")
          if (cancelled) return

          const view = new module.View()
          viewRef.current = view
          host.append(view)

          const relocateListener = (event: CustomEvent<FoliateRelocationDetail>) => {
            clearPositionedOverlays()
            const nextLocation = buildLocationState(event.detail, view.book)
            locationRef.current = nextLocation
            startTransition(() => setLocation(nextLocation))
            syncMarginals(view, snapshotRef.current, nextLocation)
            callbacksRef.current.onLocationChange?.(nextLocation)
          }

          const externalLinkListener = (event: CustomEvent<{ href: string }>) => {
            if (!callbacksRef.current.onOpenExternalLink) return
            event.preventDefault()
            callbacksRef.current.onOpenExternalLink(event.detail.href)
          }

          const overlayListener = (event: CustomEvent<{ index: number }>) => {
            void hydrateAnnotations(view, annotationsRef.current, event.detail.index)
          }

          const showAnnotationListener = (
            event: CustomEvent<{ value: string; index: number; range: Range }>,
          ) => {
            openAnnotationSurface(event.detail.value, event.detail.range)
          }

          const historyListener = () => updateHistoryState(view)

          const loadListener = (event: CustomEvent<{ doc: Document; index: number }>) => {
            event.detail.doc.addEventListener(
              "wheel",
              (wheelEvent) => {
                if (wheelEvent.ctrlKey) return

                const renderer = view.renderer
                const navigationCommand = resolveReaderWheelNavigation({
                  flow: preferencesRef.current.flow,
                  isFixedLayout: snapshotRef.current?.isFixedLayout ?? false,
                  deltaY: wheelEvent.deltaY,
                  sectionStart: renderer.start,
                  sectionEnd: renderer.end,
                  sectionSize: renderer.viewSize,
                })

                if (!navigationCommand) {
                  wheelNavigationGestureRef.current = {
                    command: undefined,
                    lastEventAt: undefined,
                  }
                  return
                }

                wheelEvent.preventDefault()
                const previousGesture = wheelNavigationGestureRef.current
                const isMomentumContinuation =
                  previousGesture.command === navigationCommand &&
                  previousGesture.lastEventAt !== undefined &&
                  wheelEvent.timeStamp - previousGesture.lastEventAt <=
                    WHEEL_GESTURE_IDLE_THRESHOLD_MS

                wheelNavigationGestureRef.current = {
                  command: navigationCommand,
                  lastEventAt: wheelEvent.timeStamp,
                }
                if (!isMomentumContinuation) runNavigationCommand(navigationCommand)
              },
              { capture: true, passive: false },
            )
            event.detail.doc.addEventListener("pointerdown", () => {
              clearPositionedOverlays()
              // Dispatch a pointerdown event on the main document to trigger dismissal
              // of popovers and other floating UI that listen for outside interactions.
              document.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
            })
            event.detail.doc.addEventListener("pointerup", () => {
              const readSelection = () => {
                const selection = event.detail.doc.getSelection()
                const range = readSelectedRange(selection)
                const container = readerSurfaceRef.current
                if (!range || !container) {
                  resetTransientUi()
                  return
                }
                event.detail.doc.addEventListener(
                  "click",
                  (clickEvent) => clickEvent.stopPropagation(),
                  {
                    capture: true,
                    once: true,
                  },
                )
                const position = getOverlayPosition(range, container)
                openSelectionToolbar({
                  selectionKey: createSelectionKey(),
                  index: event.detail.index,
                  range,
                  cfi: view.getCFI(event.detail.index, range),
                  text: selection?.toString().trim() ?? "",
                  tocLabel: locationRef.current.tocLabel,
                  pageLabel: locationRef.current.pageLabel,
                  locationLabel: locationRef.current.locationLabel,
                  x: position.x,
                  y: position.y,
                })
              }

              if ("requestAnimationFrame" in globalThis) {
                requestAnimationFrame(readSelection)
              } else {
                readSelection()
              }
            })
            event.detail.doc.addEventListener("keydown", (keyEvent) => handleShortcut(keyEvent))
          }

          view.addEventListener("relocate", relocateListener)
          view.addEventListener("external-link", externalLinkListener)
          view.addEventListener("draw-annotation", drawAnnotationListener)
          view.addEventListener("create-overlay", overlayListener)
          view.addEventListener("show-annotation", showAnnotationListener)
          view.addEventListener("load", loadListener)
          view.history.addEventListener("index-change", historyListener)

          await view.open(toFoliateInput(stableSource))
          if (cancelled) return

          const currentReaderSource = readerSourceRef.current
          const persistenceReaderSource = currentReaderSource
            ? await withReaderSourceContentFingerprint(currentReaderSource)
            : undefined
          if (cancelled) return
          const nextBookKey = buildBookPersistenceKey(
            stableSource,
            view.book,
            persistenceSuffixRef.current,
          )
          const persisted = persistenceReaderSource
            ? loadMirroredEpubBookState(nextBookKey, persistenceReaderSource)
            : loadBookState(nextBookKey)

          const themeDefinition = getThemeDefinition(preferencesRef.current.themeId)
          applyReaderPreferences(view, themeDefinition, preferencesRef.current)
          const coverUrlPromise = resolveCoverUrl(view.book)

          const requestedLastLocation = stableInitialLocation ?? persisted.lastLocation
          const restorableLastLocation = await resolveRestorableNavigationTarget(
            view,
            requestedLastLocation,
          )
          const shouldShowTextStart =
            restorableLastLocation === undefined &&
            stableInitialLocation === undefined &&
            persisted.lastLocation === undefined

          try {
            await view.init({
              lastLocation: restorableLastLocation,
              showTextStart: shouldShowTextStart,
            })
          } catch (error) {
            if (
              requestedLastLocation !== undefined &&
              stableInitialLocation === undefined &&
              persisted.lastLocation !== undefined
            ) {
              console.warn("Failed to restore persisted reader location; reopening without it", {
                error,
                lastLocation: persisted.lastLocation,
              })
              const fallbackLocation = await resolveRestorableNavigationTarget(view, undefined)
              await view.init({
                lastLocation: fallbackLocation,
                showTextStart: fallbackLocation === undefined,
              })
            } else {
              throw error
            }
          }

          const coverUrl = await coverUrlPromise
          if (cancelled) {
            releaseObjectUrl(coverUrl)
            return
          }

          const titleParsed = FoliateMetadataValueSchema.safeParse(view.book.metadata?.title)
          const authorParsed = FoliateMetadataValueSchema.safeParse(view.book.metadata?.author)
          const contributorParsed = FoliateMetadataValueSchema.safeParse(
            view.book.metadata?.contributor,
          )
          const nextSnapshot: FoliateReaderSnapshot = {
            title:
              (titleParsed.success ? formatMetadataValue(titleParsed.data) : undefined) ??
              getSourceName(stableSource) ??
              DEFAULT_TITLE,
            author:
              (authorParsed.success ? formatContributor(authorParsed.data) : undefined) ??
              (contributorParsed.success ? formatContributor(contributorParsed.data) : undefined) ??
              DEFAULT_AUTHOR,
            formatLabel: getSourceFormatLabel(stableSource),
            isFixedLayout: view.isFixedLayout,
            toc: view.book.toc ?? [],
            pageList: view.book.pageList ?? [],
            landmarks: buildLandmarks(view.book),
            metadata: view.book.metadata,
            coverUrl,
            fileName: getSourceName(stableSource),
          }

          coverUrlRef.current = coverUrl
          const nextLocation = buildLocationState(view.lastLocation, view.book)
          snapshotRef.current = nextSnapshot
          locationRef.current = nextLocation
          const nextPersistenceTarget: FoliateBookPersistenceTarget = Object.assign(
            { bookKey: nextBookKey },
            persistenceReaderSource ? { readerSource: persistenceReaderSource } : undefined,
          )

          startTransition(() => {
            setPersistenceTarget(nextPersistenceTarget)
            setBookmarks(persisted.bookmarks)
            setAnnotations(persisted.annotations)
            setSnapshot(nextSnapshot)
            setLocation(nextLocation)
            setStatus("ready")
          })

          updateHistoryState(view)
          syncMarginals(view, nextSnapshot, nextLocation)
          await hydrateAnnotations(view, persisted.annotations)
          if (cancelled || viewRef.current !== view) return
          callbacksRef.current.onReady?.(nextSnapshot)
          callbacksRef.current.onLocationChange?.(nextLocation)
        } catch (caughtError) {
          if (cancelled) return
          cleanupView(viewRef.current, coverUrlRef.current)
          viewRef.current = null
          coverUrlRef.current = undefined
          host.replaceChildren()
          const nextError =
            caughtError instanceof Error
              ? caughtError
              : new Error("Buddy could not initialize the foliate renderer for this source.")
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
    }, [hydrateAnnotations, stableInitialLocation, stableSource])

    const persistenceBookKey = persistenceTarget?.bookKey
    useEffect(() => {
      const view = viewRef.current
      if (!stableSource || !view || !persistenceBookKey) return
      const nextBookKey = buildBookPersistenceKey(stableSource, view.book, persistenceSuffix)
      setPersistenceTarget((current) =>
        current && current.bookKey !== nextBookKey ? { ...current, bookKey: nextBookKey } : current,
      )
    }, [persistenceBookKey, persistenceSuffix, stableSource])

    useEffect(() => {
      if (!readerSource || !persistenceBookKey) return
      let cancelled = false

      void withReaderSourceContentFingerprint(readerSource).then((fingerprintedSource) => {
        if (cancelled || !fingerprintedSource) return
        setPersistenceTarget((current) =>
          current?.bookKey === persistenceBookKey
            ? {
                ...current,
                readerSource: fingerprintedSource,
              }
            : current,
        )
      })

      return () => {
        cancelled = true
      }
    }, [persistenceBookKey, readerSource])

    const progressValue =
      progressDraft ?? Math.round((location.fraction ?? 0) * DEFAULT_PROGRESS_STEPS)
    const readerContentFilter = resolveReaderContentFilter({
      isFixedLayout: snapshot?.isFixedLayout ?? false,
      filter: theme.pdfFilter,
    })
    const surfaceScrolls = canChangeFlow && preferences.flow === FLOW_SCROLLED
    const locationSection = location.tocLabel ?? snapshot?.title ?? DEFAULT_TITLE
    const locationPosition =
      location.pageLabel ??
      location.locationLabel ??
      (location.fraction !== undefined
        ? `${Math.round(location.fraction * READER_PERCENT_MAX)}%`
        : "—")

    const readerPane = (
      <div className="relative flex h-full min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden">
        {showToolbar && !focus ? (
          <ReaderToolbar
            contents={
              <ReaderTocPopover
                items={readerSnapshot?.toc ?? []}
                activeLabel={location.tocLabel}
                open={tocOpen}
                onOpenChange={setTocOpen}
                onSelect={(navigationId) => {
                  void viewRef.current?.goTo(navigationId)
                  setTocOpen(false)
                }}
              />
            }
            marks={
              <ReaderMarksPopover
                bookmarks={readerBookmarks}
                annotations={readerAnnotations}
                bookmarkOrder={foliateBookmarkOrder}
                annotationOrder={foliateAnnotationOrder}
                open={marksOpen}
                onOpenChange={setMarksOpen}
                onGoToBookmark={(target) => {
                  void viewRef.current?.goTo(readerPositionAnchorToFoliateTarget(target))
                  setMarksOpen(false)
                }}
                onShowAnnotation={(annotation) => {
                  const foliateAnnotation = getAnnotationAtValue(annotations, annotation.id)
                  if (foliateAnnotation) void showAnnotation(foliateAnnotation)
                  setMarksOpen(false)
                }}
                onEditAnnotation={(annotation) => {
                  const foliateAnnotation = getAnnotationAtValue(annotations, annotation.id)
                  if (foliateAnnotation) openAnnotationDialog(foliateAnnotation)
                  setMarksOpen(false)
                }}
                onDeleteBookmark={(bookmarkId) =>
                  setBookmarks((current) =>
                    current.filter((bookmark) => bookmark.value !== bookmarkId),
                  )
                }
                onDeleteAnnotation={(annotationId) => void deleteAnnotationValue(annotationId)}
              />
            }
            search={
              <ReaderSearchPopover
                search={readerSearch}
                onQueryChange={(query) => setSearchState((current) => ({ ...current, query }))}
                onRunSearch={() => void runSearch()}
                onCycleResults={(direction) => void cycleSearchResults(direction)}
                onScopeChange={(scope) => {
                  setSearchState((current) => ({
                    ...current,
                    scope: readerSearchScopeToFoliateScope(scope),
                  }))
                }}
                onMatchCaseChange={(matchCase) =>
                  setSearchState((current) => ({ ...current, matchCase }))
                }
                onMatchWholeWordsChange={(matchWholeWords) =>
                  setSearchState((current) => ({ ...current, matchWholeWords }))
                }
                onMatchDiacriticsChange={(matchDiacritics) =>
                  setSearchState((current) => ({ ...current, matchDiacritics }))
                }
                onShowResult={(target) => {
                  const cfi = readerTextAnchorToFoliateCfi(target)
                  if (cfi) void showSearchResult(cfi)
                }}
                canSearchSection={Boolean(readerSnapshot?.toc.length)}
                ready={status === "ready"}
                open={searchOpen}
                onOpenChange={setSearchOpen}
              />
            }
            title={
              <ReaderMetadataHoverCard snapshot={readerSnapshot}>
                <button
                  type="button"
                  className="max-w-full truncate text-xs font-medium text-text-base"
                >
                  {snapshot?.title ?? (source ? getSourceName(source) : undefined) ?? DEFAULT_TITLE}
                </button>
              </ReaderMetadataHoverCard>
            }
            view={
              <ReaderPreferencesPopover open={preferencesOpen} onOpenChange={setPreferencesOpen}>
                <FoliatePreferencesPanel
                  preferences={preferences}
                  setPreferences={setPreferences}
                  canChangeFlow={canChangeFlow}
                  onOpenHelp={() => {
                    setPreferencesOpen(false)
                    setHelpOpen(true)
                  }}
                  onOpenLocationNavigation={() => {
                    setPreferencesOpen(false)
                    openLocationDialog()
                  }}
                />
              </ReaderPreferencesPopover>
            }
            bookmarked={Boolean(currentBookmark)}
            onToggleBookmark={() => void toggleBookmark()}
            onEnterFocus={() => setFocus(true)}
          />
        ) : null}

        <div
          ref={readerSurfaceRef}
          className={cn("relative min-h-0 min-w-0 w-full flex-1", theme.viewportClassName)}
        >
          {status === "loading" ? (
            <div className="pointer-events-none absolute inset-x-3 top-3 z-30">
              <ReaderStatusPill>
                <Loader2Icon className="size-3 animate-spin motion-reduce:animate-none" />
                Opening…
              </ReaderStatusPill>
            </div>
          ) : null}

          {status === "idle" ? (
            <ReaderEmptyState>{emptyState}</ReaderEmptyState>
          ) : status === "error" && error ? (
            <ReaderErrorState error={error} />
          ) : null}

          <div
            ref={viewportRef}
            className={cn(
              VIEWPORT_CLASS_NAME,
              "h-full min-h-[18rem] overflow-hidden sm:min-h-[24rem]",
              status === "idle" || status === "error" ? "hidden" : "block",
            )}
          />

          {showPageTurnControls ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Previous page"
                onClick={() => {
                  void viewRef.current?.goLeft()
                }}
                className="absolute left-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-surface-raised-base/80 text-text-weak opacity-70 shadow-sm backdrop-blur-sm transition-[opacity,transform] duration-150 hover:opacity-100 active:scale-95 motion-reduce:transition-none"
              >
                <ChevronLeftIcon />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Next page"
                onClick={() => {
                  void viewRef.current?.goRight()
                }}
                className="absolute right-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-surface-raised-base/80 text-text-weak opacity-70 shadow-sm backdrop-blur-sm transition-[opacity,transform] duration-150 hover:opacity-100 active:scale-95 motion-reduce:transition-none"
              >
                <ChevronRightIcon />
              </Button>
            </>
          ) : null}

          <ReaderSelectionToolbar
            selectionAction={selectionToolbar}
            anchorRoot={readerSurfaceRef.current}
            onCopyText={(text: string) => void handleCopySelection(text)}
            onHighlight={(color) => {
              const action = selectionActionRef.current
              const view = viewRef.current
              if (!action || !view) return
              const now = new Date().toISOString()
              const annotation: ReaderAnnotation = {
                value: action.cfi,
                text: action.text,
                note: "",
                style: ANNOTATION_STYLE_HIGHLIGHT,
                color: getAnnotationColorValue(color),
                created: now,
                modified: now,
              }
              // Foliate's annotation overlayer must be painted after the native
              // selection is cleared or WebKit may not display it until a later
              // layout refresh.
              dismissSelectionToolbar(true)
              void (async () => {
                const info = await renderFoliateAnnotation(view, {
                  ...annotation,
                  color: resolveAnnotationColorValue(color, readerSurfaceRef.current),
                })
                if (info) {
                  annotation.index = info.index
                  annotation.label = info.label
                }
                setAnnotations((current) =>
                  [...current, annotation].toSorted((a, b) => a.value.localeCompare(b.value)),
                )
                scheduleAnnotationRefresh(view, [annotation], annotation.index)
              })()
            }}
            onOpenAnnotationDialog={() => {
              removeCurrentChatSelection()
              openAnnotationDialog()
            }}
            onSearch={(query: string) => {
              removeCurrentChatSelection()
              openSearchWithQuery(query)
            }}
          />

          <ReaderAnnotationPopover
            popover={readerAnnotationPopover}
            anchorRoot={readerSurfaceRef.current}
            annotations={readerAnnotations}
            onChangeColor={(annotation, color) => {
              const existing = getAnnotationAtValue(annotations, annotation.id)
              if (!existing) return
              void createOrUpdateAnnotation({
                mode: "edit",
                value: existing.value,
                text: existing.text ?? "",
                note: existing.note ?? "",
                style: getAnnotationStyle(existing),
                color,
              })
            }}
            onEditAnnotation={(annotation) => {
              const foliateAnnotation = getAnnotationAtValue(annotations, annotation.id)
              if (foliateAnnotation) openAnnotationDialog(foliateAnnotation)
            }}
            onDeleteAnnotation={(annotationId) => void deleteAnnotationValue(annotationId)}
          />

          {focus ? <ReaderFocusExit onExit={() => setFocus(false)} /> : null}

          {focus && !surfaceScrolls && snapshot && status === "ready" ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center">
              <div className="max-w-[min(70vw,30rem)] truncate rounded-full border border-border-weak-base bg-surface-raised-stronger-non-alpha/90 px-2.5 py-1 font-mono text-[10px] text-text-weaker shadow-sm backdrop-blur">
                {locationPosition}
              </div>
            </div>
          ) : null}
        </div>

        {snapshot && status === "ready" && showToolbar && !focus ? (
          <footer
            className={cn(
              "relative z-20 shrink-0",
              surfaceScrolls && "border-t border-border-weak-base",
            )}
          >
            {!surfaceScrolls ? (
              <ReaderProgressRail
                value={progressDraft ?? progressValue}
                max={DEFAULT_PROGRESS_STEPS}
                paper={theme.contentBackground}
                ink={theme.contentForeground}
                onPreview={setProgressDraft}
                onCommit={(progress) => {
                  void viewRef.current?.goToFraction(progress / DEFAULT_PROGRESS_STEPS)
                  setProgressDraft(null)
                }}
                onCancel={() => setProgressDraft(null)}
              />
            ) : null}
            <ReaderLocationPopover
              section={locationSection}
              position={locationPosition}
              targetLabel="CFI or percentage"
              target={goToDraft}
              onTargetChange={setGoToDraft}
              onSubmitTarget={() => void goToLocationTarget(goToDraft)}
              canGoBack={historyState.canGoBack}
              canGoForward={historyState.canGoForward}
              onGoBack={() => viewRef.current?.history.back()}
              onGoForward={() => viewRef.current?.history.forward()}
              recent={recentLocations}
              onSelectRecent={(anchor) => {
                void viewRef.current?.goTo(readerPositionAnchorToFoliateTarget(anchor))
                setGoToOpen(false)
              }}
              open={goToOpen}
              onOpenChange={(open) => {
                if (open) setGoToDraft(location.cfi ?? locationPosition)
                setGoToOpen(open)
              }}
            />
          </footer>
        ) : null}
      </div>
    )

    return (
      <section
        ref={rootRef}
        tabIndex={0}
        data-component="foliate-reader"
        data-reader-theme={theme.id}
        data-appearance={theme.appearance}
        onKeyDown={handleShortcut}
        className={cn(
          "h-full w-full min-h-0 overflow-hidden bg-surface-base text-text-base shadow-[0_8px_32px_color-mix(in_oklab,var(--surface-strong)_12%,transparent)]",
          preferences.reduceMotion && "[&_*]:!animate-none [&_*]:!transition-none",
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
            display: none;
          }

          .${VIEWPORT_CLASS_NAME} > .${VIEW_ELEMENT_CLASS_NAME}::part(filter) {
            filter: ${readerContentFilter};
          }

          /* Custom scrollbar to match theme */
          [data-component="foliate-reader"] * {
            scrollbar-width: thin;
            scrollbar-color: color-mix(in oklab, ${theme.contentForeground} 15%, transparent) transparent;
          }

          [data-component="foliate-reader"] ::-webkit-scrollbar {
            width: 8px;
            height: 8px;
          }

          [data-component="foliate-reader"] ::-webkit-scrollbar-track {
            background: transparent;
          }

          [data-component="foliate-reader"] ::-webkit-scrollbar-thumb {
            background: color-mix(in oklab, ${theme.contentForeground} 15%, transparent);
            border-radius: 10px;
          }

          [data-component="foliate-reader"] ::-webkit-scrollbar-thumb:hover {
            background: color-mix(in oklab, ${theme.contentForeground} 25%, transparent);
          }
        `}</style>

        {readerPane}

        <ReaderAnnotationDialog
          dialog={readerAnnotationEditor}
          onChangeNote={(note) =>
            setAnnotationDialog((current) => (current ? { ...current, note } : null))
          }
          onChangeStyle={(style) =>
            setAnnotationDialog((current) => (current ? { ...current, style } : null))
          }
          onChangeColor={(color) =>
            setAnnotationDialog((current) => (current ? { ...current, color } : null))
          }
          onSave={() => {
            if (annotationDialog) {
              void createOrUpdateAnnotation(annotationDialog)
            }
          }}
          onCancel={() => setAnnotationDialog(null)}
          onDelete={() => {
            if (annotationDialog) {
              void deleteAnnotationValue(annotationDialog.value)
            }
          }}
        />

        <FoliateLocationDialog
          open={locationDialogOpen}
          onOpenChange={setLocationDialogOpen}
          location={location}
          locationDraft={locationDraft}
          setLocationDraft={setLocationDraft}
          onGoToLocation={(href: string) => void goToLocationTarget(href)}
          flattenedToc={flattenedToc}
          snapshot={snapshot}
          readerLandmarks={readerLandmarks}
        />

        <ReaderHelpDialog open={helpOpen} onOpenChange={setHelpOpen} shortcuts={SHORTCUTS} />
      </section>
    )
  },
)

FoliateReader.displayName = "FoliateReader"
