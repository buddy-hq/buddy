import type { PdfQuad, PdfTextAnchor } from "@buddy/reader-contract"
import { ANNOTATION_COLOR_TOKENS, READER_SELECTION_BACKGROUND } from "../foliate-reader-constants"
import type { ReaderAnnotation, ReaderSearchResult, ReaderSelection } from "../reader-types"
import {
  viewportBoundsFromPdfQuad,
  type PdfPageGeometryProvider,
  type PdfPageViewGeometry,
} from "./pdf-geometry"
import { firstLineBounds, rectCoordinates } from "./pdf-text-rects"

/**
 * Buddy paints its own marks over the PDF.js page instead of leaning on the live
 * DOM selection, so a staged selection survives the toolbar, the chat handoff and
 * page re-renders. Every mark of one annotation shares a group that carries the
 * wash as group opacity: alpha per mark compounds wherever two marks touch and
 * leaves the seams the reader used to show.
 */

const PDF_ANNOTATION_LAYER_CLASS_NAME = "buddy-pdf-annotation-layer"
const PDF_ANNOTATION_GROUP_CLASS_NAME = "buddy-pdf-annotation-group"
const PDF_ANNOTATION_MARK_CLASS_NAME = "buddy-pdf-annotation-mark"
const PDF_ANNOTATION_NOTE_CLASS_NAME = "buddy-pdf-annotation-note"
const PDF_SELECTION_LAYER_CLASS_NAME = "buddy-pdf-selection-layer"
const PDF_SELECTION_MARK_CLASS_NAME = "buddy-pdf-selection-mark"
const PDF_SEARCH_LAYER_CLASS_NAME = "buddy-pdf-search-layer"
const PDF_SEARCH_MARK_CLASS_NAME = "buddy-pdf-search-mark"
const PDF_ANNOTATION_LAYER_Z_INDEX = "4"
const PDF_SELECTION_LAYER_Z_INDEX = "5"
const PDF_SEARCH_LAYER_Z_INDEX = "6"
const PDF_HIGHLIGHT_ALPHA = 0.34
const PDF_HIGHLIGHT_OPACITY = String(PDF_HIGHLIGHT_ALPHA)
const PDF_OPAQUE = "1"
const PDF_SEARCH_MARK_OPACITY = "0.52"
const PDF_ALPHA_PERCENT = 100

/**
 * The wash the browser paints while a selection is being dragged. It matches the
 * marks Buddy paints once the drag ends, so handing the selection over to the
 * overlay is invisible instead of a flash of a different colour.
 */
export const PDF_SELECTION_WASH = `color-mix(in srgb, ${READER_SELECTION_BACKGROUND} ${Math.round(
  PDF_HIGHLIGHT_ALPHA * PDF_ALPHA_PERCENT,
)}%, transparent)`
const PDF_MARK_RADIUS_PX = 2
const PDF_NOTE_MARKER_WIDTH_PX = 3
/** Keeps a floating overlay clear of the surface edge it is anchored inside. */
const PDF_OVERLAY_ANCHOR_EDGE_PADDING_PX = 4
/** Room reserved above an anchor so the overlay stays on the reader surface. */
const PDF_OVERLAY_ANCHOR_MIN_TOP_PX = 64

export type PdfOverlayAnchor = {
  x: number
  y: number
}

/** Stable identity for one painted annotation mark across page repaints. */
export type PdfAnnotationMarkTarget = {
  annotationId: string
  pageIndex: number
  segmentIndex: number
  quadIndex: number
}

export type PdfAnnotationsByPage = ReadonlyMap<number, readonly ReaderAnnotation[]>

type PdfMarkBounds = {
  left: number
  top: number
  width: number
  height: number
}

type PdfLayerSpec = {
  className: string
  zIndex: string
  opacity: string
  label?: string
}

const PDF_ANNOTATION_LAYER: PdfLayerSpec = {
  className: PDF_ANNOTATION_LAYER_CLASS_NAME,
  zIndex: PDF_ANNOTATION_LAYER_Z_INDEX,
  opacity: PDF_OPAQUE,
  label: "Reader annotations",
}

const PDF_SELECTION_LAYER: PdfLayerSpec = {
  className: PDF_SELECTION_LAYER_CLASS_NAME,
  zIndex: PDF_SELECTION_LAYER_Z_INDEX,
  opacity: PDF_HIGHLIGHT_OPACITY,
}

const PDF_SEARCH_LAYER: PdfLayerSpec = {
  className: PDF_SEARCH_LAYER_CLASS_NAME,
  zIndex: PDF_SEARCH_LAYER_Z_INDEX,
  opacity: PDF_SEARCH_MARK_OPACITY,
}

function annotationFill(annotation: ReaderAnnotation): string {
  return `var(${ANNOTATION_COLOR_TOKENS[annotation.color]})`
}

function annotationMarkStyle(annotation: ReaderAnnotation): Partial<CSSStyleDeclaration> {
  const color = annotationFill(annotation)
  if (annotation.style === "underline") {
    return { borderBottom: `2px solid ${color}` }
  }
  if (annotation.style === "squiggly") {
    return {
      backgroundImage: `linear-gradient(135deg, transparent 45%, ${color} 45%, ${color} 55%, transparent 55%), linear-gradient(45deg, transparent 45%, ${color} 45%, ${color} 55%, transparent 55%)`,
      backgroundPosition: "0 100%, 3px 100%",
      backgroundRepeat: "repeat-x",
      backgroundSize: "6px 4px",
    }
  }
  if (annotation.style === "strikethrough") {
    return {
      backgroundImage: `linear-gradient(to bottom, transparent 47%, ${color} 47%, ${color} 55%, transparent 55%)`,
    }
  }
  return { backgroundColor: color, borderRadius: `${PDF_MARK_RADIUS_PX}px` }
}

/** Only the filled wash is translucent; linear marks stay legible at full strength. */
function annotationGroupOpacity(annotation: ReaderAnnotation): string {
  return annotation.style === "highlight" ? PDF_HIGHLIGHT_OPACITY : PDF_OPAQUE
}

function existingLayer(
  geometry: PdfPageViewGeometry,
  spec: PdfLayerSpec,
): HTMLDivElement | undefined {
  return geometry.div.querySelector<HTMLDivElement>(`:scope > .${spec.className}`) ?? undefined
}

function ensureLayer(geometry: PdfPageViewGeometry, spec: PdfLayerSpec): HTMLDivElement {
  const existing = existingLayer(geometry, spec)
  const layer = existing ?? geometry.div.ownerDocument.createElement("div")
  if (existing) {
    layer.replaceChildren()
  } else {
    layer.className = spec.className
    if (spec.label) layer.setAttribute("aria-label", spec.label)
    else layer.setAttribute("aria-hidden", "true")
    geometry.div.append(layer)
  }
  Object.assign(layer.style, {
    position: "absolute",
    inset: "0",
    overflow: "hidden",
    pointerEvents: "none",
    userSelect: "none",
    opacity: spec.opacity,
    zIndex: spec.zIndex,
  })
  return layer
}

/**
 * Marks are placed in text-layer space while the layer fills the page box, which
 * can sit inside a page border. This is the gap between the two boxes.
 */
function layerOffset(
  geometry: PdfPageViewGeometry,
  layer: HTMLDivElement,
) {
  const textBounds = geometry.textLayerDiv.getBoundingClientRect()
  const layerBounds = layer.getBoundingClientRect()
  return {
    left: textBounds.left - layerBounds.left,
    top: textBounds.top - layerBounds.top,
  }
}

function markBounds(input: {
  geometry: PdfPageViewGeometry
  quad: PdfQuad
  offset: { left: number; top: number }
}): PdfMarkBounds | undefined {
  const bounds = viewportBoundsFromPdfQuad(
    input.quad,
    input.geometry.viewport,
    input.geometry.cropBoxOrigin,
  )
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return undefined
  return {
    left: input.offset.left + bounds.left,
    top: input.offset.top + bounds.top,
    width: bounds.width,
    height: bounds.height,
  }
}

function positionMark(mark: HTMLElement, bounds: PdfMarkBounds): void {
  Object.assign(mark.style, {
    position: "absolute",
    left: `${bounds.left}px`,
    top: `${bounds.top}px`,
    width: `${bounds.width}px`,
    height: `${bounds.height}px`,
    pointerEvents: "none",
  })
}

export function indexPdfAnnotationsByPage(
  annotations: readonly ReaderAnnotation[],
): PdfAnnotationsByPage {
  const annotationsByPage = new Map<number, ReaderAnnotation[]>()
  const annotationIdsByPage = new Map<number, Set<string>>()
  for (const annotation of annotations) {
    if (annotation.anchor.kind !== "pdf-text") continue
    for (const segment of annotation.anchor.segments) {
      const existingIds = annotationIdsByPage.get(segment.pageIndex) ?? new Set<string>()
      if (existingIds.has(annotation.id)) continue
      existingIds.add(annotation.id)
      annotationIdsByPage.set(segment.pageIndex, existingIds)
      const entries = annotationsByPage.get(segment.pageIndex) ?? []
      entries.push(annotation)
      annotationsByPage.set(segment.pageIndex, entries)
    }
  }
  return annotationsByPage
}

function annotationMark(input: {
  annotation: ReaderAnnotation
  group: HTMLElement
  bounds: PdfMarkBounds
  first: boolean
  target: PdfAnnotationMarkTarget
  onActivate: (target: PdfAnnotationMarkTarget) => void
}): void {
  const ownerDocument = input.group.ownerDocument
  let mark: HTMLElement
  if (input.first) {
    const button = ownerDocument.createElement("button")
    button.type = "button"
    button.setAttribute(
      "aria-label",
      input.annotation.note.trim()
        ? `Annotation with note: ${input.annotation.text}`
        : `Annotation: ${input.annotation.text}`,
    )
    // Marks never take pointer hits, otherwise a highlight would swallow the drag
    // that starts a new selection over it. Pointer activation is resolved from
    // mark geometry by pdfAnnotationAtPoint; the button carries keyboard access.
    button.addEventListener("click", (event) => {
      event.preventDefault()
      event.stopPropagation()
      input.onActivate(input.target)
    })
    mark = button
  } else {
    const continuation = ownerDocument.createElement("span")
    continuation.setAttribute("aria-hidden", "true")
    mark = continuation
  }
  mark.className = PDF_ANNOTATION_MARK_CLASS_NAME
  mark.dataset.annotationId = input.annotation.id
  mark.dataset.pageIndex = String(input.target.pageIndex)
  mark.dataset.segmentIndex = String(input.target.segmentIndex)
  mark.dataset.quadIndex = String(input.target.quadIndex)
  positionMark(mark, input.bounds)
  Object.assign(mark.style, {
    padding: "0",
    border: "0",
    appearance: "none",
    backgroundColor: "transparent",
    ...annotationMarkStyle(input.annotation),
  })
  input.group.append(mark)
}

/** A full-strength edge marker so a note stays readable through the wash. */
function annotationNoteMarker(input: {
  annotation: ReaderAnnotation
  layer: HTMLElement
  bounds: PdfMarkBounds
}): void {
  const marker = input.layer.ownerDocument.createElement("span")
  marker.className = PDF_ANNOTATION_NOTE_CLASS_NAME
  marker.setAttribute("aria-hidden", "true")
  marker.dataset.annotationId = input.annotation.id
  positionMark(marker, { ...input.bounds, width: PDF_NOTE_MARKER_WIDTH_PX })
  Object.assign(marker.style, {
    backgroundColor: annotationFill(input.annotation),
    borderRadius: `${PDF_NOTE_MARKER_WIDTH_PX}px`,
  })
  input.layer.append(marker)
}

function renderAnnotationPage(input: {
  session: PdfPageGeometryProvider
  pageIndex: number
  annotations: readonly ReaderAnnotation[]
  onActivate: (target: PdfAnnotationMarkTarget) => void
}): void {
  const geometry = input.session.getPageGeometry(input.pageIndex)
  if (!geometry) return
  if (input.annotations.length === 0) {
    existingLayer(geometry, PDF_ANNOTATION_LAYER)?.replaceChildren()
    return
  }
  const layer = ensureLayer(geometry, PDF_ANNOTATION_LAYER)
  const offset = layerOffset(geometry, layer)
  for (const annotation of input.annotations) {
    if (annotation.anchor.kind !== "pdf-text") continue
    const group = layer.ownerDocument.createElement("div")
    group.className = PDF_ANNOTATION_GROUP_CLASS_NAME
    group.dataset.annotationId = annotation.id
    Object.assign(group.style, {
      position: "absolute",
      inset: "0",
      pointerEvents: "none",
      opacity: annotationGroupOpacity(annotation),
    })
    layer.append(group)

    let firstBounds: PdfMarkBounds | undefined
    for (const [segmentIndex, segment] of annotation.anchor.segments.entries()) {
      if (segment.pageIndex !== input.pageIndex) continue
      for (const [quadIndex, quad] of segment.quads.entries()) {
        const bounds = markBounds({ geometry, quad, offset })
        if (!bounds) continue
        annotationMark({
          annotation,
          group,
          bounds,
          first: firstBounds === undefined,
          target: {
            annotationId: annotation.id,
            pageIndex: input.pageIndex,
            segmentIndex,
            quadIndex,
          },
          onActivate: input.onActivate,
        })
        firstBounds ??= bounds
      }
    }
    if (firstBounds && annotation.note.trim()) {
      annotationNoteMarker({ annotation, layer, bounds: firstBounds })
    }
  }
}

function renderQuadPage(input: {
  session: PdfPageGeometryProvider
  pageIndex: number
  segments: PdfTextAnchor["segments"]
  spec: PdfLayerSpec
  markClassName: string
  color: string
}): void {
  const geometry = input.session.getPageGeometry(input.pageIndex)
  if (!geometry) return
  const segments = input.segments.filter((segment) => segment.pageIndex === input.pageIndex)
  if (segments.length === 0) {
    existingLayer(geometry, input.spec)?.remove()
    return
  }
  const layer = ensureLayer(geometry, input.spec)
  const offset = layerOffset(geometry, layer)
  for (const segment of segments) {
    for (const quad of segment.quads) {
      const bounds = markBounds({ geometry, quad, offset })
      if (!bounds) continue
      const mark = layer.ownerDocument.createElement("div")
      mark.className = input.markClassName
      positionMark(mark, bounds)
      Object.assign(mark.style, {
        backgroundColor: input.color,
        borderRadius: `${PDF_MARK_RADIUS_PX}px`,
      })
      layer.append(mark)
    }
  }
}

function renderPages(input: {
  pageIndex: number | undefined
  pageIndexes: () => Iterable<number>
  clear: () => void
  renderPage: (pageIndex: number) => void
}): void {
  if (input.pageIndex !== undefined) {
    input.renderPage(input.pageIndex)
    return
  }
  input.clear()
  for (const pageIndex of input.pageIndexes()) input.renderPage(pageIndex)
}

export function renderPdfAnnotations(input: {
  root: HTMLElement
  session: PdfPageGeometryProvider
  annotationsByPage: PdfAnnotationsByPage
  pageIndex?: number
  onActivate: (target: PdfAnnotationMarkTarget) => void
}): void {
  renderPages({
    pageIndex: input.pageIndex,
    pageIndexes: () => input.annotationsByPage.keys(),
    clear: () =>
      input.root
        .querySelectorAll<HTMLElement>(`.${PDF_ANNOTATION_LAYER_CLASS_NAME}`)
        .forEach((layer) => layer.replaceChildren()),
    renderPage: (pageIndex) =>
      renderAnnotationPage({
        session: input.session,
        pageIndex,
        annotations: input.annotationsByPage.get(pageIndex) ?? [],
        onActivate: input.onActivate,
      }),
  })
}

export function renderPdfSelection(input: {
  root: HTMLElement
  session: PdfPageGeometryProvider
  selection: ReaderSelection | undefined
  pageIndex?: number
}): void {
  const anchor = input.selection?.anchor
  if (!anchor || anchor.kind !== "pdf-text") {
    removePdfSelectionLayers(input.root)
    return
  }
  renderPages({
    pageIndex: input.pageIndex,
    pageIndexes: () => new Set(anchor.segments.map((segment) => segment.pageIndex)),
    clear: () => removePdfSelectionLayers(input.root),
    renderPage: (pageIndex) =>
      renderQuadPage({
        session: input.session,
        pageIndex,
        segments: anchor.segments,
        spec: PDF_SELECTION_LAYER,
        markClassName: PDF_SELECTION_MARK_CLASS_NAME,
        color: READER_SELECTION_BACKGROUND,
      }),
  })
}

export function renderPdfSearchResult(input: {
  root: HTMLElement
  session: PdfPageGeometryProvider
  result: ReaderSearchResult | undefined
  pageIndex?: number
}): void {
  const anchor = input.result?.anchor
  if (!anchor || anchor.kind !== "pdf-text") {
    removePdfSearchLayers(input.root)
    return
  }
  renderPages({
    pageIndex: input.pageIndex,
    pageIndexes: () => new Set(anchor.segments.map((segment) => segment.pageIndex)),
    clear: () => removePdfSearchLayers(input.root),
    renderPage: (pageIndex) =>
      renderQuadPage({
        session: input.session,
        pageIndex,
        segments: anchor.segments,
        spec: PDF_SEARCH_LAYER,
        markClassName: PDF_SEARCH_MARK_CLASS_NAME,
        color: READER_SELECTION_BACKGROUND,
      }),
  })
}

export function removePdfAnnotationLayers(root: HTMLElement): void {
  root
    .querySelectorAll<HTMLElement>(`.${PDF_ANNOTATION_LAYER_CLASS_NAME}`)
    .forEach((layer) => layer.remove())
}

export function removePdfSelectionLayers(root: HTMLElement): void {
  root
    .querySelectorAll<HTMLElement>(`.${PDF_SELECTION_LAYER_CLASS_NAME}`)
    .forEach((layer) => layer.remove())
}

export function removePdfSearchLayers(root: HTMLElement): void {
  root
    .querySelectorAll<HTMLElement>(`.${PDF_SEARCH_LAYER_CLASS_NAME}`)
    .forEach((layer) => layer.remove())
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Floating reader overlays sit above a mark, in coordinates relative to the
 * reader surface. Anchoring to the painted marks — instead of to the client rects
 * captured when the selection was read — keeps the toolbar on its highlight
 * across scrolling, zooming and page re-renders. Returns undefined once the
 * marks leave the surface, which is the reader's cue to hide the overlay.
 */
function overlayAnchor(
  root: HTMLElement,
  marks: readonly HTMLElement[],
): PdfOverlayAnchor | undefined {
  const bounds = firstLineBounds(marks.map((mark) => rectCoordinates(mark.getBoundingClientRect())))
  if (!bounds) return undefined
  const rootBounds = root.getBoundingClientRect()
  if (bounds.bottom <= rootBounds.top || bounds.top >= rootBounds.bottom) return undefined
  if (bounds.right <= rootBounds.left || bounds.left >= rootBounds.right) return undefined
  return {
    x: clamp(
      bounds.left + (bounds.right - bounds.left) / 2 - rootBounds.left,
      PDF_OVERLAY_ANCHOR_EDGE_PADDING_PX,
      Math.max(PDF_OVERLAY_ANCHOR_EDGE_PADDING_PX, rootBounds.width),
    ),
    y: clamp(
      bounds.top - rootBounds.top,
      PDF_OVERLAY_ANCHOR_MIN_TOP_PX,
      Math.max(PDF_OVERLAY_ANCHOR_MIN_TOP_PX, rootBounds.height),
    ),
  }
}

export function pdfOverlayAnchorEquals(
  left: PdfOverlayAnchor | undefined,
  right: PdfOverlayAnchor | undefined,
): boolean {
  if (!left || !right) return left === right
  return left.x === right.x && left.y === right.y
}

export function pdfSelectionAnchor(root: HTMLElement): PdfOverlayAnchor | undefined {
  return overlayAnchor(
    root,
    Array.from(root.querySelectorAll<HTMLElement>(`.${PDF_SELECTION_MARK_CLASS_NAME}`)),
  )
}

export function pdfAnnotationAnchor(
  root: HTMLElement,
  target: PdfAnnotationMarkTarget,
): PdfOverlayAnchor | undefined {
  const mark = annotationMarks(root).find((candidate) =>
    pdfAnnotationMarkTargetEquals(readPdfAnnotationMarkTarget(candidate), target),
  )
  return overlayAnchor(root, mark ? [mark] : [])
}

function annotationMarks(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(`.${PDF_ANNOTATION_MARK_CLASS_NAME}`))
}

function readPdfAnnotationMarkTarget(mark: HTMLElement): PdfAnnotationMarkTarget | undefined {
  const annotationId = mark.dataset.annotationId
  const pageIndex = Number(mark.dataset.pageIndex)
  const segmentIndex = Number(mark.dataset.segmentIndex)
  const quadIndex = Number(mark.dataset.quadIndex)
  if (
    !annotationId ||
    !Number.isInteger(pageIndex) ||
    !Number.isInteger(segmentIndex) ||
    !Number.isInteger(quadIndex)
  ) {
    return undefined
  }
  return { annotationId, pageIndex, segmentIndex, quadIndex }
}

function pdfAnnotationMarkTargetEquals(
  left: PdfAnnotationMarkTarget | undefined,
  right: PdfAnnotationMarkTarget,
): boolean {
  return (
    left?.annotationId === right.annotationId &&
    left.pageIndex === right.pageIndex &&
    left.segmentIndex === right.segmentIndex &&
    left.quadIndex === right.quadIndex
  )
}

/** Topmost annotation under a client point, hit-tested against the painted marks. */
export function pdfAnnotationAtPoint(
  root: HTMLElement,
  point: { x: number; y: number },
): PdfAnnotationMarkTarget | undefined {
  const marks = annotationMarks(root).toReversed()
  for (const mark of marks) {
    const bounds = mark.getBoundingClientRect()
    if (
      point.x >= bounds.left &&
      point.x <= bounds.right &&
      point.y >= bounds.top &&
      point.y <= bounds.bottom
    ) {
      return readPdfAnnotationMarkTarget(mark)
    }
  }
  return undefined
}
