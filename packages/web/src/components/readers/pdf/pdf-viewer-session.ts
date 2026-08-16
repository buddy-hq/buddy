import { AnnotationEditorType, AnnotationMode, type PDFDocumentProxy } from "pdfjs-dist"
import {
  EventBus,
  LinkTarget,
  PDFLinkService,
  PDFViewer,
  ScrollMode,
  SpreadMode,
} from "pdfjs-dist/web/pdf_viewer.mjs"
import type { PdfPositionAnchor, PdfTextAnchor, ReaderRelocation } from "@buddy/reader-contract"
import { findPdfTextMatches, type PdfTextMatchOptions } from "./pdf-search"
import { pdfDocumentFingerprint } from "./pdf-document-identity"
import { readPdfPageViewGeometry, type PdfPageViewGeometry } from "./pdf-geometry"
import {
  pdfCurrentPassageText,
  pdfTextAnchorFromOffsets,
  readPdfPageText,
  repairPdfTextAnchor,
  type PdfPageText,
} from "./pdf-page-text"
import { loadPdfDocument, resolvePdfJsRuntimeUrls, type LoadedPdfDocument } from "./pdfjs-runtime"
import {
  PDF_PAGE_TURN_NEXT,
  pdfModeAfterViewerScaleChange,
  resolvePdfWheelPageTurn,
} from "./pdf-viewer-mode"
import { pdfLocationLabel } from "./pdf-location-label"
import type {
  PdfReaderMode,
  ReaderMetadataRow,
  ReaderNavigationItem,
  ReaderSearchResult,
  ReaderSearchScope,
  ReaderSnapshot,
  ReaderSource,
} from "../reader-types"
import { READER_SEARCH_SCOPE_SECTION } from "../reader-types"

const PDF_PAGE_NUMBER_OFFSET = 1
const PDF_WHEEL_GESTURE_IDLE_THRESHOLD_MS = 180
const PDFJS_CONTINUOUS_PAGE_LIMIT = 10_000
const PDFJS_PAGE_WIDTH_SCALE = "page-width"
const PDFJS_PAGE_FIT_SCALE = "page-fit"
const PDFJS_EVENT_PAGE_CHANGING = "pagechanging"
const PDFJS_EVENT_PAGES_INIT = "pagesinit"
const PDFJS_EVENT_PAGE_RENDERED = "pagerendered"
const PDFJS_EVENT_TEXT_LAYER_RENDERED = "textlayerrendered"
const PDFJS_EVENT_SCALE_CHANGING = "scalechanging"
const PDFJS_OUTLINE_ID_PREFIX = "pdf-outline:"
const PDFJS_PAGE_ID_PREFIX = "pdf-page:"
const PDFJS_EXTERNAL_LINK_REL = "noopener noreferrer nofollow"
const PDFJS_EXTERNAL_LINK_TARGET = "_blank"
const PDFJS_EXTERNAL_LINK_FEATURES = "noopener,noreferrer"
const PDFJS_MAX_CANVAS_PIXELS = 32 * 1_024 * 1_024
const PDF_SEARCH_CONTEXT_LENGTH = 96
const PDF_SEARCH_RESULT_LIMIT = 20_000
const PDF_PAGE_TEXT_CACHE_LIMIT = 128
const PDF_METADATA_KEYS = [
  ["Title", "Title"],
  ["Author", "Author"],
  ["Subject", "Subject"],
  ["Keywords", "Keywords"],
  ["Creator", "Creator"],
  ["Producer", "Producer"],
] as const

type PdfViewerSessionCallbacks = {
  onReady: (snapshot: ReaderSnapshot, fingerprint: string | undefined) => void
  onLocationChange: (location: ReaderRelocation) => void
  onScaleChange: (scale: number, presetValue: string | undefined) => void
  onPageRendered: (pageIndex: number) => void
  onTextLayerRendered: (pageIndex: number) => void
  onPassword: (updatePassword: (password: string) => void, reason: number) => void
  onLayoutFallback: (message: string | null) => void
  onExternalLink?: (href: string) => boolean
  onError: (error: Error) => void
}

type PdfNavigationTarget =
  | { kind: "destination"; destination: string | unknown[] }
  | { kind: "page"; pageNumber: number }
  | { kind: "external"; href: string }

type PdfViewerEvent = {
  pageNumber?: number
  pageLabel?: string
  scale?: number
  presetValue?: string
}

type PdfOutlineValue = {
  title: string
  destination?: string | unknown[]
  href?: string
  items: PdfOutlineValue[]
}

type PdfOutlineLocation = {
  label: string
  pageIndex: number
  order: number
}

type PdfPageReference = {
  num: number
  gen: number
}

export type PdfSearchRequest = PdfTextMatchOptions & {
  query: string
  scope: ReaderSearchScope
}

export type PdfSearchProgress = {
  completedPages: number
  totalPages: number
}

export type PdfViewerSessionOptions = {
  container: HTMLDivElement
  viewerElement: HTMLDivElement
  source: ReaderSource
  mode: PdfReaderMode
  initialLocation?: PdfPositionAnchor
  callbacks: PdfViewerSessionCallbacks
}

type PdfWheelPageTurnGesture = {
  direction: ReturnType<typeof resolvePdfWheelPageTurn>
  lastEventAt: number | undefined
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function readPdfViewerEvent(value: unknown): PdfViewerEvent {
  if (!isObjectRecord(value)) return {}
  const pageNumber = readFiniteNumber(value.pageNumber)
  const pageLabel = typeof value.pageLabel === "string" ? value.pageLabel : undefined
  const scale = readFiniteNumber(value.scale)
  const presetValue = typeof value.presetValue === "string" ? value.presetValue : undefined
  return {
    ...(pageNumber !== undefined ? { pageNumber } : {}),
    ...(pageLabel !== undefined ? { pageLabel } : {}),
    ...(scale !== undefined ? { scale } : {}),
    ...(presetValue !== undefined ? { presetValue } : {}),
  }
}

function readCoordinatePair(value: unknown): readonly [number, number] | undefined {
  if (!Array.isArray(value) || value.length < 2) return undefined
  const x = readFiniteNumber(value[0])
  const y = readFiniteNumber(value[1])
  return x === undefined || y === undefined ? undefined : [x, y]
}

function readCropBox(value: unknown): readonly [number, number, number, number] | undefined {
  if (!Array.isArray(value) || value.length < 4) return undefined
  const x1 = readFiniteNumber(value[0])
  const y1 = readFiniteNumber(value[1])
  const x2 = readFiniteNumber(value[2])
  const y2 = readFiniteNumber(value[3])
  if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) {
    return undefined
  }
  if (x2 <= x1 || y2 <= y1) return undefined
  return [x1, y1, x2, y2]
}

function readPdfReference(value: unknown): PdfPageReference | undefined {
  if (!isObjectRecord(value)) return undefined
  const num = readFiniteNumber(value.num)
  const gen = readFiniteNumber(value.gen)
  if (num === undefined || gen === undefined || !Number.isInteger(num) || !Number.isInteger(gen)) {
    return undefined
  }
  return { num, gen }
}

function clampRatio(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function pageIndexFromViewerEvent(
  pageNumber: number | undefined,
  pagesCount: number,
): number | undefined {
  if (
    pageNumber === undefined ||
    !Number.isInteger(pageNumber) ||
    pageNumber < PDF_PAGE_NUMBER_OFFSET ||
    pageNumber > pagesCount
  ) {
    return undefined
  }
  return pageNumber - PDF_PAGE_NUMBER_OFFSET
}

function sourceName(source: ReaderSource): string {
  if (source.kind === "file") return source.file.name
  if (source.kind === "blob") return source.name
  if (source.name) return source.name
  try {
    const url = new URL(source.url)
    return url.pathname.split("/").findLast((part) => part.length > 0) ?? "PDF document"
  } catch {
    return "PDF document"
  }
}

function readInfoString(info: unknown, key: string): string | undefined {
  if (!isObjectRecord(info)) return undefined
  const value = info[key]
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function readOutline(value: unknown): PdfOutlineValue[] {
  if (!Array.isArray(value)) return []
  const items: PdfOutlineValue[] = []
  for (const entry of value) {
    if (!isObjectRecord(entry) || typeof entry.title !== "string") continue
    const title = entry.title.trim()
    if (!title) continue
    const destination =
      typeof entry.dest === "string" || Array.isArray(entry.dest) ? entry.dest : undefined
    const href = typeof entry.url === "string" && entry.url ? entry.url : undefined
    items.push({
      title,
      ...(destination ? { destination } : {}),
      ...(href ? { href } : {}),
      items: readOutline(entry.items),
    })
  }
  return items
}

function abortError(): DOMException {
  return new DOMException("PDF operation was cancelled.", "AbortError")
}

function clearViewerDocument(viewer: unknown): void {
  if (!isObjectRecord(viewer)) return
  const setDocument = viewer.setDocument
  if (typeof setDocument === "function") setDocument.call(viewer, null)
}

function metadataRows(info: unknown, fingerprint: string | undefined): ReaderMetadataRow[] {
  const rows: ReaderMetadataRow[] = []
  for (const [key, label] of PDF_METADATA_KEYS) {
    const value = readInfoString(info, key)
    if (value) rows.push({ key: key.toLowerCase(), label, value })
  }
  if (fingerprint) {
    rows.push({ key: "fingerprint", label: "Document fingerprint", value: fingerprint })
  }
  return rows
}

export class PdfViewerSession {
  readonly #container: HTMLDivElement
  readonly #viewerElement: HTMLDivElement
  readonly #source: ReaderSource
  readonly #callbacks: PdfViewerSessionCallbacks
  readonly #lifecycle = new AbortController()
  readonly #opening: { task: Promise<void> }
  readonly #navigationTargets = new Map<string, PdfNavigationTarget>()
  readonly #pageTextCache = new Map<number, PdfPageText>()
  readonly #pageTextTasks = new Map<number, Promise<PdfPageText>>()
  #outlineLocations: PdfOutlineLocation[] = []
  #loaded: LoadedPdfDocument | null = null
  #linkService: PDFLinkService | null = null
  #viewer: PDFViewer | null = null
  #mode: PdfReaderMode
  #pageLabels: string[] | null = null
  #currentPageIndex = 0
  #scrollFrame: number | null = null
  #resizeFrame: number | null = null
  #locationEmissionId = 0
  #navigationRequestId = 0
  #destroyed = false
  #ready = false
  #resizeObserver: ResizeObserver | null = null
  #wheelPageTurnGesture: PdfWheelPageTurnGesture = {
    direction: undefined,
    lastEventAt: undefined,
  }

  constructor(options: PdfViewerSessionOptions) {
    this.#container = options.container
    this.#viewerElement = options.viewerElement
    this.#source = options.source
    this.#mode = options.mode
    this.#callbacks = options.callbacks
    this.#installDomListeners()
    this.#opening = {
      task: this.#open(options.initialLocation).catch((error: unknown) => {
        if (this.#lifecycle.signal.aborted) return
        this.#callbacks.onError(
          error instanceof Error ? error : new Error("The PDF reader could not open this file."),
        )
      }),
    }
  }

  get document(): PDFDocumentProxy | null {
    return this.#loaded?.document ?? null
  }

  get currentScale(): number {
    return this.#viewer?.currentScale ?? this.#mode.scale ?? 1
  }

  get mode(): PdfReaderMode {
    return this.#mode
  }

  get pagesCount(): number {
    return this.#loaded?.document.numPages ?? 0
  }

  getPageGeometry(pageIndex: number): PdfPageViewGeometry | undefined {
    return readPdfPageViewGeometry(this.#viewer?.getPageView(pageIndex))
  }

  getPageLabel(pageIndex: number): string {
    return this.#pageLabel(pageIndex)
  }

  getTocLabel(pageIndex: number): string | undefined {
    return this.#outlineLocationAt(pageIndex)?.label
  }

  async #open(initialLocation: PdfPositionAnchor | undefined): Promise<void> {
    try {
      const loaded = await loadPdfDocument({
        source: this.#source,
        signal: this.#lifecycle.signal,
        onPassword: this.#callbacks.onPassword,
      })
      if (this.#lifecycle.signal.aborted) {
        await loaded.loadingTask.destroy()
        return
      }
      this.#loaded = loaded
      this.#createViewer(loaded.document)
      const [metadata, pageLabels, outline] = await Promise.all([
        loaded.document.getMetadata().catch(() => ({ info: {}, metadata: null })),
        loaded.document.getPageLabels().catch(() => null),
        loaded.document.getOutline().catch(() => []),
      ])
      if (this.#lifecycle.signal.aborted) return
      this.#pageLabels = pageLabels
      const fingerprint = pdfDocumentFingerprint(loaded.document.fingerprints)
      const navigation = await this.#buildNavigation(
        loaded.document,
        readOutline(outline),
        pageLabels,
      )
      if (this.#lifecycle.signal.aborted) return
      const title = readInfoString(metadata.info, "Title") ?? sourceName(this.#source)
      const author = readInfoString(metadata.info, "Author") ?? "Unknown author"
      const snapshot: ReaderSnapshot = {
        engine: "pdf",
        capabilities: {
          textFlow: false,
          pageLayouts: true,
          search: true,
          outline: navigation.toc.length > 0,
          pageLabels: pageLabels !== null,
          textSelection: true,
          annotations: true,
        },
        title,
        author,
        formatLabel: "PDF",
        isFixedLayout: true,
        toc: navigation.toc,
        pageList: navigation.pageList,
        landmarks: [],
        metadata: metadataRows(metadata.info, fingerprint),
        pageCount: loaded.document.numPages,
        fileName: sourceName(this.#source),
      }
      this.#callbacks.onReady(snapshot, fingerprint)
      if (this.#ready) this.#emitLocation()
      if (initialLocation) {
        await this.goTo(initialLocation)
      }
    } catch (error) {
      if (this.#lifecycle.signal.aborted) return
      throw error
    }
  }

  #createViewer(document: PDFDocumentProxy): void {
    const runtimeUrls = resolvePdfJsRuntimeUrls()
    const eventBus = new EventBus()
    const linkService = new PDFLinkService({
      eventBus,
      externalLinkTarget: LinkTarget.BLANK,
      externalLinkRel: PDFJS_EXTERNAL_LINK_REL,
      ignoreDestinationZoom: true,
    })
    const viewerOptions = {
      container: this.#container,
      viewer: this.#viewerElement,
      eventBus,
      linkService,
      annotationMode: AnnotationMode.ENABLE,
      annotationEditorMode: AnnotationEditorType.NONE,
      imageResourcesPath: runtimeUrls.imageResourcesPath,
      maxCanvasPixels: PDFJS_MAX_CANVAS_PIXELS,
      enableDetailCanvas: true,
      enableOptimizedPartialRendering: true,
      enableHWA: true,
      supportsPinchToZoom: true,
      abortSignal: this.#lifecycle.signal,
    }
    const viewer = new PDFViewer(viewerOptions)
    linkService.setViewer(viewer)
    linkService.setDocument(document)
    viewer.setDocument(document)
    this.#linkService = linkService
    this.#viewer = viewer
    this.#installViewerListeners(eventBus)
    this.#resizeObserver = new ResizeObserver(() => this.#handleResize())
    this.#resizeObserver.observe(this.#container)
  }

  #installViewerListeners(eventBus: EventBus): void {
    const signal = this.#lifecycle.signal
    eventBus.on(
      PDFJS_EVENT_PAGES_INIT,
      () => {
        if (signal.aborted) return
        this.#ready = true
        this.#applyMode(this.#mode)
        this.#emitLocation()
      },
      { signal },
    )
    eventBus.on(
      PDFJS_EVENT_PAGE_CHANGING,
      (value: unknown) => {
        const event = readPdfViewerEvent(value)
        const pageIndex = pageIndexFromViewerEvent(event.pageNumber, this.pagesCount)
        if (pageIndex === undefined) return
        this.#currentPageIndex = pageIndex
        this.#emitLocation()
      },
      { signal },
    )
    eventBus.on(
      PDFJS_EVENT_SCALE_CHANGING,
      (value: unknown) => {
        const event = readPdfViewerEvent(value)
        if (event.scale !== undefined) {
          this.#mode = pdfModeAfterViewerScaleChange(this.#mode, event.scale, event.presetValue)
          this.#callbacks.onScaleChange(event.scale, event.presetValue)
        }
      },
      { signal },
    )
    eventBus.on(
      PDFJS_EVENT_PAGE_RENDERED,
      (value: unknown) => {
        const event = readPdfViewerEvent(value)
        const pageIndex = pageIndexFromViewerEvent(event.pageNumber, this.pagesCount)
        if (pageIndex !== undefined) this.#callbacks.onPageRendered(pageIndex)
      },
      { signal },
    )
    eventBus.on(
      PDFJS_EVENT_TEXT_LAYER_RENDERED,
      (value: unknown) => {
        const event = readPdfViewerEvent(value)
        const pageIndex = pageIndexFromViewerEvent(event.pageNumber, this.pagesCount)
        if (pageIndex !== undefined) this.#callbacks.onTextLayerRendered(pageIndex)
      },
      { signal },
    )
  }

  #installDomListeners(): void {
    const signal = this.#lifecycle.signal
    this.#container.addEventListener(
      "scroll",
      () => {
        if (this.#scrollFrame !== null) return
        this.#scrollFrame = requestAnimationFrame(() => {
          this.#scrollFrame = null
          this.#emitLocation()
        })
      },
      { passive: true, signal },
    )
    this.#container.addEventListener(
      "wheel",
      (event) => {
        const viewer = this.#viewer
        if (!viewer) return
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault()
          const bounds = this.#container.getBoundingClientRect()
          viewer.updateScale({
            steps: event.deltaY < 0 ? 1 : -1,
            origin: [event.clientX - bounds.left, event.clientY - bounds.top],
          })
          return
        }

        const direction = resolvePdfWheelPageTurn({
          isPageMode: viewer.scrollMode === ScrollMode.PAGE,
          deltaX: event.deltaX,
          deltaY: event.deltaY,
          scrollTop: this.#container.scrollTop,
          scrollHeight: this.#container.scrollHeight,
          clientHeight: this.#container.clientHeight,
        })
        if (direction === undefined || event.shiftKey) {
          this.#wheelPageTurnGesture = { direction: undefined, lastEventAt: undefined }
          return
        }

        event.preventDefault()
        const previousGesture = this.#wheelPageTurnGesture
        const isMomentumContinuation =
          previousGesture.direction === direction &&
          previousGesture.lastEventAt !== undefined &&
          event.timeStamp - previousGesture.lastEventAt <= PDF_WHEEL_GESTURE_IDLE_THRESHOLD_MS
        this.#wheelPageTurnGesture = { direction, lastEventAt: event.timeStamp }
        if (isMomentumContinuation) return
        if (direction === PDF_PAGE_TURN_NEXT) viewer.nextPage()
        else viewer.previousPage()
      },
      { passive: false, signal },
    )
    this.#container.addEventListener(
      "click",
      (event) => {
        const target = event.target
        if (!(target instanceof Element)) return
        const link = target.closest<HTMLAnchorElement>("a[href]")
        const rawHref = link?.getAttribute("href")
        if (!link || !rawHref || rawHref.startsWith("#")) return
        event.preventDefault()
        this.#openExternalLink(link.href)
      },
      { signal },
    )
  }

  async #destinationPageIndex(
    document: PDFDocumentProxy,
    destination: string | unknown[],
  ): Promise<number | undefined> {
    const explicitDestination: unknown =
      typeof destination === "string"
        ? await document.getDestination(destination).catch(() => null)
        : destination
    if (!Array.isArray(explicitDestination)) return undefined
    const reference: unknown = explicitDestination[0]
    if (Number.isInteger(reference) && typeof reference === "number") {
      return reference >= 0 && reference < document.numPages ? reference : undefined
    }
    const pageReference = readPdfReference(reference)
    if (!pageReference) return undefined
    const cachedPageNumber = document.cachedPageNumber(pageReference)
    if (cachedPageNumber !== null) return cachedPageNumber - PDF_PAGE_NUMBER_OFFSET
    return document.getPageIndex(pageReference).catch(() => undefined)
  }

  async #buildNavigation(
    document: PDFDocumentProxy,
    outline: PdfOutlineValue[],
    pageLabels: string[] | null,
  ): Promise<{ toc: ReaderNavigationItem[]; pageList: ReaderNavigationItem[] }> {
    this.#navigationTargets.clear()
    this.#outlineLocations = []
    let outlineIndex = 0
    const buildItems = async (values: PdfOutlineValue[]): Promise<ReaderNavigationItem[]> =>
      Promise.all(
        values.map(async (value) => {
          const id = `${PDFJS_OUTLINE_ID_PREFIX}${outlineIndex}`
          const order = outlineIndex
          outlineIndex += 1
          if (value.destination) {
            this.#navigationTargets.set(id, {
              kind: "destination",
              destination: value.destination,
            })
          } else if (value.href) {
            this.#navigationTargets.set(id, { kind: "external", href: value.href })
          }
          const [pageIndex, subitems] = await Promise.all([
            value.destination
              ? this.#destinationPageIndex(document, value.destination)
              : Promise.resolve(undefined),
            buildItems(value.items),
          ])
          if (pageIndex !== undefined) {
            this.#outlineLocations.push({ label: value.title, pageIndex, order })
          }
          return { id, label: value.title, subitems }
        }),
      )
    const pageList = Array.from({ length: this.pagesCount }, (_, pageIndex) => {
      const pageNumber = pageIndex + PDF_PAGE_NUMBER_OFFSET
      const id = `${PDFJS_PAGE_ID_PREFIX}${pageIndex}`
      this.#navigationTargets.set(id, { kind: "page", pageNumber })
      return {
        id,
        label: pageLabels?.[pageIndex] ?? String(pageNumber),
        subitems: [],
      }
    })
    const toc = await buildItems(outline)
    this.#outlineLocations.sort(
      (left, right) => left.pageIndex - right.pageIndex || left.order - right.order,
    )
    return { toc, pageList }
  }

  #handleResize(): void {
    if (this.#resizeFrame !== null) return
    this.#resizeFrame = requestAnimationFrame(() => {
      this.#resizeFrame = null
      this.#applyResize()
    })
  }

  #applyResize(): void {
    if (!this.#ready) return
    const position = this.getCurrentPosition()
    if (this.#mode.scaleMode === "fit-width") {
      if (this.#viewer) this.#viewer.currentScaleValue = PDFJS_PAGE_WIDTH_SCALE
    } else if (this.#mode.scaleMode === "fit-page") {
      if (this.#viewer) this.#viewer.currentScaleValue = PDFJS_PAGE_FIT_SCALE
    }
    if (position) queueMicrotask(() => void this.goTo(position))
  }

  #applyMode(mode: PdfReaderMode): void {
    const viewer = this.#viewer
    if (!viewer) return
    let effectiveLayout = mode.layout
    if (this.pagesCount > PDFJS_CONTINUOUS_PAGE_LIMIT && mode.layout !== "single-page") {
      effectiveLayout = "single-page"
      this.#callbacks.onLayoutFallback(
        `This PDF has more than ${PDFJS_CONTINUOUS_PAGE_LIMIT.toLocaleString()} pages, so PDF.js requires single-page mode.`,
      )
    } else {
      this.#callbacks.onLayoutFallback(null)
    }
    if (effectiveLayout === "single-page") {
      viewer.scrollMode = ScrollMode.PAGE
      viewer.spreadMode = SpreadMode.NONE
    } else if (effectiveLayout === "two-up") {
      viewer.scrollMode = ScrollMode.VERTICAL
      viewer.spreadMode = SpreadMode.ODD
    } else {
      viewer.scrollMode = ScrollMode.VERTICAL
      viewer.spreadMode = SpreadMode.NONE
    }
    viewer.pagesRotation = mode.rotation
    if (mode.scaleMode === "fit-width") {
      viewer.currentScaleValue = PDFJS_PAGE_WIDTH_SCALE
    } else if (mode.scaleMode === "fit-page") {
      viewer.currentScaleValue = PDFJS_PAGE_FIT_SCALE
    } else if (mode.scale !== undefined) {
      viewer.currentScale = mode.scale
    }
  }

  #pageLabel(pageIndex: number): string {
    return this.#pageLabels?.[pageIndex] ?? String(pageIndex + PDF_PAGE_NUMBER_OFFSET)
  }

  #outlineLocationAt(pageIndex: number): PdfOutlineLocation | undefined {
    return this.#outlineLocations.findLast((location) => location.pageIndex <= pageIndex)
  }

  #sectionPageIndexes(): number[] {
    const currentPageIndex = this.getCurrentPosition()?.pageIndex ?? this.#currentPageIndex
    const currentOutline = this.#outlineLocationAt(currentPageIndex)
    if (!currentOutline) return [currentPageIndex]
    const nextOutline = this.#outlineLocations.find(
      (location) => location.pageIndex > currentOutline.pageIndex,
    )
    const endPageIndex = Math.min(
      this.pagesCount - 1,
      (nextOutline?.pageIndex ?? this.pagesCount) - PDF_PAGE_NUMBER_OFFSET,
    )
    return Array.from(
      { length: endPageIndex - currentOutline.pageIndex + PDF_PAGE_NUMBER_OFFSET },
      (_, offset) => currentOutline.pageIndex + offset,
    )
  }

  #emitLocation(): void {
    const anchor = this.getCurrentPosition()
    if (!anchor) return
    const resolvedLabel = this.#pageLabel(anchor.pageIndex)
    const tocLabel = this.#outlineLocationAt(anchor.pageIndex)?.label
    const fraction = this.pagesCount
      ? clampRatio((anchor.pageIndex + anchor.yRatio) / this.pagesCount)
      : undefined
    const base: ReaderRelocation = {
      anchor,
      ...(fraction !== undefined ? { fraction } : {}),
      ...(tocLabel ? { tocLabel } : {}),
      pageLabel: resolvedLabel,
      locationLabel: pdfLocationLabel({
        pageIndex: anchor.pageIndex,
        pageCount: this.pagesCount,
        pageLabel: resolvedLabel,
      }),
    }
    const cachedPageText = this.#readCachedPageText(anchor.pageIndex)
    const currentPassageText = cachedPageText
      ? pdfCurrentPassageText(cachedPageText, anchor)
      : undefined
    const emissionId = this.#locationEmissionId + 1
    this.#locationEmissionId = emissionId
    this.#callbacks.onLocationChange(currentPassageText ? { ...base, currentPassageText } : base)
    if (cachedPageText === undefined) {
      const pageIndex = anchor.pageIndex
      void this.#getPageText(pageIndex, this.#lifecycle.signal)
        .then((pageText) => {
          if (
            this.#lifecycle.signal.aborted ||
            emissionId !== this.#locationEmissionId ||
            pageIndex !== this.#currentPageIndex ||
            !pageText.text
          ) {
            return
          }
          const passage = pdfCurrentPassageText(pageText, anchor)
          this.#callbacks.onLocationChange(
            passage ? { ...base, currentPassageText: passage } : base,
          )
        })
        .catch(() => undefined)
    }
  }

  getCurrentPosition(): PdfPositionAnchor | undefined {
    const viewer = this.#viewer
    if (!viewer || this.pagesCount === 0) return undefined
    const pageIndex = Math.max(
      0,
      Math.min(this.pagesCount - 1, viewer.currentPageNumber - PDF_PAGE_NUMBER_OFFSET),
    )
    this.#currentPageIndex = pageIndex
    const geometry = this.getPageGeometry(pageIndex)
    if (!geometry) {
      return { kind: "pdf-position", pageIndex, xRatio: 0, yRatio: 0 }
    }
    const containerBounds = this.#container.getBoundingClientRect()
    const surfaceBounds = geometry.textLayerDiv.getBoundingClientRect()
    const viewportX = Math.max(
      0,
      Math.min(surfaceBounds.width, containerBounds.left - surfaceBounds.left),
    )
    const viewportY = Math.max(
      0,
      Math.min(surfaceBounds.height, containerBounds.top - surfaceBounds.top),
    )
    const pdfPoint = readCoordinatePair(geometry.viewport.convertToPdfPoint(viewportX, viewportY))
    if (!pdfPoint) return { kind: "pdf-position", pageIndex, xRatio: 0, yRatio: 0 }
    const { xMin, yMin, xMax, yMax } = geometry.cropBox
    return {
      kind: "pdf-position",
      pageIndex,
      xRatio: clampRatio((pdfPoint[0] - xMin) / (xMax - xMin)),
      yRatio: clampRatio((yMax - pdfPoint[1]) / (yMax - yMin)),
    }
  }

  async goTo(anchor: PdfPositionAnchor): Promise<void> {
    const linkService = this.#linkService
    const document = this.document
    if (!linkService || !document || this.#lifecycle.signal.aborted) return
    const requestId = this.#navigationRequestId + 1
    this.#navigationRequestId = requestId
    await this.#viewer?.firstPagePromise
    if (this.#lifecycle.signal.aborted || requestId !== this.#navigationRequestId) return
    const pageIndex = Math.max(0, Math.min(document.numPages - 1, anchor.pageIndex))
    const page = await document.getPage(pageIndex + PDF_PAGE_NUMBER_OFFSET)
    if (this.#lifecycle.signal.aborted || requestId !== this.#navigationRequestId) return
    const cropBox = readCropBox(page.view)
    if (!cropBox) {
      linkService.goToPage(pageIndex + PDF_PAGE_NUMBER_OFFSET)
      return
    }
    const [xMin, yMin, xMax, yMax] = cropBox
    const x = xMin + clampRatio(anchor.xRatio) * (xMax - xMin)
    const y = yMax - clampRatio(anchor.yRatio) * (yMax - yMin)
    linkService.goToXY(pageIndex + PDF_PAGE_NUMBER_OFFSET, x, y, {
      allowNegativeOffset: true,
    })
  }

  async navigate(id: string): Promise<void> {
    const target = this.#navigationTargets.get(id)
    if (!target || !this.#linkService) return
    if (target.kind === "page") {
      this.#linkService.goToPage(target.pageNumber)
      return
    }
    if (target.kind === "external") {
      this.#openExternalLink(target.href)
      return
    }
    await this.#linkService.goToDestination(target.destination)
  }

  nextPage(): boolean {
    return this.#viewer?.nextPage() ?? false
  }

  previousPage(): boolean {
    return this.#viewer?.previousPage() ?? false
  }

  goToPage(value: number | string): void {
    this.#linkService?.goToPage(value)
  }

  setMode(mode: PdfReaderMode): void {
    const anchor = this.getCurrentPosition()
    this.#mode = mode
    this.#applyMode(mode)
    if (anchor) queueMicrotask(() => void this.goTo(anchor))
  }

  restoreView(mode: PdfReaderMode, anchor: PdfPositionAnchor | undefined): void {
    this.#mode = mode
    this.#applyMode(mode)
    if (anchor) void this.goTo(anchor)
  }

  zoomIn(origin?: readonly [number, number]): void {
    this.#viewer?.updateScale({
      steps: 1,
      ...(origin ? { origin: [...origin] } : {}),
    })
  }

  zoomOut(origin?: readonly [number, number]): void {
    this.#viewer?.updateScale({
      steps: -1,
      ...(origin ? { origin: [...origin] } : {}),
    })
  }

  setCustomScale(scale: number): void {
    if (this.#viewer) this.#viewer.currentScale = scale
  }

  async getPageText(pageIndex: number, signal: AbortSignal): Promise<string> {
    return (await this.#getPageText(pageIndex, signal)).text
  }

  async #getPageText(pageIndex: number, signal: AbortSignal): Promise<PdfPageText> {
    const cached = this.#readCachedPageText(pageIndex)
    if (cached !== undefined) return cached
    const document = this.document
    if (!document || signal.aborted) throw abortError()
    const existingTask = this.#pageTextTasks.get(pageIndex)
    const task = existingTask ?? this.#loadPageText(pageIndex, document)
    if (!existingTask) this.#pageTextTasks.set(pageIndex, task)
    const text = await task
    if (signal.aborted) throw abortError()
    return text
  }

  async #loadPageText(pageIndex: number, document: PDFDocumentProxy): Promise<PdfPageText> {
    try {
      const page = await document.getPage(pageIndex + PDF_PAGE_NUMBER_OFFSET)
      if (this.#lifecycle.signal.aborted) throw abortError()
      const content: unknown = await page.getTextContent({ disableNormalization: true })
      if (this.#lifecycle.signal.aborted) throw abortError()
      const cropBoxValues = readCropBox(page.view)
      const cropBox = cropBoxValues
        ? {
            xMin: cropBoxValues[0],
            yMin: cropBoxValues[1],
            xMax: cropBoxValues[2],
            yMax: cropBoxValues[3],
          }
        : { xMin: 0, yMin: 0, xMax: 1, yMax: 1 }
      const pageText = readPdfPageText(content, cropBox)
      this.#cachePageText(pageIndex, pageText)
      return pageText
    } finally {
      this.#pageTextTasks.delete(pageIndex)
    }
  }

  #readCachedPageText(pageIndex: number): PdfPageText | undefined {
    const pageText = this.#pageTextCache.get(pageIndex)
    if (pageText === undefined) return undefined
    this.#pageTextCache.delete(pageIndex)
    this.#pageTextCache.set(pageIndex, pageText)
    return pageText
  }

  #cachePageText(pageIndex: number, pageText: PdfPageText): void {
    this.#pageTextCache.delete(pageIndex)
    this.#pageTextCache.set(pageIndex, pageText)
    if (this.#pageTextCache.size <= PDF_PAGE_TEXT_CACHE_LIMIT) return
    const oldestPageIndex = this.#pageTextCache.keys().next().value
    if (oldestPageIndex !== undefined) this.#pageTextCache.delete(oldestPageIndex)
  }

  async search(
    request: PdfSearchRequest,
    signal: AbortSignal,
    onProgress?: (progress: PdfSearchProgress) => void,
    onResults?: (results: ReaderSearchResult[]) => void,
  ): Promise<ReaderSearchResult[]> {
    if (!request.query.trim() || !this.document) return []
    const results: ReaderSearchResult[] = []
    const pageIndexes =
      request.scope === READER_SEARCH_SCOPE_SECTION
        ? this.#sectionPageIndexes()
        : Array.from({ length: this.pagesCount }, (_, pageIndex) => pageIndex)
    for (
      let searchPageIndex = 0;
      searchPageIndex < pageIndexes.length && results.length < PDF_SEARCH_RESULT_LIMIT;
      searchPageIndex += 1
    ) {
      if (signal.aborted) throw abortError()
      const pageIndex = pageIndexes[searchPageIndex]
      if (pageIndex === undefined) continue
      let pageText: PdfPageText
      try {
        pageText = await this.#getPageText(pageIndex, signal)
      } catch {
        if (signal.aborted || this.#lifecycle.signal.aborted) throw abortError()
        onProgress?.({
          completedPages: searchPageIndex + PDF_PAGE_NUMBER_OFFSET,
          totalPages: pageIndexes.length,
        })
        continue
      }
      const matches = findPdfTextMatches(pageText.text, request.query, request)
      const pageResults: ReaderSearchResult[] = []
      for (const match of matches) {
        if (results.length >= PDF_SEARCH_RESULT_LIMIT) break
        const quote = {
          exact: match.match,
          ...(match.pre ? { prefix: match.pre.slice(-PDF_SEARCH_CONTEXT_LENGTH) } : {}),
          ...(match.post ? { suffix: match.post.slice(0, PDF_SEARCH_CONTEXT_LENGTH) } : {}),
        }
        const anchor =
          pdfTextAnchorFromOffsets({
            pageIndex,
            pageText,
            startOffset: match.startOffset,
            endOffset: match.endOffset,
            quote,
          }) ??
          ({
            kind: "pdf-text",
            segments: [
              {
                pageIndex,
                quads: [],
                startOffset: match.startOffset,
                endOffset: match.endOffset,
              },
            ],
            quote,
          } satisfies PdfTextAnchor)
        const id = `pdf-search:${pageIndex}:${match.startOffset}:${match.endOffset}`
        const result: ReaderSearchResult = {
          id,
          label: `Page ${this.#pageLabel(pageIndex)}`,
          anchor,
          excerpt: { pre: match.pre, match: match.match, post: match.post },
        }
        results.push(result)
        pageResults.push(result)
      }
      if (pageResults.length > 0) onResults?.(pageResults)
      onProgress?.({
        completedPages: searchPageIndex + PDF_PAGE_NUMBER_OFFSET,
        totalPages: pageIndexes.length,
      })
    }
    return results
  }

  async showSearchResult(result: ReaderSearchResult): Promise<void> {
    if (result.anchor.kind !== "pdf-text") return
    const position = await this.resolveTextAnchorPosition(result.anchor)
    if (position) await this.goTo(position)
  }

  async repairTextAnchor(anchor: PdfTextAnchor): Promise<PdfTextAnchor> {
    const missingPageIndexes = [
      ...new Set(
        anchor.segments
          .filter((segment) => segment.quads.length === 0)
          .map((segment) => segment.pageIndex),
      ),
    ]
    if (missingPageIndexes.length === 0 || this.#lifecycle.signal.aborted) return anchor
    const pageEntries: Array<readonly [number, PdfPageText]> = await Promise.all(
      missingPageIndexes.map(
        async (pageIndex): Promise<readonly [number, PdfPageText]> => [
          pageIndex,
          await this.#getPageText(pageIndex, this.#lifecycle.signal),
        ],
      ),
    )
    if (this.#lifecycle.signal.aborted) return anchor
    return repairPdfTextAnchor(anchor, new Map(pageEntries))
  }

  async resolveTextAnchorPosition(anchor: PdfTextAnchor): Promise<PdfPositionAnchor | undefined> {
    const segment = anchor.segments[0]
    const document = this.document
    if (!segment || !document || this.#lifecycle.signal.aborted) return undefined
    if (segment.pageIndex >= document.numPages) return undefined
    const fallback: PdfPositionAnchor = {
      kind: "pdf-position",
      pageIndex: segment.pageIndex,
      xRatio: 0,
      yRatio: 0,
    }
    const firstQuad = segment.quads[0]
    if (!firstQuad) return fallback
    const page = await document.getPage(segment.pageIndex + PDF_PAGE_NUMBER_OFFSET)
    if (this.#lifecycle.signal.aborted) return undefined
    const cropBox = readCropBox(page.view)
    if (!cropBox) return fallback
    const [, , xMax, yMax] = cropBox
    const width = xMax - cropBox[0]
    const height = yMax - cropBox[1]
    const points = [
      firstQuad.topLeft,
      firstQuad.topRight,
      firstQuad.bottomRight,
      firstQuad.bottomLeft,
    ]
    const left = Math.min(...points.map((point) => point.x))
    const top = Math.max(...points.map((point) => point.y))
    return {
      kind: "pdf-position",
      pageIndex: segment.pageIndex,
      xRatio: clampRatio(left / width),
      yRatio: clampRatio((height - top) / height),
    }
  }

  #openExternalLink(href: string): void {
    if (this.#callbacks.onExternalLink?.(href) === true) return
    this.#container.ownerDocument.defaultView?.open(
      href,
      PDFJS_EXTERNAL_LINK_TARGET,
      PDFJS_EXTERNAL_LINK_FEATURES,
    )
  }

  async destroy(): Promise<void> {
    if (this.#destroyed) return
    this.#destroyed = true
    this.#lifecycle.abort()
    if (this.#scrollFrame !== null) cancelAnimationFrame(this.#scrollFrame)
    if (this.#resizeFrame !== null) cancelAnimationFrame(this.#resizeFrame)
    this.#resizeObserver?.disconnect()
    this.#resizeObserver = null
    this.#linkService?.setDocument(null)
    this.#viewer?.cleanup()
    clearViewerDocument(this.#viewer)
    const loadingTask = this.#loaded?.loadingTask
    this.#loaded = null
    this.#viewer = null
    this.#linkService = null
    this.#navigationTargets.clear()
    this.#outlineLocations = []
    this.#pageLabels = null
    this.#pageTextCache.clear()
    this.#pageTextTasks.clear()
    this.#viewerElement.replaceChildren()
    await this.#opening.task
    if (loadingTask) await loadingTask.destroy().catch(() => undefined)
  }
}

export { PDFJS_CONTINUOUS_PAGE_LIMIT }
