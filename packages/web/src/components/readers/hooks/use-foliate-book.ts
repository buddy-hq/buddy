import { useCallback, useEffect, useRef, useState } from "react"
import type * as React from "react"
import type {
  FoliateReaderSnapshot,
  FoliateReaderSource,
  FoliateNavigationTarget,
  FoliateReaderLocation,
} from "../foliate-reader-types"
import { buildBookPersistenceKey, loadBookState } from "../utils/foliate-storage"
import {
  buildLocationState,
  buildLandmarks,
  cleanupView,
  createError,
  resolveCoverUrl,
  releaseObjectUrl,
  syncMarginals,
} from "../utils/foliate-helpers"
import { DEFAULT_AUTHOR, DEFAULT_TITLE } from "../foliate-reader-constants"
import { getSourceName, getSourceFormatLabel } from "../utils/foliate-helpers"
import { formatMetadataValue, formatContributor } from "../utils/foliate-formatters"
import type { View as FoliateView } from "foliate-js/view.js"
import type { FoliateRelocationDetail, FoliateDrawAnnotationEventDetail } from "foliate-js/view.js"

export interface UseFoliateBookOptions {
  source: FoliateReaderSource | null
  initialLocation?: FoliateNavigationTarget
  onReady?: (snapshot: FoliateReaderSnapshot) => void
  onLocationChange?: (location: FoliateReaderLocation) => void
  onOpenExternalLink?: (href: string) => void
  onError?: (error: Error) => void
}

export interface UseFoliateBookReturn {
  view: FoliateView | null
  snapshot: FoliateReaderSnapshot | null
  location: FoliateReaderLocation
  status: "idle" | "loading" | "ready" | "error"
  error: Error | null
  bookKey: string | null
  coverUrl: string | undefined
  sectionFractions: number[]
  historyState: { canGoBack: boolean; canGoForward: boolean }
  annotations: Array<{
    value: string
    text?: string
    note?: string
    created?: string
    modified?: string
  }>
  bookmarks: Array<{ value: string; label: string; created: string }>
  onAnnotationDraw: (event: CustomEvent<FoliateDrawAnnotationEventDetail>) => void
  onOverlayCreate: (event: CustomEvent<{ index: number }>) => void
  onShowAnnotation: () => void
  onHistoryChange: () => void
  onLoad: (event: CustomEvent<{ doc: Document; index: number }>, root: HTMLElement) => void
  hydrateAnnotations: (annotations: any[], onlyIndex?: number) => Promise<void>
}

function onShowAnnotation() {}

export function useFoliateBook(
  options: UseFoliateBookOptions,
  preferencesRef: React.MutableRefObject<any>,
  callbacksRef: React.MutableRefObject<{
    onReady?: (snapshot: FoliateReaderSnapshot) => void
    onLocationChange?: (location: FoliateReaderLocation) => void
    onOpenExternalLink?: (href: string) => void
    onError?: (error: Error) => void
  }>,
  applyReaderPreferences: (view: FoliateView, theme: any, preferences: any) => void,
  getThemeDefinition: (themeId: string) => any,
  drawAnnotation: (event: CustomEvent<FoliateDrawAnnotationEventDetail>) => void,
  openSelectionToolbar: (action: {
    index: number
    range: Range
    cfi: string
    text: string
    x: number
    y: number
  }) => void,
  getOverlayPosition: (range: Range, container: HTMLElement) => { x: number; y: number },
  readSelectedRange: (selection: Selection | null) => Range | null,
  handleShortcut: (event: KeyboardEvent) => void,
  _setAnnotations: React.Dispatch<React.SetStateAction<any[]>>,
  _setBookmarks: React.Dispatch<React.SetStateAction<any[]>>,
): UseFoliateBookReturn {
  const { source, initialLocation } = options
  const stableSource = source
  const stableInitialLocation = initialLocation

  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle")
  const [snapshot, setSnapshot] = useState<FoliateReaderSnapshot | null>(null)
  const [location, setLocation] = useState<FoliateReaderLocation>({})
  const [error, setError] = useState<Error | null>(null)
  const [bookKey, setBookKey] = useState<string | null>(null)
  const [sectionFractions, setSectionFractions] = useState<number[]>([])
  const [historyState, setHistoryState] = useState({ canGoBack: false, canGoForward: false })
  const [annotations, setAnnotations] = useState<any[]>([])
  const [bookmarks, setBookmarks] = useState<any[]>([])

  const viewRef = useRef<FoliateView | null>(null)
  const coverUrlRef = useRef<string | undefined>(undefined)
  const snapshotRef = useRef<FoliateReaderSnapshot | null>(null)
  const locationRef = useRef<FoliateReaderLocation>({})
  const annotationsRef = useRef(annotations)

  const updateHistoryState = (view: FoliateView) => {
    setHistoryState({
      canGoBack: view.history.canGoBack,
      canGoForward: view.history.canGoForward,
    })
  }

  const hydrateAnnotations = async (nextAnnotations: any[], onlyIndex?: number) => {
    const view = viewRef.current
    if (!view) return
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

  const onAnnotationDraw = useCallback(
    (event: CustomEvent<FoliateDrawAnnotationEventDetail>) => {
      drawAnnotation(event)
    },
    [drawAnnotation],
  )

  const onOverlayCreate = (event: CustomEvent<{ index: number }>) => {
    hydrateAnnotations(annotationsRef.current, event.detail.index)
  }

  const onHistoryChange = () => {
    const view = viewRef.current
    if (view) updateHistoryState(view)
  }

  const onLoad = (event: CustomEvent<{ doc: Document; index: number }>, root: HTMLElement) => {
    event.detail.doc.addEventListener("pointerup", () => {
      const selection = event.detail.doc.getSelection()
      const range = readSelectedRange(selection)
      const container = root
      if (!range || !container) {
        return
      }
      const position = getOverlayPosition(range, container)
      const view = viewRef.current
      if (!view) return
      openSelectionToolbar({
        index: event.detail.index,
        range,
        cfi: view.getCFI(event.detail.index, range),
        text: selection?.toString().trim() ?? "",
        x: position.x,
        y: position.y,
      })
    })
    event.detail.doc.addEventListener("keydown", (keyEvent: KeyboardEvent) =>
      handleShortcut(keyEvent),
    )
  }

  useEffect(() => {
    annotationsRef.current = annotations
  }, [annotations])

  useEffect(() => {
    return () => {
      const generator = (viewRef.current as any)?.searchGenerator
      if (generator) {
        void generator.return?.(undefined)
      }
    }
  }, [])

  // Main book loading effect
  useEffect(() => {
    if (!stableSource) {
      snapshotRef.current = null
      locationRef.current = {}
      setBookKey(null)
      setStatus("idle")
      setSnapshot(null)
      setLocation({})
      setBookmarks([])
      setAnnotations([])
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

    const processBook = async () => {
      try {
        const module = await import("foliate-js/view.js")
        if (cancelled) return

        const view = new module.View()
        viewRef.current = view

        const relocateListener = (event: CustomEvent<FoliateRelocationDetail>) => {
          const nextLocation = buildLocationState(event.detail)
          locationRef.current = nextLocation
          setLocation(nextLocation)
          syncMarginals(view, snapshotRef.current, nextLocation)
          callbacksRef.current.onLocationChange?.(nextLocation)
        }

        const externalLinkListener = (event: CustomEvent<{ href: string }>) => {
          if (!callbacksRef.current.onOpenExternalLink) return
          event.preventDefault()
          callbacksRef.current.onOpenExternalLink(event.detail.href)
        }

        const historyListener = () => updateHistoryState(view)

        view.addEventListener("relocate", relocateListener)
        view.addEventListener("external-link", externalLinkListener)
        view.addEventListener("draw-annotation", onAnnotationDraw)
        view.addEventListener("create-overlay", onOverlayCreate)
        view.addEventListener("history-index-change", historyListener)

        await view.open(
          stableSource.kind === "file"
            ? stableSource.file
            : stableSource.kind === "blob"
              ? new File([stableSource.blob], stableSource.name, { type: stableSource.blob.type })
              : stableSource.kind === "url"
                ? stableSource.url
                : stableSource.book,
        )
        if (cancelled) {
          cleanupView(view, coverUrlRef.current)
          return
        }

        const nextBookKey = buildBookPersistenceKey(stableSource, view.book)
        const persisted = loadBookState(nextBookKey)

        const themeDefinition = getThemeDefinition(preferencesRef.current.themeId)
        applyReaderPreferences(view, themeDefinition, preferencesRef.current)
        const coverUrlPromise = resolveCoverUrl(view.book)

        await view.init({
          lastLocation: stableInitialLocation ?? persisted.lastLocation,
          showTextStart:
            stableInitialLocation === undefined && persisted.lastLocation === undefined,
        })

        const coverUrl = await coverUrlPromise
        if (cancelled) {
          releaseObjectUrl(coverUrl)
          cleanupView(view, coverUrlRef.current)
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

        setBookKey(nextBookKey)
        setBookmarks(persisted.bookmarks)
        setAnnotations(persisted.annotations)
        setSnapshot(nextSnapshot)
        setLocation(nextLocation)
        setStatus("ready")

        setSectionFractions(view.getSectionFractions())
        updateHistoryState(view)
        syncMarginals(view, nextSnapshot, nextLocation)
        await hydrateAnnotations(persisted.annotations)
        callbacksRef.current.onReady?.(nextSnapshot)
        callbacksRef.current.onLocationChange?.(nextLocation)
      } catch (caughtError) {
        if (cancelled) return
        cleanupView(viewRef.current, coverUrlRef.current)
        viewRef.current = null
        coverUrlRef.current = undefined
        const nextError = createError(caughtError)
        setError(nextError)
        setStatus("error")
        callbacksRef.current.onError?.(nextError)
      }
    }

    processBook()

    return () => {
      cancelled = true
      cleanupView(viewRef.current, coverUrlRef.current)
      viewRef.current = null
      coverUrlRef.current = undefined
    }
  }, [
    applyReaderPreferences,
    callbacksRef,
    drawAnnotation,
    getOverlayPosition,
    getThemeDefinition,
    handleShortcut,
    onAnnotationDraw,
    openSelectionToolbar,
    preferencesRef,
    readSelectedRange,
    stableInitialLocation,
    stableSource,
  ])

  return {
    view: viewRef.current,
    snapshot,
    location,
    status,
    error,
    bookKey,
    coverUrl: coverUrlRef.current,
    sectionFractions,
    historyState,
    annotations,
    bookmarks,
    onAnnotationDraw,
    onOverlayCreate,
    onShowAnnotation,
    onHistoryChange,
    onLoad,
    hydrateAnnotations,
  }
}
