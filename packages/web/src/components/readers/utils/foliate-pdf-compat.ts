import type {
  FoliateNavigationTarget,
  FoliateResolvedNavigation,
  View as FoliateView,
} from "foliate-js/view.js"
import { Overlayer } from "foliate-js/overlayer.js"
import type { ReaderAnnotation } from "../foliate-reader-types"
import {
  ANNOTATION_STYLE_HIGHLIGHT,
  ANNOTATION_STYLE_STRIKETHROUGH,
  ANNOTATION_STYLE_SQUIGGLY,
  ANNOTATION_STYLE_UNDERLINE,
} from "../foliate-reader-constants"
import { addNoteMarker, drawHighlight, drawLinearMark } from "./foliate-drawing"

export const PDF_VIEW_MODE_FIT = "fit" as const
export const PDF_VIEW_MODE_SCROLL = "scroll" as const
export const PDF_VIEW_MODE_SPREAD = "spread" as const

export type FoliatePdfViewMode =
  | typeof PDF_VIEW_MODE_FIT
  | typeof PDF_VIEW_MODE_SCROLL
  | typeof PDF_VIEW_MODE_SPREAD

const PDF_SINGLE_PAGE_SPREAD = "none"
const PDF_TWO_PAGE_SPREAD = "both"
const PDF_ZOOM_FIT_WIDTH = "fit-width"
const PDF_ZOOM_FIT_PAGE = "fit-page"
const PDF_PAGE_LABEL_PREFIX = "Page"
const PDF_OVERLAY_Z_INDEX = "1"
const PDF_SELECTION_STYLE_ID = "buddy-pdf-selection-style"
const PDF_SELECTION_FALLBACK_CSS = `
  html,
  body {
    margin: 0;
    padding: 0;
  }

  body {
    position: relative;
  }

  #canvas {
    position: relative;
    z-index: 0;
    pointer-events: none;
  }

  #canvas > canvas {
    display: block;
    pointer-events: none;
  }

  .textLayer {
    color-scheme: only light;
    position: absolute;
    inset: 0;
    overflow: clip;
    opacity: 1;
    line-height: 1;
    text-size-adjust: none;
    forced-color-adjust: none;
    transform-origin: 0 0;
    caret-color: CanvasText;
    z-index: 1;
    pointer-events: auto;
    user-select: text;
    -webkit-user-select: text;
    cursor: text;

    --min-font-size: 1;
    --text-scale-factor: calc(var(--total-scale-factor) * var(--min-font-size));
    --min-font-size-inv: calc(1 / var(--min-font-size));
  }

  .textLayer span,
  .textLayer br {
    color: transparent;
    position: absolute;
    white-space: pre;
    cursor: text;
    transform-origin: 0 0;
  }

  .textLayer > :not(.markedContent),
  .textLayer .markedContent span:not(.markedContent) {
    z-index: 1;
    --font-height: 0;
    --scale-x: 1;
    --rotate: 0deg;
    font-size: calc(var(--text-scale-factor) * var(--font-height));
    transform:
      rotate(var(--rotate)) scaleX(var(--scale-x))
      scale(var(--min-font-size-inv));
  }

  .textLayer .markedContent {
    display: contents;
  }

  .textLayer span[role="img"] {
    user-select: none;
    cursor: default;
  }

  .textLayer .endOfContent {
    display: block;
    position: absolute;
    inset: 100% 0 0;
    z-index: 0;
    cursor: default;
    user-select: none;
  }

  .textLayer.selecting .endOfContent {
    top: 0;
  }

  .annotationLayer {
    color-scheme: only light;
    position: absolute;
    inset: 0;
    pointer-events: none;
    transform-origin: 0 0;
    z-index: 2;
  }

  .annotationLayer section {
    position: absolute;
    text-align: initial;
    pointer-events: auto;
    box-sizing: border-box;
    transform-origin: 0 0;
    user-select: none;
  }

  .textLayer.selecting ~ .annotationLayer section {
    pointer-events: none;
  }
`

type PdfPageOverlayEntry = {
  clickListener: (event: MouseEvent) => void
  doc: Document
  index: number
  overlayer: Overlayer
}

const pdfPageOverlays = new WeakMap<FoliateView, Map<number, PdfPageOverlayEntry>>()

function cleanupPdfPageOverlayEntry(entry: PdfPageOverlayEntry) {
  entry.doc.removeEventListener("click", entry.clickListener)
  entry.overlayer.element.remove()
}

function setPdfPageOverlay(view: FoliateView, nextEntry: PdfPageOverlayEntry) {
  const currentEntries = pdfPageOverlays.get(view) ?? new Map<number, PdfPageOverlayEntry>()

  for (const [index, entry] of currentEntries) {
    const frame = entry.doc.defaultView?.frameElement
    if (frame?.isConnected !== false) continue
    cleanupPdfPageOverlayEntry(entry)
    currentEntries.delete(index)
  }

  const existing = currentEntries.get(nextEntry.index)
  if (existing) cleanupPdfPageOverlayEntry(existing)

  currentEntries.set(nextEntry.index, nextEntry)
  pdfPageOverlays.set(view, currentEntries)
}

function getPdfPageOverlay(view: FoliateView, index: number): PdfPageOverlayEntry | undefined {
  return pdfPageOverlays.get(view)?.get(index)
}

function toPdfPageLabel(index: number): string {
  return `${PDF_PAGE_LABEL_PREFIX} ${index + 1}`
}

function toRangeInDocument(
  doc: Document,
  anchor: FoliateResolvedNavigation["anchor"],
): Range | null {
  const target = anchor?.(doc)
  if (!target) return null
  if (target instanceof Range) return target

  const range = doc.createRange()
  range.selectNodeContents(target)
  return range
}

function getAnnotationDrawing(
  annotation: ReaderAnnotation,
  doc: Document,
  range: Range,
): (rects: DOMRectList) => SVGElement {
  const color = annotation.color ?? "#f59e0b"
  const style = annotation.style ?? ANNOTATION_STYLE_HIGHLIGHT
  const writingMode =
    doc.defaultView?.getComputedStyle(range.startContainer.parentElement ?? doc.body).writingMode ??
    ""

  if (style === ANNOTATION_STYLE_UNDERLINE) {
    return (rects) => {
      const group = drawLinearMark(rects, color, writingMode, ANNOTATION_STYLE_UNDERLINE)
      if (annotation.note?.trim()) addNoteMarker(group, rects, color)
      return group
    }
  }
  if (style === ANNOTATION_STYLE_SQUIGGLY) {
    return (rects) => {
      const group = drawLinearMark(rects, color, writingMode, ANNOTATION_STYLE_SQUIGGLY)
      if (annotation.note?.trim()) addNoteMarker(group, rects, color)
      return group
    }
  }
  if (style === ANNOTATION_STYLE_STRIKETHROUGH) {
    return (rects) => {
      const group = drawLinearMark(rects, color, writingMode, ANNOTATION_STYLE_STRIKETHROUGH)
      if (annotation.note?.trim()) addNoteMarker(group, rects, color)
      return group
    }
  }
  return (rects) => {
    const group = drawHighlight(rects, color)
    if (annotation.note?.trim()) addNoteMarker(group, rects, color)
    return group
  }
}

async function resolvePdfTarget(view: FoliateView, target: FoliateNavigationTarget) {
  return await view.resolveNavigation(target)
}

function getPdfViewModeConfig(mode: FoliatePdfViewMode): { spread: string; zoom: string } {
  if (mode === PDF_VIEW_MODE_SCROLL) {
    return {
      spread: PDF_SINGLE_PAGE_SPREAD,
      zoom: PDF_ZOOM_FIT_WIDTH,
    }
  }
  if (mode === PDF_VIEW_MODE_SPREAD) {
    return {
      spread: PDF_TWO_PAGE_SPREAD,
      zoom: PDF_ZOOM_FIT_PAGE,
    }
  }
  return {
    spread: PDF_SINGLE_PAGE_SPREAD,
    zoom: PDF_ZOOM_FIT_PAGE,
  }
}

export function preparePdfDocument(doc: Document) {
  if (!doc.getElementById(PDF_SELECTION_STYLE_ID)) {
    const style = doc.createElement("style")
    style.id = PDF_SELECTION_STYLE_ID
    style.textContent = PDF_SELECTION_FALLBACK_CSS
    doc.head.append(style)
  }

  const applySelectionSurfaceStyles = () => {
    doc.documentElement.style.userSelect = "text"
    doc.documentElement.style.webkitUserSelect = "text"
    doc.body.style.userSelect = "text"
    doc.body.style.webkitUserSelect = "text"
    doc.body.style.position = "relative"

    const canvasHost = doc.querySelector("#canvas")
    if (canvasHost instanceof HTMLElement) {
      canvasHost.style.pointerEvents = "none"
      canvasHost.style.position = "relative"
      canvasHost.style.zIndex = "0"
    }

    const renderedCanvas = canvasHost?.querySelector("canvas")
    if (renderedCanvas instanceof HTMLCanvasElement) {
      renderedCanvas.style.pointerEvents = "none"
      renderedCanvas.style.display = "block"
    }

    const textLayer = doc.querySelector(".textLayer")
    if (textLayer instanceof HTMLElement) {
      textLayer.style.pointerEvents = "auto"
      textLayer.style.userSelect = "text"
      textLayer.style.webkitUserSelect = "text"
      textLayer.style.cursor = "text"
      textLayer.style.zIndex = "1"
    }

    const annotationLayer = doc.querySelector(".annotationLayer")
    if (annotationLayer instanceof HTMLElement) {
      annotationLayer.style.zIndex = "2"
    }

    return renderedCanvas instanceof HTMLCanvasElement && textLayer instanceof HTMLElement
  }

  if (applySelectionSurfaceStyles()) return

  const observer = new MutationObserver(() => {
    if (!applySelectionSurfaceStyles()) return
    observer.disconnect()
  })
  observer.observe(doc.body, { childList: true, subtree: true })
}

export function configurePdfFixedLayoutView(view: FoliateView, mode: FoliatePdfViewMode) {
  if (!view.isFixedLayout) return
  const { spread, zoom } = getPdfViewModeConfig(mode)
  view.book.rendition = {
    ...view.book.rendition,
    spread,
  }
  view.renderer.open(view.book)
  view.renderer.setAttribute("zoom", zoom)
  redrawPdfPageOverlays(view)
}

export async function updatePdfFixedLayoutViewMode(
  view: FoliateView,
  mode: FoliatePdfViewMode,
  target: FoliateNavigationTarget,
) {
  if (!view.isFixedLayout) return
  const { spread, zoom } = getPdfViewModeConfig(mode)
  const spreadChanged = view.book.rendition?.spread !== spread

  if (spreadChanged) {
    clearPdfPageOverlays(view)
    view.book.rendition = {
      ...view.book.rendition,
      spread,
    }
    view.renderer.open(view.book)
    const resolved = await view.resolveNavigation(target)
    if (resolved) {
      await view.renderer.goTo(resolved)
    }
  }

  view.renderer.setAttribute("zoom", zoom)
  redrawPdfPageOverlays(view)
}

export function syncPdfFixedLayoutView(view: FoliateView, mode: FoliatePdfViewMode) {
  if (!view.isFixedLayout) return
  const { zoom } = getPdfViewModeConfig(mode)
  view.renderer.setAttribute("zoom", zoom)
  redrawPdfPageOverlays(view)
}

export function redrawPdfPageOverlays(view: FoliateView) {
  const overlays = pdfPageOverlays.get(view)
  if (!overlays) return
  for (const entry of overlays.values()) entry.overlayer.redraw()
}

export function clearPdfPageOverlays(view: FoliateView | null) {
  if (!view) return
  const overlays = pdfPageOverlays.get(view)
  if (!overlays) return
  for (const entry of overlays.values()) cleanupPdfPageOverlayEntry(entry)
  pdfPageOverlays.delete(view)
}

export function registerPdfPageOverlay(params: {
  doc: Document
  index: number
  onShowAnnotation: (value: string, range: Range) => void
  view: FoliateView
}) {
  const { doc, index, onShowAnnotation, view } = params
  const body = doc.body
  const bodyStyle = doc.defaultView?.getComputedStyle(body)
  if (bodyStyle?.position === "static") body.style.position = "relative"

  const overlayer = new Overlayer()
  overlayer.element.style.zIndex = PDF_OVERLAY_Z_INDEX

  const clickListener = (event: MouseEvent) => {
    const [value, range] = overlayer.hitTest({ x: event.clientX, y: event.clientY })
    if (typeof value !== "string") return
    if (!(range instanceof Range)) return
    onShowAnnotation(value, range)
  }

  doc.addEventListener("click", clickListener)
  body.append(overlayer.element)

  setPdfPageOverlay(view, {
    clickListener,
    doc,
    index,
    overlayer,
  })
}

export async function addPdfAnnotation(view: FoliateView, annotation: ReaderAnnotation) {
  const resolved = await resolvePdfTarget(view, annotation.value)
  if (!resolved) return undefined

  const label = toPdfPageLabel(resolved.index)
  const entry = getPdfPageOverlay(view, resolved.index)
  if (!entry || !resolved.anchor) return { index: resolved.index, label }

  const range = toRangeInDocument(entry.doc, resolved.anchor)
  if (!range) return { index: resolved.index, label }

  entry.overlayer.add(annotation.value, range, getAnnotationDrawing(annotation, entry.doc, range))
  return { index: resolved.index, label }
}

export function addPdfAnnotationFromSelection(params: {
  annotation: ReaderAnnotation
  index: number
  range: Range
  view: FoliateView
}) {
  const entry = getPdfPageOverlay(params.view, params.index)
  if (!entry) return undefined

  entry.overlayer.add(
    params.annotation.value,
    params.range,
    getAnnotationDrawing(params.annotation, entry.doc, params.range),
  )
  return {
    index: params.index,
    label: toPdfPageLabel(params.index),
  }
}

export async function deletePdfAnnotation(view: FoliateView, annotation: ReaderAnnotation) {
  const resolved = await resolvePdfTarget(view, annotation.value)
  if (!resolved) return undefined
  getPdfPageOverlay(view, resolved.index)?.overlayer.remove(annotation.value)
  return { index: resolved.index, label: toPdfPageLabel(resolved.index) }
}

export async function showPdfAnnotation(view: FoliateView, annotation: ReaderAnnotation) {
  const resolved = await resolvePdfTarget(view, annotation.value)
  if (!resolved) return null

  await view.goTo(annotation.value)

  const entry = getPdfPageOverlay(view, resolved.index)
  if (!entry || !resolved.anchor) return null
  return toRangeInDocument(entry.doc, resolved.anchor)
}
