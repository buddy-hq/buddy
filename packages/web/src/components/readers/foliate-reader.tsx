import {
  forwardRef,
  startTransition,
  useEffect,
  useImperativeHandle,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react"
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  ScrollArea,
  Separator,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
  // Icons from @buddy/ui
  BookOpenIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleQuestionMarkIcon,
  EllipsisIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PinIcon,
  SettingsIcon,
} from "@buddy/ui"
import {
  InfoIcon,
  LayoutPanelLeftIcon,
  Loader2Icon,
  MapIcon,
  PencilLineIcon,
  Redo2Icon,
  ScrollTextIcon,
  SearchIcon,
  Undo2Icon,
} from "lucide-react"
import { FoliateAnnotationsPanel } from "./ui/foliate-annotations-panel"
import { FoliateBookmarksPanel } from "./ui/foliate-bookmarks-panel"
import { FoliateEmptyState } from "./ui/foliate-empty-state"
import { FoliateErrorState } from "./ui/foliate-error-state"
import { FoliateMetadataPanel } from "./ui/foliate-metadata-panel"
import { FoliatePreferencesPanel } from "./ui/foliate-preferences-panel"
import { FoliateSearchPanel } from "./ui/foliate-search-panel"
import { FoliateTocTree } from "./ui/foliate-toc-tree"
import { FoliateHelpDialog } from "./ui/foliate-help-dialog"
import { FoliateLocationDialog } from "./ui/foliate-location-dialog"
import { FoliateAnnotationDialog } from "./ui/foliate-annotation-dialog"
import { FoliateAnnotationPopover } from "./ui/foliate-annotation-popover"
import { FoliateSelectionToolbar } from "./ui/foliate-selection-toolbar"
import { ResizeHandle } from "@/components/layout/resize-handle"
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
  FoliateReaderSidebarTab,
  FoliateReaderSnapshot,
  FoliateReaderSource,
  FoliateReaderThemeId,
  ReaderAnnotation,
  ReaderAnnotationColorId,
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
  ANNOTATION_COLORS,
  ANNOTATION_STYLE_HIGHLIGHT,
  APPEARANCE_DARK,
  APPEARANCE_LIGHT,
  DEFAULT_AUTHOR,
  DEFAULT_PROGRESS_STEPS,
  DEFAULT_TITLE,
  FLOW_PAGINATED,
  FLOW_SCROLLED,
  READER_SIDEBAR_BREAKPOINT_HYSTERESIS_PX,
  READER_SIDEBAR_DESKTOP_BREAKPOINT_PX,
  SEARCH_RESULT_KEY_PREFIX,
  SEARCH_SCOPE_BOOK,
  SEARCH_SCOPE_SECTION,
  SEARCH_SECTION_KEY_PREFIX,
  SIDEBAR_ANNOTATIONS,
  SIDEBAR_BOOKMARKS,
  SIDEBAR_CONTENTS,
  SIDEBAR_DETAILS,
  SIDEBAR_PREFERENCES,
  SIDEBAR_SEARCH,
  TOC_EMPTY_MESSAGE,
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
  isFoliateSidebarTab,
  isEditingTarget,
  isReaderAnnotationColorId,
  readSelectedRange,
  releaseObjectUrl,
  resolveCoverUrl,
  syncMarginals,
  toFoliateInput,
} from "./utils/foliate-helpers"
import {
  buildBookPersistenceKey,
  loadBookState,
  loadGlobalPreferences,
  saveBookState,
  saveGlobalPreferences,
} from "./utils/foliate-storage"
import { applyReaderPreferences, getThemeDefinition } from "./utils/foliate-themes"
import { drawAnnotation, toAnnotationDialogState } from "./utils/foliate-drawing"
import { formatContributor, formatMetadataValue, toPercentLabel } from "./utils/foliate-formatters"
// Components already imported above

ensureFoliateRuntimeCompat()

export type {
  FoliateReaderAppearanceMode,
  FoliateReaderAnnotationStyle,
  FoliateReaderFlow,
  FoliateReaderFontPreset,
  FoliateReaderLandmark,
  FoliateReaderLocation,
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
    const rootRef = useRef<HTMLElement | null>(null)
    const viewportRef = useRef<HTMLDivElement | null>(null)
    const viewRef = useRef<FoliateView | null>(null)
    const coverUrlRef = useRef<string | undefined>(undefined)
    const snapshotRef = useRef<FoliateReaderSnapshot | null>(null)
    const locationRef = useRef<FoliateReaderLocation>({})
    const searchGeneratorRef = useRef<AsyncGenerator<FoliateSearchResult> | null>(null)
    const searchRunIdRef = useRef(0)
    const selectionActionRef = useRef<ReaderSelectionAction | null>(null)
    const searchViewportRef = useRef<HTMLDivElement | null>(null)
    const bookmarkViewportRef = useRef<HTMLDivElement | null>(null)
    const annotationViewportRef = useRef<HTMLDivElement | null>(null)
    const searchInputRef = useRef<HTMLInputElement | null>(null)
    const callbacksRef = useRef({
      onReady,
      onLocationChange,
      onOpenExternalLink,
      onError,
    })
    const sliderListId = useId()
    const [preferences, setPreferences] = useState(() =>
      loadGlobalPreferences(defaultTheme, defaultFlow),
    )
    const [effectiveAppearance, setEffectiveAppearance] = useState<"light" | "dark">("light")
    const [sidebarTab, setSidebarTab] = useState<FoliateReaderSidebarTab>(defaultSidebarTab)
    const [sidebarOpen, setSidebarOpen] = useState(showSidebar)
    const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle")
    const [snapshot, setSnapshot] = useState<FoliateReaderSnapshot | null>(null)
    const [location, setLocation] = useState<FoliateReaderLocation>({})
    const [error, setError] = useState<Error | null>(null)
    const [historyState, setHistoryState] = useState({ canGoBack: false, canGoForward: false })
    const [sectionFractions, setSectionFractions] = useState<number[]>([])
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
    const [useDesktopSidebarLayout, setUseDesktopSidebarLayout] = useState(() =>
      typeof window !== "undefined"
        ? window.innerWidth >= READER_SIDEBAR_DESKTOP_BREAKPOINT_PX
        : false,
    )
    const [sidebarWidth, setSidebarWidth] = useState(() => {
      if (typeof window !== "undefined") {
        const saved = localStorage.getItem("foliateSidebarWidth")
        return saved ? parseInt(saved, 10) : 344
      }
      return 344
    })

    useEffect(() => {
      localStorage.setItem("foliateSidebarWidth", sidebarWidth.toString())
    }, [sidebarWidth])

    const preferencesRef = useRef(preferences)
    const effectiveAppearanceRef = useRef(effectiveAppearance)
    const annotationsRef = useRef(annotations)
    const bookmarksRef = useRef(bookmarks)
    const searchStateRef = useRef(searchState)
    const annotationDialogRef = useRef(annotationDialog)

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
    const theme = getThemeDefinition(preferences.themeId)
    const canChangeFlow = snapshot ? !snapshot.isFixedLayout : false
    const currentBookmark = useMemo(
      () => getBookmarkAtLocation(bookmarks, location.cfi),
      [bookmarks, location.cfi],
    )
    const flattenedToc = useMemo(() => flattenTocItems(snapshot?.toc ?? []), [snapshot?.toc])
    const readerLandmarks = snapshot?.landmarks ?? []

    callbacksRef.current = {
      onReady,
      onLocationChange,
      onOpenExternalLink,
      onError,
    }
    preferencesRef.current = preferences
    effectiveAppearanceRef.current = effectiveAppearance
    annotationsRef.current = annotations
    bookmarksRef.current = bookmarks
    searchStateRef.current = searchState
    annotationDialogRef.current = annotationDialog

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
      setSidebarOpen(showSidebar)
    }, [showSidebar])

    useEffect(() => {
      const desktopSidebarExitWidth =
        READER_SIDEBAR_DESKTOP_BREAKPOINT_PX - READER_SIDEBAR_BREAKPOINT_HYSTERESIS_PX

      const syncSidebarLayout = () => {
        setUseDesktopSidebarLayout((current) => {
          const viewportWidth = window.innerWidth
          if (current) {
            return viewportWidth >= desktopSidebarExitWidth
          }
          return viewportWidth >= READER_SIDEBAR_DESKTOP_BREAKPOINT_PX
        })
      }

      syncSidebarLayout()
      window.addEventListener("resize", syncSidebarLayout)
      return () => window.removeEventListener("resize", syncSidebarLayout)
    }, [])

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
      syncMarginals(view, snapshotRef.current, locationRef.current)
    }, [effectiveAppearance, preferences, theme])

    useEffect(() => {
      if (!bookKey) return
      saveBookState(bookKey, {
        lastLocation: typeof location.cfi === "string" ? location.cfi : undefined,
        bookmarks,
        annotations,
      })
    }, [annotations, bookmarks, bookKey, location.cfi])

    useEffect(() => {
      return () => {
        const generator = searchGeneratorRef.current
        if (generator) {
          void generator.return?.(undefined)
        }
      }
    }, [])

    function resetTransientUi() {
      selectionActionRef.current = null
      setSelectionToolbar(null)
      setAnnotationPopover(null)
      setAnnotationDialog(null)
      setProgressDraft(null)
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
      setSidebarTab(SIDEBAR_SEARCH)
      setSidebarOpen(true)
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

    async function hydrateAnnotations(
      view: FoliateView,
      nextAnnotations: ReaderAnnotation[],
      onlyIndex?: number,
    ) {
      for (const annotation of nextAnnotations) {
        if (typeof onlyIndex === "number" && annotation.index !== onlyIndex) continue
        const info = await view.addAnnotation(annotation)
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
    }

    function updateHistoryState(view: FoliateView) {
      setHistoryState({
        canGoBack: view.history.canGoBack,
        canGoForward: view.history.canGoForward,
      })
    }

    function openSelectionToolbar(action: ReaderSelectionAction) {
      selectionActionRef.current = action
      setAnnotationPopover(null)
      setSelectionToolbar({
        text: action.text,
        cfi: action.cfi,
        x: action.x,
        y: action.y,
      })
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
          color: "amber",
        })
      }
      setSelectionToolbar(null)
      setAnnotationPopover(null)
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
        const info = await view.addAnnotation(annotation)
        if (info) {
          annotation.index = info.index
          annotation.label = info.label
        }
        setAnnotations((current) =>
          [...current, annotation].sort((a, b) => a.value.localeCompare(b.value)),
        )
        setAnnotationDialog(null)
        setSelectionToolbar(null)
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
      await view.deleteAnnotation(existing)
      const info = await view.addAnnotation(updated)
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
      await view.deleteAnnotation(annotation)
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
      setSidebarOpen(true)
      setSidebarTab(SIDEBAR_SEARCH)
      setSearchState((current) => ({ ...current, query }))
      window.setTimeout(() => {
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
      }, 0)
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
        setSidebarOpen(true)
        setSidebarTab(SIDEBAR_PREFERENCES)
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
        setSectionFractions([])
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
      setSectionFractions([])
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
            openAnnotationPopover(event.detail.value, event.detail.range)
          }

          const historyListener = () => updateHistoryState(view)

          const loadListener = (event: CustomEvent<{ doc: Document; index: number }>) => {
            event.detail.doc.addEventListener("pointerup", () => {
              const selection = event.detail.doc.getSelection()
              const range = readSelectedRange(selection)
              const container = rootRef.current
              if (!range || !container) {
                return
              }
              const position = getOverlayPosition(range, container)
              openSelectionToolbar({
                index: event.detail.index,
                range,
                cfi: view.getCFI(event.detail.index, range),
                text: selection?.toString().trim() ?? "",
                x: position.x,
                y: position.y,
              })
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

          const nextBookKey = buildBookPersistenceKey(stableSource, view.book)
          const persisted = loadBookState(nextBookKey)

          const themeDefinition = getThemeDefinition(preferencesRef.current.themeId)
          applyReaderPreferences(
            view,
            themeDefinition,
            preferencesRef.current,
            effectiveAppearanceRef.current,
          )
          const coverUrlPromise = resolveCoverUrl(view.book)

          await view.init({
            lastLocation: stableInitialLocation ?? persisted.lastLocation,
            showTextStart:
              stableInitialLocation === undefined && persisted.lastLocation === undefined,
          })

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

          setSectionFractions(view.getSectionFractions())
          updateHistoryState(view)
          syncMarginals(view, nextSnapshot, nextLocation)
          await hydrateAnnotations(view, persisted.annotations)
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
    }, [stableInitialLocation, stableSource])

    const progressValue =
      progressDraft ?? Math.round((location.fraction ?? 0) * DEFAULT_PROGRESS_STEPS)
    const chromeClassName =
      effectiveAppearance === "dark"
        ? "border-border-base/60 bg-surface-strong text-text-strong"
        : "border-border-base/60 bg-surface-raised-base text-text-base"

    const renderSearchPanel = () => (
      <FoliateSearchPanel
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
        searchInputRef={searchInputRef}
        searchViewportRef={searchViewportRef}
        status={status}
        isReaderSearchScope={(v: string): v is FoliateReaderSearchScope =>
          v === SEARCH_SCOPE_BOOK || v === SEARCH_SCOPE_SECTION
        }
      />
    )

    const renderBookmarksPanel = () => (
      <FoliateBookmarksPanel
        bookmarks={bookmarks}
        currentBookmark={currentBookmark}
        onToggleBookmark={() => void toggleBookmark()}
        onGoToBookmark={(val) => void viewRef.current?.goTo(val)}
        onDeleteBookmark={(val) => setBookmarks((c) => c.filter((e) => e.value !== val))}
        bookmarkViewportRef={bookmarkViewportRef}
      />
    )

    const renderAnnotationsPanel = () => (
      <FoliateAnnotationsPanel
        annotations={annotations}
        onShowAnnotation={(ann) => void viewRef.current?.showAnnotation(ann)}
        onOpenAnnotationDialog={openAnnotationDialog}
        onDeleteAnnotation={(val) => void deleteAnnotationValue(val)}
        annotationViewportRef={annotationViewportRef}
      />
    )

    const renderPreferencesPanel = () => (
      <FoliatePreferencesPanel
        preferences={preferences}
        setPreferences={setPreferences}
        canChangeFlow={canChangeFlow}
      />
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
          "grid min-h-0 overflow-hidden border shadow-[0_8px_32px_color-mix(in_oklab,var(--surface-strong)_12%,transparent)]",
          chromeClassName,
          theme.shellClassName,
          sidebarOpen && useDesktopSidebarLayout ? undefined : "grid-cols-1",
          className,
        )}
        style={
          sidebarOpen && useDesktopSidebarLayout
            ? { gridTemplateColumns: `${sidebarWidth}px minmax(0, 1fr)` }
            : undefined
        }
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

          [data-component="foliate-reader"][data-theme="${theme.id}"][data-appearance="${effectiveAppearance}"] .${VIEWPORT_CLASS_NAME} > .${VIEW_ELEMENT_CLASS_NAME}::part(filter) {
            filter: ${effectiveAppearance === "dark" ? theme.pdfFilterDark : theme.pdfFilterLight};
          }
        `}</style>

        {sidebarOpen ? (
          <aside
            className={cn(
              "relative min-h-0 bg-surface-base",
              useDesktopSidebarLayout
                ? "border-r border-border-base/50"
                : "border-b border-border-base/50",
            )}
          >
            <Tabs
              value={sidebarTab}
              onValueChange={(nextValue) => {
                if (isFoliateSidebarTab(nextValue)) setSidebarTab(nextValue)
              }}
              className="flex h-full min-h-0 flex-col"
            >
              {/* Book identity block */}
              <div className="border-b border-border-base/40 px-4 py-3">
                <div className="flex items-center gap-3">
                  {snapshot?.coverUrl ? (
                    <img
                      src={snapshot.coverUrl}
                      alt={`${snapshot.title} cover`}
                      className="h-14 w-10 shrink-0 object-cover shadow-sm"
                    />
                  ) : (
                    <div className="flex h-14 w-10 shrink-0 items-center justify-center border border-border-base/40 bg-surface-weak/50 text-text-weaker">
                      <BookOpenIcon className="size-3.5" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold leading-snug text-text-strong">
                      {snapshot?.title ??
                        (source ? getSourceName(source) : undefined) ??
                        DEFAULT_TITLE}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-text-weaker">
                      {snapshot?.author ?? DEFAULT_AUTHOR}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-0.5 flex-1 bg-border-base/40">
                        <div
                          className="h-full bg-text-interactive-base/70 transition-[width] duration-500"
                          style={{ width: toPercentLabel(location.fraction) ?? "0%" }}
                        />
                      </div>
                      <span className="shrink-0 font-mono text-[10px] tabular-nums text-text-weaker">
                        {toPercentLabel(location.fraction) ?? "0%"}
                      </span>
                    </div>
                  </div>
                </div>
                {location.tocLabel ? (
                  <div className="mt-2 truncate text-[11px] text-text-weaker">
                    <span className="text-text-weaker/60">Now reading</span>{" "}
                    <span className="text-text-weak">{location.tocLabel}</span>
                  </div>
                ) : null}
              </div>

              {/* Tab strip — icon + label, underline active */}
              <TabsList className="grid h-auto w-full shrink-0 grid-cols-6 gap-0 rounded-none border-b border-border-base/40 bg-transparent p-0">
                {(
                  [
                    { value: SIDEBAR_CONTENTS, label: "Contents", icon: MapIcon },
                    { value: SIDEBAR_SEARCH, label: "Search", icon: SearchIcon },
                    { value: SIDEBAR_BOOKMARKS, label: "Marks", icon: PinIcon },
                    { value: SIDEBAR_ANNOTATIONS, label: "Notes", icon: PencilLineIcon },
                    { value: SIDEBAR_DETAILS, label: "Details", icon: InfoIcon },
                    { value: SIDEBAR_PREFERENCES, label: "Prefs", icon: SettingsIcon },
                  ] as const
                ).map(({ value, label, icon: Icon }) => (
                  <TabsTrigger
                    key={value}
                    value={value}
                    className={cn(
                      "flex h-10 flex-col items-center justify-center gap-0.5 rounded-none border-b-2 border-transparent py-1 text-[10px] text-text-weaker transition-colors",
                      "data-[state=active]:border-text-interactive-base data-[state=active]:bg-transparent data-[state=active]:text-text-interactive-base",
                      "hover:bg-surface-weak/50 hover:text-text-weak",
                    )}
                  >
                    <Icon className="size-3.5" />
                    <span className="leading-none">{label}</span>
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value={SIDEBAR_CONTENTS} className="min-h-0 flex-1">
                <ScrollArea className="h-full px-3 py-3">
                  {snapshot?.toc?.length ? (
                    <FoliateTocTree
                      items={snapshot.toc}
                      activeLabel={location.tocLabel}
                      onSelect={(href) => {
                        void viewRef.current?.goTo(href)
                      }}
                    />
                  ) : (
                    <p className="px-1 py-4 text-[12px] text-text-weaker">{TOC_EMPTY_MESSAGE}</p>
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value={SIDEBAR_SEARCH} className="min-h-0 flex-1">
                {renderSearchPanel()}
              </TabsContent>

              <TabsContent value={SIDEBAR_BOOKMARKS} className="min-h-0 flex-1">
                {renderBookmarksPanel()}
              </TabsContent>

              <TabsContent value={SIDEBAR_ANNOTATIONS} className="min-h-0 flex-1">
                {renderAnnotationsPanel()}
              </TabsContent>

              <TabsContent value={SIDEBAR_DETAILS} className="min-h-0 flex-1">
                <ScrollArea className="h-full px-3 py-4">
                  <FoliateMetadataPanel snapshot={snapshot} />
                </ScrollArea>
              </TabsContent>

              <TabsContent value={SIDEBAR_PREFERENCES} className="min-h-0 flex-1">
                {renderPreferencesPanel()}
              </TabsContent>
            </Tabs>
            {useDesktopSidebarLayout ? (
              <ResizeHandle
                direction="horizontal"
                size={sidebarWidth}
                min={240}
                max={600}
                onResize={setSidebarWidth}
              />
            ) : null}
          </aside>
        ) : null}

        <div className="flex min-h-0 flex-col">
          {showToolbar ? (
            <header className="relative border-b border-border-base/50">
              {/* Progress accent line at top */}
              <div className="absolute inset-x-0 top-0 h-px bg-border-base/30">
                <div
                  className="h-full bg-text-interactive-base/60 transition-[width] duration-300"
                  style={{
                    width: `${((progressValue / DEFAULT_PROGRESS_STEPS) * 100).toFixed(1)}%`,
                  }}
                />
              </div>

              <div className="flex h-11 items-center gap-1 px-2">
                {showSidebar ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setSidebarOpen((current) => !current)}
                    aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
                    className="shrink-0 text-text-weaker hover:text-text-base"
                  >
                    {sidebarOpen ? (
                      <PanelLeftCloseIcon className="size-4" />
                    ) : (
                      <PanelLeftOpenIcon className="size-4" />
                    )}
                  </Button>
                ) : null}

                <Separator orientation="vertical" className="mx-0.5 h-4" />

                <div className="flex items-center gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Previous page"
                    onClick={() => {
                      void viewRef.current?.goLeft()
                    }}
                    disabled={status !== "ready"}
                    className="text-text-weaker hover:text-text-base"
                  >
                    <ChevronLeftIcon className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="History back"
                    onClick={() => viewRef.current?.history.back()}
                    disabled={!historyState.canGoBack}
                    className="text-text-weaker hover:text-text-base"
                  >
                    <Undo2Icon className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="History forward"
                    onClick={() => viewRef.current?.history.forward()}
                    disabled={!historyState.canGoForward}
                    className="text-text-weaker hover:text-text-base"
                  >
                    <Redo2Icon className="size-3.5" />
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
                    className="text-text-weaker hover:text-text-base"
                  >
                    <ChevronRightIcon className="size-4" />
                  </Button>
                </div>

                <Separator orientation="vertical" className="mx-0.5 h-4" />

                {/* Location pill */}
                <button
                  type="button"
                  onClick={openLocationDialog}
                  className="min-w-0 flex-1 px-2 py-1 text-left transition-colors hover:bg-surface-weak/60"
                  aria-label="Open location and jumps"
                >
                  <div className="flex items-baseline gap-2 truncate">
                    <span className="truncate text-xs font-medium text-text-base">
                      {location.tocLabel ?? snapshot?.title ?? DEFAULT_TITLE}
                    </span>
                    {location.pageLabel ? (
                      <span className="shrink-0 text-[11px] text-text-weaker">
                        {location.pageLabel}
                      </span>
                    ) : null}
                  </div>
                </button>

                <span className="shrink-0 font-mono text-[11px] tabular-nums text-text-weaker">
                  {toPercentLabel(location.fraction) ?? "—"}
                </span>

                <Separator orientation="vertical" className="mx-0.5 h-4" />

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
                  <PinIcon className={cn("size-4", currentBookmark && "fill-current")} />
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
                    <DropdownMenuItem onClick={() => openSearchWithQuery(searchState.query)}>
                      <SearchIcon className="mr-2 size-4" />
                      Find in book
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={openLocationDialog}>
                      <MapIcon className="mr-2 size-4" />
                      Location and jumps
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setSidebarOpen(true)
                        setSidebarTab(SIDEBAR_PREFERENCES)
                      }}
                    >
                      <SettingsIcon className="mr-2 size-4" />
                      Reader preferences
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {canChangeFlow ? (
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

              {/* Progress scrubber — hairline */}
              <div className="px-2 pb-1.5">
                <input
                  type="range"
                  min="0"
                  max={String(DEFAULT_PROGRESS_STEPS)}
                  step="1"
                  list={sliderListId}
                  value={progressValue}
                  onChange={(event) => {
                    setProgressDraft(Number(event.target.value))
                  }}
                  onMouseUp={() => {
                    if (progressDraft === null) return
                    void viewRef.current?.goToFraction(progressDraft / DEFAULT_PROGRESS_STEPS)
                    setProgressDraft(null)
                  }}
                  onTouchEnd={() => {
                    if (progressDraft === null) return
                    void viewRef.current?.goToFraction(progressDraft / DEFAULT_PROGRESS_STEPS)
                    setProgressDraft(null)
                  }}
                  className="h-0.5 w-full cursor-pointer appearance-none bg-border-base/40 accent-[var(--text-interactive-base)] [&::-webkit-slider-thumb]:size-2.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:bg-[var(--text-interactive-base)] [&::-webkit-slider-thumb]:shadow-sm"
                />
                <datalist id={sliderListId}>
                  {sectionFractions.map((fraction) => (
                    <option key={fraction} value={Math.round(fraction * DEFAULT_PROGRESS_STEPS)} />
                  ))}
                </datalist>
              </div>
            </header>
          ) : null}

          <div className={cn("relative min-h-0 flex-1 p-2 sm:p-3", theme.viewportClassName)}>
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
                "h-full min-h-[24rem] overflow-hidden border border-border-base/50 bg-surface-raised-base/80",
                status === "idle" || status === "error" ? "hidden" : "block",
              )}
            />

            <FoliateSelectionToolbar
              selectionAction={selectionToolbar}
              onCopyText={(text: string) => void copyText(text)}
              onHighlight={() => {
                const action = selectionActionRef.current
                if (!action) return
                const now = new Date().toISOString()
                const annotation: ReaderAnnotation = {
                  value: action.cfi,
                  text: action.text,
                  note: "",
                  style: ANNOTATION_STYLE_HIGHLIGHT,
                  color: ANNOTATION_COLORS.amber.value,
                  created: now,
                  modified: now,
                }
                void (async () => {
                  const info = await viewRef.current?.addAnnotation(annotation)
                  if (info) {
                    annotation.index = info.index
                    annotation.label = info.label
                  }
                  setAnnotations((current) =>
                    [...current, annotation].sort((a, b) => a.value.localeCompare(b.value)),
                  )
                  setSelectionToolbar(null)
                })()
              }}
              onOpenAnnotationDialog={() => openAnnotationDialog()}
              onSearch={(query: string) => openSearchWithQuery(query)}
              onClose={() => setSelectionToolbar(null)}
            />

            <FoliateAnnotationPopover
              popover={annotationPopover}
              onOpenAnnotationDialog={(ann?: ReaderAnnotation) => openAnnotationDialog(ann)}
              onDeleteAnnotation={(val: string) => void deleteAnnotationValue(val)}
              annotations={annotations}
            />

            {snapshot && location.tocLabel ? (
              <div className="pointer-events-none absolute inset-x-4 bottom-4 hidden justify-center lg:flex">
                <div className="pointer-events-none inline-flex items-center gap-2 border border-border-base/40 bg-surface-raised-base/80 px-3 py-1.5 shadow-sm backdrop-blur">
                  <span className="max-w-48 truncate text-[11px] text-text-weaker">
                    {location.tocLabel}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] tabular-nums text-text-weaker/60">
                    {toPercentLabel(location.fraction)}
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        </div>

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
