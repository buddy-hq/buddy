import {
  forwardRef,
  startTransition,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react"
import { useHotkey } from "@tanstack/react-hotkeys"
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Separator,
  cn,
  toast,
  // Icons from @buddy/ui
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleQuestionMarkIcon,
  EllipsisIcon,
} from "@buddy/ui"
import {
  BookOpenIcon,
  CheckIcon,
  BookmarkIcon,
  LayoutPanelLeftIcon,
  Loader2Icon,
  MapIcon,
  Redo2Icon,
  ScrollTextIcon,
  Undo2Icon,
} from "lucide-react"
import { FoliateAnnotationsPopover } from "./ui/foliate-annotations-popover"
import { FoliateBookmarksPopover } from "./ui/foliate-bookmarks-popover"
import { FoliateEmptyState } from "./ui/foliate-empty-state"
import { FoliateErrorState } from "./ui/foliate-error-state"
import { FoliateMetadataHoverCard } from "./ui/foliate-metadata-hover-card"
import { FoliatePreferencesPopover } from "./ui/foliate-preferences-popover"
import { FoliateSearchPopover } from "./ui/foliate-search-popover"
import { FoliateTocPopover } from "./ui/foliate-toc-popover"
import { FoliateHelpDialog } from "./ui/foliate-help-dialog"
import { FoliateLocationDialog } from "./ui/foliate-location-dialog"
import { FoliateAnnotationDialog } from "./ui/foliate-annotation-dialog"
import { FoliateAnnotationPopover } from "./ui/foliate-annotation-popover"
import { FoliateSelectionToolbar } from "./ui/foliate-selection-toolbar"
import { ensureFoliateRuntimeCompat } from "@/lib/foliate/ensure-foliate-runtime-compat"
import type {
  FoliateDrawAnnotationEventDetail,
  FoliateNavigationTarget,
  FoliateRelocationDetail,
  FoliateSearchResult,
  View as FoliateView,
} from "foliate-js/view.js"
import type {
  FoliateReaderAppearanceMode,
  FoliateReaderAnnotationStyle,
  FoliateReaderFlow,
  FoliateReaderFontPreset,
  FoliateReaderHandle,
  FoliateReaderLandmark,
  FoliateReaderLocation,
  FoliateReaderProps,
  FoliateReaderSearchScope,
  FoliateReaderSnapshot,
  FoliateReaderSource,
  FoliateReaderThemeId,
  ReaderAnnotation,
  ReaderAnnotationDialogState,
  ReaderAnnotationPopoverState,
  ReaderBookmark,
  ReaderSearchRow,
  ReaderSearchState,
  ReaderSelectionAction,
  ReaderSelectionToolbarState,
  ReaderShortcut,
} from "./foliate-reader-types"
import {
  ANNOTATION_STYLE_HIGHLIGHT,
  APPEARANCE_DARK,
  APPEARANCE_LIGHT,
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
  VIEWPORT_CLASS_NAME,
  VIEW_ELEMENT_CLASS_NAME,
} from "./foliate-reader-constants"
import {
  buildLandmarks,
  buildLocationState,
  buildNavigationTargetDependencyKey,
  buildSourceDependencyKey,
  cleanupView,
  copyText,
  createError,
  flattenTocItems,
  getAnnotationAtValue,
  getAnnotationColorValue,
  getBookmarkAtLocation,
  getOverlayPosition,
  getSearchResultRows,
  getSourceFormatLabel,
  getSourceName,
  isPdfSource,
  isEditingTarget,
  isReaderAnnotationColorId,
  readSelectedRange,
  releaseObjectUrl,
  resolveCoverUrl,
  syncMarginals,
  toFoliateInput,
} from "./utils/foliate-helpers"
import {
  addPdfAnnotation,
  addPdfAnnotationFromSelection,
  clearPdfPageOverlays,
  configurePdfFixedLayoutView,
  deletePdfAnnotation,
  PDF_VIEW_MODE_FIT,
  PDF_VIEW_MODE_SCROLL,
  PDF_VIEW_MODE_SPREAD,
  preparePdfDocument,
  registerPdfPageOverlay,
  showPdfAnnotation,
  syncPdfFixedLayoutView,
  type FoliatePdfViewMode,
  updatePdfFixedLayoutViewMode,
} from "./utils/foliate-pdf-compat"
import {
  buildBookPersistenceKey,
  loadBookState,
  loadGlobalPreferences,
  saveBookState,
  saveGlobalPreferences,
} from "./utils/foliate-storage"
import { applyReaderPreferences, getThemeDefinition } from "./utils/foliate-themes"
import { drawAnnotation, toAnnotationDialogState } from "./utils/foliate-drawing"
import { formatContributor, formatMetadataValue } from "./utils/foliate-formatters"
// Components already imported above

ensureFoliateRuntimeCompat()

function createSelectionKey() {
  const random = Math.random().toString(36).slice(2, 10)
  return `sel_${Date.now().toString(36)}_${random}`
}

export type {
  FoliateReaderAppearanceMode,
  FoliateReaderAnnotationStyle,
  FoliateReaderFlow,
  FoliateReaderFontPreset,
  FoliateReaderLandmark,
  FoliateReaderLocation,
  FoliateReaderSelection,
  FoliateReaderSearchScope,
  FoliateReaderSidebarTab,
  FoliateReaderSnapshot,
  FoliateReaderSource,
  FoliateReaderThemeId,
  ReaderAnnotationColorId,
  ReaderShortcut,
} from "./foliate-reader-types"

export { FoliateEmptyState } from "./ui/foliate-empty-state"
export { FoliateErrorState } from "./ui/foliate-error-state"
export { FoliateMetadataPanel } from "./ui/foliate-metadata-panel"
export { FoliateTocTree } from "./ui/foliate-toc-tree"

export const FoliateReader = forwardRef<FoliateReaderHandle, FoliateReaderProps>(
  function FoliateReader(
    {
      source,
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
    const viewportRef = useRef<HTMLDivElement | null>(null)
    const viewRef = useRef<FoliateView | null>(null)
    const coverUrlRef = useRef<string | undefined>(undefined)
    const snapshotRef = useRef<FoliateReaderSnapshot | null>(null)
    const locationRef = useRef<FoliateReaderLocation>({})
    const searchGeneratorRef = useRef<AsyncGenerator<FoliateSearchResult> | null>(null)
    const searchRunIdRef = useRef(0)
    const selectionActionRef = useRef<ReaderSelectionAction | null>(null)
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
    const [effectiveAppearance, setEffectiveAppearance] = useState<"light" | "dark">("light")
    const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle")
    const [snapshot, setSnapshot] = useState<FoliateReaderSnapshot | null>(null)
    const [location, setLocation] = useState<FoliateReaderLocation>({})
    const [error, setError] = useState<Error | null>(null)
    const [historyState, setHistoryState] = useState({ canGoBack: false, canGoForward: false })
    const [bookKey, setBookKey] = useState<string | null>(null)
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
    const [helpOpen, setHelpOpen] = useState(false)
    const [locationDialogOpen, setLocationDialogOpen] = useState(false)
    const [locationDraft, setLocationDraft] = useState("")
    const [progressDraft, setProgressDraft] = useState<number | null>(null)
    const [pdfViewMode, setPdfViewMode] = useState<FoliatePdfViewMode>(PDF_VIEW_MODE_FIT)

    const preferencesRef = useRef(preferences)
    const effectiveAppearanceRef = useRef(effectiveAppearance)
    const annotationsRef = useRef(annotations)
    const bookmarksRef = useRef(bookmarks)
    const searchStateRef = useRef(searchState)
    const annotationDialogRef = useRef(annotationDialog)
    const pdfViewModeRef = useRef(pdfViewMode)

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
    const sourceIsPdf = isPdfSource(stableSource)
    const theme = getThemeDefinition(preferences.themeId)
    const canChangeFlow = snapshot ? !snapshot.isFixedLayout : false
    const canChangePdfView = sourceIsPdf && (snapshot?.isFixedLayout ?? false)
    const currentBookmark = useMemo(
      () => getBookmarkAtLocation(bookmarks, location.cfi),
      [bookmarks, location.cfi],
    )
    const flattenedToc = useMemo(() => flattenTocItems(snapshot?.toc ?? []), [snapshot?.toc])
    const readerLandmarks = snapshot?.landmarks ?? []

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
    effectiveAppearanceRef.current = effectiveAppearance
    annotationsRef.current = annotations
    bookmarksRef.current = bookmarks
    searchStateRef.current = searchState
    annotationDialogRef.current = annotationDialog
    pdfViewModeRef.current = pdfViewMode

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

    useEffect(() => {
      if (sourceIsPdf) {
        setPdfViewMode(PDF_VIEW_MODE_FIT)
      }
    }, [sourceDependencyKey, sourceIsPdf])

    useEffect(() => {
      const root = rootRef.current
      if (!root) return

      const syncRendererPreferences = () => {
        const view = viewRef.current
        if (!view) return
        const nextTheme = getThemeDefinition(preferencesRef.current.themeId)
        applyReaderPreferences(
          view,
          nextTheme,
          preferencesRef.current,
          effectiveAppearanceRef.current,
        )
        if (sourceIsPdf && view.isFixedLayout) syncPdfFixedLayoutView(view, pdfViewMode)
        syncMarginals(view, snapshotRef.current, locationRef.current)
      }

      syncRendererPreferences()

      const resizeObserver =
        typeof ResizeObserver === "undefined" ? null : new ResizeObserver(syncRendererPreferences)

      resizeObserver?.observe(root)
      return () => {
        resizeObserver?.disconnect()
      }
    }, [pdfViewMode, sourceIsPdf])

    useEffect(() => {
      if (preferences.appearanceMode === APPEARANCE_LIGHT) {
        setEffectiveAppearance("light")
        return
      }
      if (preferences.appearanceMode === APPEARANCE_DARK) {
        setEffectiveAppearance("dark")
        return
      }
      const media = window.matchMedia("(prefers-color-scheme: dark)")
      const apply = () => {
        setEffectiveAppearance(media.matches ? "dark" : "light")
      }
      apply()
      media.addEventListener("change", apply)
      return () => media.removeEventListener("change", apply)
    }, [preferences.appearanceMode])

    useEffect(() => {
      saveGlobalPreferences(preferences)
      const view = viewRef.current
      if (!view) return
      applyReaderPreferences(view, theme, preferences, effectiveAppearance)
      if (sourceIsPdf && view.isFixedLayout) syncPdfFixedLayoutView(view, pdfViewMode)
      syncMarginals(view, snapshotRef.current, locationRef.current)
    }, [effectiveAppearance, pdfViewMode, preferences, sourceIsPdf, theme])

    useEffect(() => {
      if (!bookKey) return
      saveBookState(bookKey, {
        lastLocation: typeof location.cfi === "string" ? location.cfi : undefined,
        bookmarks,
        annotations,
      })
    }, [annotations, bookmarks, bookKey, location.cfi])

    useEffect(() => {
      callbacksRef.current.onAnnotationsChange?.(annotations)
    }, [annotations])

    useEffect(() => {
      return () => {
        const generator = searchGeneratorRef.current
        if (generator) {
          void generator.return?.(undefined)
        }
      }
    }, [])

    useHotkey(
      "ArrowLeft",
      () => {
        void viewRef.current?.prev()
      },
      { enabled: preferences.flow === FLOW_PAGINATED },
    )

    useHotkey(
      "ArrowRight",
      () => {
        void viewRef.current?.next()
      },
      { enabled: preferences.flow === FLOW_PAGINATED },
    )

    useHotkey(
      "ArrowUp",
      () => {
        void viewRef.current?.prev()
      },
      { enabled: preferences.flow === FLOW_SCROLLED },
    )

    useHotkey(
      "ArrowDown",
      () => {
        void viewRef.current?.next()
      },
      { enabled: preferences.flow === FLOW_SCROLLED },
    )

    function resetTransientUi() {
      selectionActionRef.current = null
      setSelectionToolbar(null)
      setAnnotationPopover(null)
      setAnnotationDialog(null)
      setProgressDraft(null)
    }

    async function changePdfViewMode(nextMode: FoliatePdfViewMode) {
      setPdfViewMode(nextMode)

      const view = viewRef.current
      if (!sourceIsPdf || !view || !view.isFixedLayout) return

      resetTransientUi()
      const target = locationRef.current.cfi ?? locationRef.current.index ?? 0
      await updatePdfFixedLayoutViewMode(view, nextMode, target)
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

    const hydrateAnnotations = useCallback(
      async (view: FoliateView, nextAnnotations: ReaderAnnotation[], onlyIndex?: number) => {
        for (const annotation of nextAnnotations) {
          if (typeof onlyIndex === "number" && annotation.index !== onlyIndex) continue
          let info
          try {
            info =
              sourceIsPdf && view.isFixedLayout
                ? await addPdfAnnotation(view, annotation)
                : await view.addAnnotation(annotation)
          } catch (error) {
            console.warn("Failed to hydrate reader annotation", {
              annotation,
              error,
            })
            continue
          }
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
      [sourceIsPdf],
    )

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
      selectionActionRef.current = action
      setAnnotationPopover(null)
      setSelectionToolbar({
        text: action.text,
        cfi: action.cfi,
        ...(action.tocLabel ? { tocLabel: action.tocLabel } : {}),
        ...(action.pageLabel ? { pageLabel: action.pageLabel } : {}),
        ...(action.locationLabel ? { locationLabel: action.locationLabel } : {}),
        x: action.x,
        y: action.y,
      })
      callbacksRef.current.onChatSelection?.({
        text: action.text,
        cfi: action.cfi,
        index: action.index,
        selectionKey: action.selectionKey,
        ...(action.tocLabel ? { tocLabel: action.tocLabel } : {}),
        ...(action.pageLabel ? { pageLabel: action.pageLabel } : {}),
        ...(action.locationLabel ? { locationLabel: action.locationLabel } : {}),
      })
    }

    function removeCurrentChatSelection() {
      const selectionKey = selectionActionRef.current?.selectionKey
      if (!selectionKey) return
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
      const container = rootRef.current
      if (!container) return
      const position = getOverlayPosition(range, container)
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
      if (sourceIsPdf && view.isFixedLayout) {
        const range = await showPdfAnnotation(view, annotation)
        if (range) openAnnotationSurface(annotation.value, range)
        return
      }
      await view.showAnnotation(annotation)
      if (annotation.note?.trim()) {
        openAnnotationDialog(annotation)
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
        const info =
          sourceIsPdf && view.isFixedLayout
            ? (addPdfAnnotationFromSelection({
                view,
                annotation,
                index: selectionAction.index,
                range: selectionAction.range,
              }) ?? (await addPdfAnnotation(view, annotation)))
            : await view.addAnnotation(annotation)
        if (info) {
          annotation.index = info.index
          annotation.label = info.label
        }
        setAnnotations((current) =>
          [...current, annotation].sort((a, b) => a.value.localeCompare(b.value)),
        )
        setAnnotationDialog(null)
        dismissSelectionToolbar(true)
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
      if (sourceIsPdf && view.isFixedLayout) {
        await deletePdfAnnotation(view, existing)
      } else {
        await view.deleteAnnotation(existing)
      }
      const info =
        sourceIsPdf && view.isFixedLayout
          ? await addPdfAnnotation(view, updated)
          : await view.addAnnotation(updated)
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
      if (sourceIsPdf && view.isFixedLayout) {
        await deletePdfAnnotation(view, annotation)
      } else {
        await view.deleteAnnotation(annotation)
      }
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
        [...current, bookmark].sort((a, b) => a.value.localeCompare(b.value)),
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
      await viewRef.current?.goTo(value)
      setLocationDialogOpen(false)
    }

    function handleShortcut(event: KeyboardEvent | ReactKeyboardEvent<HTMLElement>) {
      if (isEditingTarget(event.target)) return
      const key = event.key
      const command = event.metaKey || event.ctrlKey
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
      if (key === "?" || (event.shiftKey && key === "/")) {
        event.preventDefault()
        setHelpOpen(true)
        return
      }
      if (key === "Escape") {
        setSelectionToolbar(null)
        setAnnotationPopover(null)
        setLocationDialogOpen(false)
        if (annotationDialogRef.current) setAnnotationDialog(null)
      }
    }

    useEffect(() => {
      const root = rootRef.current
      if (!root) return

      const listener = (event: KeyboardEvent) => handleShortcut(event)
      root.addEventListener("keydown", listener)
      return () => root.removeEventListener("keydown", listener)
    }, [])

    useEffect(() => {
      const host = viewportRef.current
      if (!host) return

      cleanupView(viewRef.current, coverUrlRef.current)
      clearPdfPageOverlays(viewRef.current)
      viewRef.current = null
      coverUrlRef.current = undefined
      host.replaceChildren()

      void resetSearch(null)
      resetTransientUi()

      if (!stableSource) {
        snapshotRef.current = null
        locationRef.current = {}
        setBookKey(null)
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
            const nextLocation = buildLocationState(event.detail)
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

          const drawAnnotationListener = (event: CustomEvent<FoliateDrawAnnotationEventDetail>) => {
            drawAnnotation(event)
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
            const isPdfDocument = sourceIsPdf && view.isFixedLayout
            event.detail.doc.addEventListener("pointerdown", () => {
              // Dispatch a pointerdown event on the main document to trigger dismissal
              // of popovers and other floating UI that listen for outside interactions.
              document.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
            })
            if (isPdfDocument) {
              preparePdfDocument(event.detail.doc)
            }
            event.detail.doc.addEventListener("pointerup", () => {
              const readSelection = () => {
                const selection = event.detail.doc.getSelection()
                const range = readSelectedRange(selection)
                const container = rootRef.current
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

              if (typeof requestAnimationFrame === "function") {
                requestAnimationFrame(readSelection)
              } else {
                readSelection()
              }
            })
            event.detail.doc.addEventListener("keydown", (keyEvent) => handleShortcut(keyEvent))
            if (sourceIsPdf && view.isFixedLayout) {
              registerPdfPageOverlay({
                view,
                doc: event.detail.doc,
                index: event.detail.index,
                onShowAnnotation: openAnnotationSurface,
              })
              void hydrateAnnotations(view, annotationsRef.current, event.detail.index)
            }
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
          if (sourceIsPdf && view.isFixedLayout) {
            configurePdfFixedLayoutView(view, pdfViewModeRef.current)
          }

          const nextBookKey = buildBookPersistenceKey(stableSource, view.book, persistenceSuffix)
          const persisted = loadBookState(nextBookKey)

          const themeDefinition = getThemeDefinition(preferencesRef.current.themeId)
          applyReaderPreferences(
            view,
            themeDefinition,
            preferencesRef.current,
            effectiveAppearanceRef.current,
          )
          const coverUrlPromise = resolveCoverUrl(view.book)

          const requestedLastLocation = stableInitialLocation ?? persisted.lastLocation
          const shouldShowTextStart =
            stableInitialLocation === undefined && persisted.lastLocation === undefined

          try {
            await view.init({
              lastLocation: requestedLastLocation,
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
              await view.init({
                showTextStart: true,
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

          const nextSnapshot: FoliateReaderSnapshot = {
            title:
              formatMetadataValue(view.book.metadata?.title) ??
              getSourceName(stableSource) ??
              DEFAULT_TITLE,
            author:
              formatContributor(view.book.metadata?.author) ??
              formatContributor(view.book.metadata?.contributor) ??
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
          const nextLocation = buildLocationState(view.lastLocation)
          snapshotRef.current = nextSnapshot
          locationRef.current = nextLocation

          startTransition(() => {
            setBookKey(nextBookKey)
            setBookmarks(persisted.bookmarks)
            setAnnotations(persisted.annotations)
            setSnapshot(nextSnapshot)
            setLocation(nextLocation)
            setStatus("ready")
          })

          updateHistoryState(view)
          syncMarginals(view, nextSnapshot, nextLocation)
          await hydrateAnnotations(view, persisted.annotations)
          callbacksRef.current.onReady?.(nextSnapshot)
          callbacksRef.current.onLocationChange?.(nextLocation)
        } catch (caughtError) {
          if (cancelled) return
          cleanupView(viewRef.current, coverUrlRef.current)
          clearPdfPageOverlays(viewRef.current)
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
        clearPdfPageOverlays(viewRef.current)
        viewRef.current = null
        coverUrlRef.current = undefined
        host.replaceChildren()
      }
    }, [hydrateAnnotations, persistenceSuffix, sourceIsPdf, stableInitialLocation, stableSource])

    const progressValue =
      progressDraft ?? Math.round((location.fraction ?? 0) * DEFAULT_PROGRESS_STEPS)
    const chromeClassName =
      effectiveAppearance === "dark"
        ? "bg-surface-strong text-text-strong"
        : "bg-surface-raised-base text-text-base"

    const readerPane = (
      <div className="flex h-full min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden">
        {showToolbar ? (
          <header className="relative z-[2] shrink-0">
            {/* Progress accent line at top */}
            <div className="absolute inset-x-0 top-0 h-px bg-border-base/30">
              <div
                className="h-full bg-text-interactive-base/60 transition-[width] duration-300"
                style={{
                  width: `${((progressValue / DEFAULT_PROGRESS_STEPS) * 100).toFixed(1)}%`,
                }}
              />
            </div>

            <div className="relative flex h-11 min-w-0 items-center gap-1 overflow-hidden px-2">
              <FoliateTocPopover
                snapshot={snapshot}
                tocLabel={location.tocLabel}
                onSelectHref={(href) => {
                  void viewRef.current?.goTo(href)
                }}
              />

              <FoliateBookmarksPopover
                bookmarks={bookmarks}
                currentBookmark={currentBookmark}
                onToggleBookmark={() => void toggleBookmark()}
                onGoToBookmark={(val) => void viewRef.current?.goTo(val)}
                onDeleteBookmark={(val) => setBookmarks((c) => c.filter((e) => e.value !== val))}
              />

              <FoliateAnnotationsPopover
                annotations={annotations}
                onShowAnnotation={(ann) => void showAnnotation(ann)}
                onOpenAnnotationDialog={openAnnotationDialog}
                onDeleteAnnotation={(val) => void deleteAnnotationValue(val)}
              />

              <div className="flex-1" />

              <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-48">
                <FoliateMetadataHoverCard snapshot={snapshot}>
                  <span className="pointer-events-auto cursor-pointer truncate text-xs font-medium text-text-base">
                    {snapshot?.title ??
                      (source ? getSourceName(source) : undefined) ??
                      DEFAULT_TITLE}
                  </span>
                </FoliateMetadataHoverCard>
              </div>

              <Separator orientation="vertical" className="mx-0.5 h-4" />

              <FoliateSearchPopover
                searchState={searchState}
                onQueryChange={(query) => setSearchState((c) => ({ ...c, query }))}
                onRunSearch={() => void runSearch()}
                onCycleResults={(dir) => void cycleSearchResults(dir)}
                onScopeChange={(scope) => {
                  if (scope === SEARCH_SCOPE_BOOK || scope === SEARCH_SCOPE_SECTION) {
                    setSearchState((c) => ({ ...c, scope }))
                  }
                }}
                onMatchCaseChange={(matchCase) => setSearchState((c) => ({ ...c, matchCase }))}
                onMatchWholeWordsChange={(matchWholeWords) =>
                  setSearchState((c) => ({ ...c, matchWholeWords }))
                }
                onMatchDiacriticsChange={(matchDiacritics) =>
                  setSearchState((c) => ({ ...c, matchDiacritics }))
                }
                onShowResult={(cfi) => void showSearchResult(cfi)}
                status={status}
                isReaderSearchScope={(v: string): v is FoliateReaderSearchScope =>
                  v === SEARCH_SCOPE_BOOK || v === SEARCH_SCOPE_SECTION
                }
              />

              <FoliatePreferencesPopover
                preferences={preferences}
                setPreferences={setPreferences}
                canChangeFlow={canChangeFlow}
              />

              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => void toggleBookmark()}
                aria-label={currentBookmark ? "Remove bookmark" : "Add bookmark"}
                className={cn(
                  "shrink-0 transition-colors",
                  currentBookmark
                    ? "text-text-interactive-base"
                    : "text-text-weaker hover:text-text-base",
                )}
              >
                <BookmarkIcon className={cn("size-4", currentBookmark && "fill-current")} />
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Reader actions"
                    className="shrink-0 text-text-weaker hover:text-text-base"
                  >
                    <EllipsisIcon className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onClick={openLocationDialog}>
                    <MapIcon className="mr-2 size-4" />
                    Location and jumps
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {canChangePdfView ? (
                    <>
                      <DropdownMenuItem onClick={() => void changePdfViewMode(PDF_VIEW_MODE_FIT)}>
                        <CheckIcon
                          className={cn(
                            "mr-2 size-4",
                            pdfViewMode === PDF_VIEW_MODE_FIT ? "opacity-100" : "opacity-0",
                          )}
                        />
                        <LayoutPanelLeftIcon className="mr-2 size-4" />
                        Fit page
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => void changePdfViewMode(PDF_VIEW_MODE_SCROLL)}
                      >
                        <CheckIcon
                          className={cn(
                            "mr-2 size-4",
                            pdfViewMode === PDF_VIEW_MODE_SCROLL ? "opacity-100" : "opacity-0",
                          )}
                        />
                        <ScrollTextIcon className="mr-2 size-4" />
                        Scroll page
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => void changePdfViewMode(PDF_VIEW_MODE_SPREAD)}
                      >
                        <CheckIcon
                          className={cn(
                            "mr-2 size-4",
                            pdfViewMode === PDF_VIEW_MODE_SPREAD ? "opacity-100" : "opacity-0",
                          )}
                        />
                        <BookOpenIcon className="mr-2 size-4" />
                        Two-page spread
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  ) : canChangeFlow ? (
                    <>
                      <DropdownMenuItem
                        onClick={() => setPreferences((c) => ({ ...c, flow: FLOW_PAGINATED }))}
                      >
                        <LayoutPanelLeftIcon className="mr-2 size-4" />
                        Paginated
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setPreferences((c) => ({ ...c, flow: FLOW_SCROLLED }))}
                      >
                        <ScrollTextIcon className="mr-2 size-4" />
                        Vertical scroll
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  ) : null}
                  <DropdownMenuItem onClick={() => setHelpOpen(true)}>
                    <CircleQuestionMarkIcon className="mr-2 size-4" />
                    Keyboard shortcuts
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
        ) : null}

        <div className={cn("relative min-h-0 min-w-0 w-full flex-1", theme.viewportClassName)}>
          {status === "loading" ? (
            <div className="absolute inset-x-3 top-3 z-10 sm:inset-x-4 sm:top-4">
              <div className="inline-flex items-center gap-1.5 border border-border-base/50 bg-surface-raised-base/90 px-2.5 py-1 text-[11px] text-text-weaker shadow-sm backdrop-blur">
                <Loader2Icon className="size-3 animate-spin" />
                Opening…
              </div>
            </div>
          ) : null}

          {status === "idle" ? (
            <FoliateEmptyState>{emptyState}</FoliateEmptyState>
          ) : status === "error" && error ? (
            <FoliateErrorState error={error} />
          ) : null}

          <div
            ref={viewportRef}
            className={cn(
              VIEWPORT_CLASS_NAME,
              "h-full min-h-[18rem] overflow-hidden sm:min-h-[24rem]",
              status === "idle" || status === "error" ? "hidden" : "block",
            )}
          />

          <FoliateSelectionToolbar
            selectionAction={selectionToolbar}
            onCopyText={(text: string) => void handleCopySelection(text)}
            onHighlight={() => {
              removeCurrentChatSelection()
              const action = selectionActionRef.current
              if (!action) return
              const now = new Date().toISOString()
              const annotation: ReaderAnnotation = {
                value: action.cfi,
                text: action.text,
                note: "",
                style: ANNOTATION_STYLE_HIGHLIGHT,
                color: getAnnotationColorValue(DEFAULT_ANNOTATION_COLOR_ID),
                created: now,
                modified: now,
              }
              void (async () => {
                const view = viewRef.current
                const info = !view
                  ? undefined
                  : sourceIsPdf && view.isFixedLayout
                    ? (addPdfAnnotationFromSelection({
                        view,
                        annotation,
                        index: action.index,
                        range: action.range,
                      }) ?? (await addPdfAnnotation(view, annotation)))
                    : await view.addAnnotation(annotation)
                if (info) {
                  annotation.index = info.index
                  annotation.label = info.label
                }
                setAnnotations((current) =>
                  [...current, annotation].sort((a, b) => a.value.localeCompare(b.value)),
                )
                dismissSelectionToolbar(true)
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
            onClose={() => setSelectionToolbar(null)}
          />

          <FoliateAnnotationPopover
            popover={annotationPopover}
            onOpenAnnotationDialog={(ann?: ReaderAnnotation) => openAnnotationDialog(ann)}
            onDeleteAnnotation={(val: string) => void deleteAnnotationValue(val)}
            annotations={annotations}
          />
        </div>

        {/* Solid Footer — matches header color & style */}
        {snapshot && status === "ready" ? (
          <footer className="z-30 flex h-10 w-full shrink-0 flex-col justify-center px-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Previous page"
                  onClick={() => {
                    void viewRef.current?.goLeft()
                  }}
                  className="size-7 text-text-weaker hover:text-text-base border-none"
                >
                  <ChevronLeftIcon className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => viewRef.current?.history.back()}
                  disabled={!historyState.canGoBack}
                  className="size-7 text-text-weaker hover:text-text-base border-none"
                >
                  <Undo2Icon className="size-3" />
                </Button>
              </div>

              <div className="flex items-center gap-2 overflow-hidden text-[9px] font-medium tracking-tight text-text-weaker uppercase">
                {typeof location.index === "number" && (
                  <span className="shrink-0 opacity-40 font-mono">{location.index + 1}</span>
                )}
                <span className="truncate max-w-[200px] opacity-80 tracking-widest">
                  {location.tocLabel ?? snapshot.title}
                </span>
                <span className="mx-0.5 opacity-30 tracking-widest leading-none">•</span>
                <span className="shrink-0 font-mono opacity-50">
                  {location.pageLabel ??
                    location.locationLabel ??
                    (location.fraction !== undefined
                      ? `${Math.round(location.fraction * 100)}%`
                      : "")}
                </span>
              </div>

              <div className="flex items-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => viewRef.current?.history.forward()}
                  disabled={!historyState.canGoForward}
                  className="size-7 text-text-weaker hover:text-text-base border-none"
                >
                  <Redo2Icon className="size-3" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Next page"
                  onClick={() => {
                    void viewRef.current?.goRight()
                  }}
                  className="size-7 text-text-weaker hover:text-text-base border-none"
                >
                  <ChevronRightIcon className="size-3.5" />
                </Button>
              </div>
            </div>

            {/* Scrubber slider — ultrathin hairline at the very bottom */}
            <div className="group/scrubber relative h-2 w-full mt-1">
              <input
                type="range"
                min="0"
                max={String(DEFAULT_PROGRESS_STEPS)}
                step="1"
                value={progressDraft ?? progressValue}
                onChange={(event) => {
                  setProgressDraft(Number(event.target.value))
                }}
                onPointerUp={() => {
                  if (progressDraft === null) return
                  void viewRef.current?.goToFraction(progressDraft / DEFAULT_PROGRESS_STEPS)
                  setProgressDraft(null)
                }}
                onPointerCancel={() => setProgressDraft(null)}
                className="peer absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent outline-none [&::-webkit-slider-runnable-track]:h-px [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:mt-[-3px] [&::-webkit-slider-thumb]:h-1.5 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-text-weaker/40 [&::-webkit-slider-thumb]:transition-all peer-hover:[&::-webkit-slider-thumb]:bg-text-interactive-base"
              />
            </div>
          </footer>
        ) : null}
      </div>
    )

    return (
      <section
        ref={rootRef}
        tabIndex={0}
        data-component="foliate-reader"
        data-theme={theme.id}
        data-appearance={effectiveAppearance}
        onKeyDown={handleShortcut}
        className={cn(
          "h-full w-full min-h-0 overflow-hidden shadow-[0_8px_32px_color-mix(in_oklab,var(--surface-strong)_12%,transparent)]",
          chromeClassName,
          theme.shellClassName,
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
            filter: ${effectiveAppearance === "dark" ? theme.pdfFilterDark : theme.pdfFilterLight};
          }

          /* Custom scrollbar to match theme */
          * {
            scrollbar-width: thin;
            scrollbar-color: color-mix(in oklab, ${theme.contentForeground} 15%, transparent) transparent;
          }

          ::-webkit-scrollbar {
            width: 8px;
            height: 8px;
          }

          ::-webkit-scrollbar-track {
            background: transparent;
          }

          ::-webkit-scrollbar-thumb {
            background: color-mix(in oklab, ${theme.contentForeground} 15%, transparent);
            border-radius: 10px;
          }

          ::-webkit-scrollbar-thumb:hover {
            background: color-mix(in oklab, ${theme.contentForeground} 25%, transparent);
          }
        `}</style>

        {readerPane}

        <FoliateAnnotationDialog
          dialog={annotationDialog}
          selectionToolbarText={selectionToolbar?.text ?? null}
          isReaderAnnotationColorId={isReaderAnnotationColorId}
          onChangeNote={(note: string) => setAnnotationDialog((c) => (c ? { ...c, note } : null))}
          onChangeStyle={(style: any) => setAnnotationDialog((c) => (c ? { ...c, style } : null))}
          onChangeColor={(color: any) => setAnnotationDialog((c) => (c ? { ...c, color } : null))}
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

        <FoliateHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
      </section>
    )
  },
)

FoliateReader.displayName = "FoliateReader"
