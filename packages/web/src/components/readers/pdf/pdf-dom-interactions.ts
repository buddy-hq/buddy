import {
  MAX_PDF_QUADS_PER_SEGMENT,
  MAX_PDF_QUOTE_LENGTH,
  MAX_PDF_TEXT_SEGMENTS,
  readReaderTextAnchor,
  readerTextAnchorKey,
  type PdfTextAnchor,
} from "@buddy/reader-contract"
import { ANNOTATION_COLOR_TOKENS } from "../foliate-reader-constants"
import type { ReaderAnnotation, ReaderSearchResult, ReaderSelection } from "../reader-types"
import {
  pdfQuadFromClientRect,
  viewportBoundsFromPdfQuad,
  type PdfPageViewGeometry,
  type RectCoordinates,
} from "./pdf-geometry"
import type { PdfViewerSession } from "./pdf-viewer-session"

const PDF_PAGE_NUMBER_OFFSET = 1
const PDF_QUOTE_CONTEXT_LENGTH = 96
const PDF_ANNOTATION_LAYER_CLASS_NAME = "buddy-pdf-annotation-layer"
const PDF_ANNOTATION_MARK_CLASS_NAME = "buddy-pdf-annotation-mark"
const PDF_SELECTION_LAYER_CLASS_NAME = "buddy-pdf-selection-layer"
const PDF_SELECTION_MARK_CLASS_NAME = "buddy-pdf-selection-mark"
const PDF_SEARCH_LAYER_CLASS_NAME = "buddy-pdf-search-layer"
const PDF_SEARCH_MARK_CLASS_NAME = "buddy-pdf-search-mark"
const PDF_ANNOTATION_LAYER_Z_INDEX = "4"
const PDF_SELECTION_LAYER_Z_INDEX = "5"
const PDF_SEARCH_LAYER_Z_INDEX = "6"
const PDF_SELECTION_MARK_OPACITY = "0.34"
const PDF_SEARCH_MARK_OPACITY = "0.52"

type PdfPageGeometryProvider = Pick<PdfViewerSession, "getPageGeometry"> &
  Partial<Pick<PdfViewerSession, "getPageLabel" | "getTocLabel">>

export type PdfSelectionAction = {
  selection: ReaderSelection
  x: number
  y: number
}

export type PdfAnnotationActivation = {
  annotationId: string
  x: number
  y: number
}

export function isPdfSelectionEventTarget(
  target: EventTarget | null,
  viewerContainer: HTMLElement,
): boolean {
  return target instanceof Node && viewerContainer.contains(target)
}

function rectCoordinates(rect: DOMRect | DOMRectReadOnly): RectCoordinates {
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
  }
}

function rangeIntersection(range: Range, element: HTMLElement): Range | undefined {
  const elementRange = element.ownerDocument.createRange()
  elementRange.selectNodeContents(element)
  try {
    if (
      range.compareBoundaryPoints(Range.START_TO_END, elementRange) <= 0 ||
      range.compareBoundaryPoints(Range.END_TO_START, elementRange) >= 0
    ) {
      return undefined
    }
    const intersection = range.cloneRange()
    if (range.compareBoundaryPoints(Range.START_TO_START, elementRange) < 0) {
      intersection.setStart(elementRange.startContainer, elementRange.startOffset)
    }
    if (range.compareBoundaryPoints(Range.END_TO_END, elementRange) > 0) {
      intersection.setEnd(elementRange.endContainer, elementRange.endOffset)
    }
    return intersection.collapsed ? undefined : intersection
  } catch {
    return undefined
  } finally {
    elementRange.detach()
  }
}

function selectionBelongsToRoot(selection: Selection, root: HTMLElement): boolean {
  const anchorNode = selection.anchorNode
  const focusNode = selection.focusNode
  return Boolean(anchorNode && focusNode && root.contains(anchorNode) && root.contains(focusNode))
}

function selectionToolbarBounds(range: Range): DOMRect | undefined {
  const rects = Array.from(range.getClientRects()).filter(
    (rect) => rect.width > 0 && rect.height > 0,
  )
  if (rects.length === 0) return undefined

  const firstRect = rects.reduce((first, rect) => {
    if (rect.top < first.top) return rect
    return rect.top === first.top && rect.left < first.left ? rect : first
  })
  const firstLineRects = rects.filter(
    (rect) => rect.top < firstRect.bottom && rect.bottom > firstRect.top,
  )
  const left = Math.min(...firstLineRects.map((rect) => rect.left))
  const top = Math.min(...firstLineRects.map((rect) => rect.top))
  const right = Math.max(...firstLineRects.map((rect) => rect.right))
  const bottom = Math.max(...firstLineRects.map((rect) => rect.bottom))
  return DOMRect.fromRect({ x: left, y: top, width: right - left, height: bottom - top })
}

function segmentOffsets(
  pageElement: HTMLElement,
  selectedRange: Range,
): { startOffset?: number; endOffset?: number } {
  const prefixRange = pageElement.ownerDocument.createRange()
  prefixRange.selectNodeContents(pageElement)
  try {
    prefixRange.setEnd(selectedRange.startContainer, selectedRange.startOffset)
    const startOffset = prefixRange.toString().length
    return {
      startOffset,
      endOffset: startOffset + selectedRange.toString().length,
    }
  } catch {
    return {}
  } finally {
    prefixRange.detach()
  }
}

function pageElementForNode(root: HTMLElement, node: Node): HTMLElement | undefined {
  const element = node instanceof Element ? node : node.parentElement
  const page = element?.closest<HTMLElement>(".pdfViewer .page[data-page-number]")
  return page && root.contains(page) ? page : undefined
}

function selectedPageElements(root: HTMLElement, range: Range): HTMLElement[] {
  const firstPage = pageElementForNode(root, range.startContainer)
  const lastPage = pageElementForNode(root, range.endContainer)
  if (!firstPage || !lastPage) return []
  const firstPageNumber = Number(firstPage.dataset.pageNumber)
  const lastPageNumber = Number(lastPage.dataset.pageNumber)
  if (
    !Number.isInteger(firstPageNumber) ||
    !Number.isInteger(lastPageNumber) ||
    firstPageNumber < PDF_PAGE_NUMBER_OFFSET ||
    lastPageNumber < firstPageNumber
  ) {
    return []
  }
  const pages: HTMLElement[] = []
  for (let pageNumber = firstPageNumber; pageNumber <= lastPageNumber; pageNumber += 1) {
    const page = root.querySelector<HTMLElement>(
      `.pdfViewer .page[data-page-number="${pageNumber}"]`,
    )
    if (page) pages.push(page)
  }
  return pages
}

function quoteContext(input: {
  firstPageText: string
  firstStartOffset?: number
  lastPageText: string
  lastEndOffset?: number
}): { prefix?: string; suffix?: string } {
  const prefix =
    input.firstStartOffset === undefined
      ? undefined
      : input.firstPageText.slice(
          Math.max(0, input.firstStartOffset - PDF_QUOTE_CONTEXT_LENGTH),
          input.firstStartOffset,
        )
  const suffix =
    input.lastEndOffset === undefined
      ? undefined
      : input.lastPageText.slice(
          input.lastEndOffset,
          input.lastEndOffset + PDF_QUOTE_CONTEXT_LENGTH,
        )
  return {
    ...(prefix ? { prefix } : {}),
    ...(suffix ? { suffix } : {}),
  }
}

export function readPdfSelection(input: {
  root: HTMLElement
  session: PdfPageGeometryProvider
  onLimitExceeded?: () => void
}): PdfSelectionAction | undefined {
  const selection = input.root.ownerDocument.getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return undefined
  if (!selectionBelongsToRoot(selection, input.root)) return undefined
  const text = selection.toString().trim()
  if (!text) return undefined
  if (text.length > MAX_PDF_QUOTE_LENGTH) {
    input.onLimitExceeded?.()
    return undefined
  }
  const range = selection.getRangeAt(0)
  const bounds = selectionToolbarBounds(range)
  if (!bounds) return undefined

  const segments: PdfTextAnchor["segments"] = []
  const segmentTextDetails: Array<{
    pageText: string
    startOffset?: number
    endOffset?: number
  }> = []
  const pages = selectedPageElements(input.root, range)
  if (pages.length > MAX_PDF_TEXT_SEGMENTS) {
    input.onLimitExceeded?.()
    return undefined
  }
  for (const page of pages) {
    const pageNumber = Number(page.dataset.pageNumber)
    if (!Number.isInteger(pageNumber) || pageNumber < PDF_PAGE_NUMBER_OFFSET) continue
    const pageIndex = pageNumber - PDF_PAGE_NUMBER_OFFSET
    const geometry = input.session.getPageGeometry(pageIndex)
    if (!geometry) continue
    const pageRange = rangeIntersection(range, geometry.textLayerDiv)
    if (!pageRange) continue
    try {
      const textLayerBounds = rectCoordinates(geometry.textLayerDiv.getBoundingClientRect())
      const quads = Array.from(pageRange.getClientRects())
        .filter((rect) => rect.width > 0 && rect.height > 0)
        .map((rect) =>
          pdfQuadFromClientRect(
            rectCoordinates(rect),
            textLayerBounds,
            geometry.viewport,
            geometry.cropBoxOrigin,
          ),
        )
        .filter((quad) => quad !== undefined)
      if (quads.length > MAX_PDF_QUADS_PER_SEGMENT) {
        input.onLimitExceeded?.()
        return undefined
      }
      if (quads.length === 0) continue
      const pageText = geometry.textLayerDiv.textContent ?? ""
      const offsets = segmentOffsets(geometry.textLayerDiv, pageRange)
      segments.push({ pageIndex, quads, ...offsets })
      segmentTextDetails.push({ pageText, ...offsets })
    } finally {
      pageRange.detach()
    }
  }
  if (segments.length === 0) return undefined

  const firstDetails = segmentTextDetails[0]
  const lastDetails = segmentTextDetails.at(-1)
  const context =
    firstDetails && lastDetails
      ? quoteContext({
          firstPageText: firstDetails.pageText,
          firstStartOffset: firstDetails.startOffset,
          lastPageText: lastDetails.pageText,
          lastEndOffset: lastDetails.endOffset,
        })
      : {}
  const anchor: PdfTextAnchor = {
    kind: "pdf-text",
    segments,
    quote: { exact: text, ...context },
  }
  const validatedAnchor = readReaderTextAnchor(anchor)
  if (!validatedAnchor || validatedAnchor.kind !== "pdf-text") {
    input.onLimitExceeded?.()
    return undefined
  }
  const firstPageIndex = segments[0]?.pageIndex ?? 0
  const lastPageIndex = segments.at(-1)?.pageIndex ?? firstPageIndex
  const firstPageLabel = input.session.getPageLabel?.(firstPageIndex) ??
    String(firstPageIndex + PDF_PAGE_NUMBER_OFFSET)
  const pageLabel =
    firstPageIndex === lastPageIndex
      ? firstPageLabel
      : `${firstPageLabel}–${input.session.getPageLabel?.(lastPageIndex) ?? String(lastPageIndex + PDF_PAGE_NUMBER_OFFSET)}`
  const tocLabel = input.session.getTocLabel?.(firstPageIndex)
  const rootBounds = input.root.getBoundingClientRect()
  return {
    selection: {
      text,
      anchor: validatedAnchor,
      selectionKey: readerTextAnchorKey(validatedAnchor),
      ...(tocLabel ? { tocLabel } : {}),
      pageLabel,
    },
    x: bounds.left + bounds.width / 2 - rootBounds.left,
    y: bounds.top - rootBounds.top,
  }
}

function annotationStyle(annotation: ReaderAnnotation): Partial<CSSStyleDeclaration> {
  const color = `var(${ANNOTATION_COLOR_TOKENS[annotation.color]})`
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
  return { backgroundColor: color, opacity: "0.34" }
}

function ensureAnnotationLayer(geometry: PdfPageViewGeometry): HTMLDivElement {
  const existing = geometry.div.querySelector<HTMLDivElement>(
    `:scope > .${PDF_ANNOTATION_LAYER_CLASS_NAME}`,
  )
  if (existing) {
    existing.replaceChildren()
    return existing
  }
  const layer = geometry.div.ownerDocument.createElement("div")
  layer.className = PDF_ANNOTATION_LAYER_CLASS_NAME
  layer.setAttribute("aria-label", "Reader annotations")
  Object.assign(layer.style, {
    position: "absolute",
    inset: "0",
    overflow: "hidden",
    pointerEvents: "none",
    zIndex: PDF_ANNOTATION_LAYER_Z_INDEX,
  })
  geometry.div.append(layer)
  return layer
}

function ensureSelectionLayer(geometry: PdfPageViewGeometry): HTMLDivElement {
  const existing = geometry.div.querySelector<HTMLDivElement>(
    `:scope > .${PDF_SELECTION_LAYER_CLASS_NAME}`,
  )
  if (existing) {
    existing.replaceChildren()
    return existing
  }
  const layer = geometry.div.ownerDocument.createElement("div")
  layer.className = PDF_SELECTION_LAYER_CLASS_NAME
  layer.setAttribute("aria-hidden", "true")
  Object.assign(layer.style, {
    position: "absolute",
    inset: "0",
    overflow: "hidden",
    pointerEvents: "none",
    userSelect: "none",
    zIndex: PDF_SELECTION_LAYER_Z_INDEX,
  })
  geometry.div.append(layer)
  return layer
}

function ensureSearchLayer(geometry: PdfPageViewGeometry): HTMLDivElement {
  const existing = geometry.div.querySelector<HTMLDivElement>(
    `:scope > .${PDF_SEARCH_LAYER_CLASS_NAME}`,
  )
  if (existing) {
    existing.replaceChildren()
    return existing
  }
  const layer = geometry.div.ownerDocument.createElement("div")
  layer.className = PDF_SEARCH_LAYER_CLASS_NAME
  layer.setAttribute("aria-hidden", "true")
  Object.assign(layer.style, {
    position: "absolute",
    inset: "0",
    overflow: "hidden",
    pointerEvents: "none",
    userSelect: "none",
    zIndex: PDF_SEARCH_LAYER_Z_INDEX,
  })
  geometry.div.append(layer)
  return layer
}

function layerOffset(
  geometry: PdfPageViewGeometry,
  layer: HTMLDivElement,
): { left: number; top: number } {
  const textBounds = geometry.textLayerDiv.getBoundingClientRect()
  const layerBounds = layer.getBoundingClientRect()
  return {
    left: textBounds.left - layerBounds.left,
    top: textBounds.top - layerBounds.top,
  }
}

function annotationMark(input: {
  annotation: ReaderAnnotation
  geometry: PdfPageViewGeometry
  bounds: { left: number; top: number; width: number; height: number }
  layerOffset: { left: number; top: number }
  layer: HTMLDivElement
  first: boolean
  root: HTMLElement
  onActivate: (activation: PdfAnnotationActivation) => void
}): HTMLElement {
  let mark: HTMLElement
  if (input.first) {
    const button = input.layer.ownerDocument.createElement("button")
    button.type = "button"
    button.setAttribute(
      "aria-label",
      input.annotation.note.trim()
        ? `Annotation with note: ${input.annotation.text}`
        : `Annotation: ${input.annotation.text}`,
    )
    mark = button
  } else {
    const continuation = input.layer.ownerDocument.createElement("span")
    continuation.setAttribute("aria-hidden", "true")
    mark = continuation
  }
  mark.className = PDF_ANNOTATION_MARK_CLASS_NAME
  mark.dataset.annotationId = input.annotation.id
  Object.assign(mark.style, {
    position: "absolute",
    left: `${input.layerOffset.left + input.bounds.left}px`,
    top: `${input.layerOffset.top + input.bounds.top}px`,
    width: `${input.bounds.width}px`,
    height: `${input.bounds.height}px`,
    padding: "0",
    border: "0",
    appearance: "none",
    backgroundColor: "transparent",
    cursor: "pointer",
    pointerEvents: "auto",
    ...annotationStyle(input.annotation),
  })
  if (input.first && input.annotation.note.trim()) {
    mark.style.boxShadow = `inset 3px 0 0 var(${ANNOTATION_COLOR_TOKENS[input.annotation.color]})`
  }
  mark.addEventListener("click", (event) => {
    event.preventDefault()
    event.stopPropagation()
    const markBounds = mark.getBoundingClientRect()
    const rootBounds = input.root.getBoundingClientRect()
    input.onActivate({
      annotationId: input.annotation.id,
      x: markBounds.left + markBounds.width / 2 - rootBounds.left,
      y: markBounds.top - rootBounds.top,
    })
  })
  return mark
}

export type PdfAnnotationsByPage = ReadonlyMap<number, readonly ReaderAnnotation[]>

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

function renderPdfAnnotationPage(input: {
  root: HTMLElement
  session: PdfPageGeometryProvider
  pageIndex: number
  annotations: readonly ReaderAnnotation[]
  onActivate: (activation: PdfAnnotationActivation) => void
}): void {
  const geometry = input.session.getPageGeometry(input.pageIndex)
  if (!geometry) return
  const existingLayer = geometry.div.querySelector<HTMLDivElement>(
    `:scope > .${PDF_ANNOTATION_LAYER_CLASS_NAME}`,
  )
  if (input.annotations.length === 0) {
    existingLayer?.replaceChildren()
    return
  }
  const layer = ensureAnnotationLayer(geometry)
  const offset = layerOffset(geometry, layer)
  for (const annotation of input.annotations) {
    if (annotation.anchor.kind !== "pdf-text") continue
    let first = true
    for (const segment of annotation.anchor.segments) {
      if (segment.pageIndex !== input.pageIndex) continue
      for (const quad of segment.quads) {
        const bounds = viewportBoundsFromPdfQuad(
          quad,
          geometry.viewport,
          geometry.cropBoxOrigin,
        )
        if (!bounds || bounds.width <= 0 || bounds.height <= 0) continue
        layer.append(
          annotationMark({
            annotation,
            geometry,
            bounds,
            layerOffset: offset,
            layer,
            first,
            root: input.root,
            onActivate: input.onActivate,
          }),
        )
        first = false
      }
    }
  }
}

function renderPdfSelectionPage(input: {
  session: PdfPageGeometryProvider
  pageIndex: number
  selection: ReaderSelection
}): void {
  const geometry = input.session.getPageGeometry(input.pageIndex)
  if (!geometry || input.selection.anchor.kind !== "pdf-text") return
  const existingLayer = geometry.div.querySelector<HTMLDivElement>(
    `:scope > .${PDF_SELECTION_LAYER_CLASS_NAME}`,
  )
  const segments = input.selection.anchor.segments.filter(
    (segment) => segment.pageIndex === input.pageIndex,
  )
  if (segments.length === 0) {
    existingLayer?.remove()
    return
  }

  const layer = ensureSelectionLayer(geometry)
  const offset = layerOffset(geometry, layer)
  for (const segment of segments) {
    for (const quad of segment.quads) {
      const bounds = viewportBoundsFromPdfQuad(
        quad,
        geometry.viewport,
        geometry.cropBoxOrigin,
      )
      if (!bounds || bounds.width <= 0 || bounds.height <= 0) continue
      const mark = layer.ownerDocument.createElement("div")
      mark.className = PDF_SELECTION_MARK_CLASS_NAME
      Object.assign(mark.style, {
        position: "absolute",
        left: `${offset.left + bounds.left}px`,
        top: `${offset.top + bounds.top}px`,
        width: `${bounds.width}px`,
        height: `${bounds.height}px`,
        backgroundColor: "var(--surface-info-base)",
        opacity: PDF_SELECTION_MARK_OPACITY,
        pointerEvents: "none",
      })
      layer.append(mark)
    }
  }
}

function renderPdfSearchResultPage(input: {
  session: PdfPageGeometryProvider
  pageIndex: number
  result: ReaderSearchResult
}): void {
  const geometry = input.session.getPageGeometry(input.pageIndex)
  if (!geometry || input.result.anchor.kind !== "pdf-text") return
  const existingLayer = geometry.div.querySelector<HTMLDivElement>(
    `:scope > .${PDF_SEARCH_LAYER_CLASS_NAME}`,
  )
  const segments = input.result.anchor.segments.filter(
    (segment) => segment.pageIndex === input.pageIndex,
  )
  if (segments.length === 0) {
    existingLayer?.remove()
    return
  }

  const layer = ensureSearchLayer(geometry)
  const offset = layerOffset(geometry, layer)
  for (const segment of segments) {
    for (const quad of segment.quads) {
      const bounds = viewportBoundsFromPdfQuad(
        quad,
        geometry.viewport,
        geometry.cropBoxOrigin,
      )
      if (!bounds || bounds.width <= 0 || bounds.height <= 0) continue
      const mark = layer.ownerDocument.createElement("div")
      mark.className = PDF_SEARCH_MARK_CLASS_NAME
      Object.assign(mark.style, {
        position: "absolute",
        left: `${offset.left + bounds.left}px`,
        top: `${offset.top + bounds.top}px`,
        width: `${bounds.width}px`,
        height: `${bounds.height}px`,
        backgroundColor: "var(--surface-warning-base)",
        opacity: PDF_SEARCH_MARK_OPACITY,
        pointerEvents: "none",
      })
      layer.append(mark)
    }
  }
}

export function renderPdfSelection(input: {
  root: HTMLElement
  session: PdfPageGeometryProvider
  selection: ReaderSelection | undefined
  pageIndex?: number
}): void {
  if (!input.selection || input.selection.anchor.kind !== "pdf-text") {
    input.root
      .querySelectorAll<HTMLElement>(`.${PDF_SELECTION_LAYER_CLASS_NAME}`)
      .forEach((layer) => layer.remove())
    return
  }

  if (input.pageIndex !== undefined) {
    renderPdfSelectionPage({
      session: input.session,
      pageIndex: input.pageIndex,
      selection: input.selection,
    })
    return
  }

  input.root
    .querySelectorAll<HTMLElement>(`.${PDF_SELECTION_LAYER_CLASS_NAME}`)
    .forEach((layer) => layer.remove())
  const pageIndexes = new Set(
    input.selection.anchor.segments.map((segment) => segment.pageIndex),
  )
  for (const pageIndex of pageIndexes) {
    renderPdfSelectionPage({ session: input.session, pageIndex, selection: input.selection })
  }
}

export function renderPdfSearchResult(input: {
  root: HTMLElement
  session: PdfPageGeometryProvider
  result: ReaderSearchResult | undefined
  pageIndex?: number
}): void {
  if (!input.result || input.result.anchor.kind !== "pdf-text") {
    removePdfSearchLayers(input.root)
    return
  }

  if (input.pageIndex !== undefined) {
    renderPdfSearchResultPage({
      session: input.session,
      pageIndex: input.pageIndex,
      result: input.result,
    })
    return
  }

  removePdfSearchLayers(input.root)
  const pageIndexes = new Set(
    input.result.anchor.segments.map((segment) => segment.pageIndex),
  )
  for (const pageIndex of pageIndexes) {
    renderPdfSearchResultPage({
      session: input.session,
      pageIndex,
      result: input.result,
    })
  }
}

export function renderPdfAnnotations(input: {
  root: HTMLElement
  session: PdfPageGeometryProvider
  annotationsByPage: PdfAnnotationsByPage
  pageIndex?: number
  onActivate: (activation: PdfAnnotationActivation) => void
}): void {
  if (input.pageIndex !== undefined) {
    renderPdfAnnotationPage({
      root: input.root,
      session: input.session,
      pageIndex: input.pageIndex,
      annotations: input.annotationsByPage.get(input.pageIndex) ?? [],
      onActivate: input.onActivate,
    })
    return
  }
  input.root
    .querySelectorAll<HTMLElement>(`.${PDF_ANNOTATION_LAYER_CLASS_NAME}`)
    .forEach((layer) => layer.replaceChildren())
  for (const [pageIndex, annotations] of input.annotationsByPage) {
    renderPdfAnnotationPage({
      root: input.root,
      session: input.session,
      pageIndex,
      annotations,
      onActivate: input.onActivate,
    })
  }
}

export function clearPdfSelection(root: HTMLElement): void {
  const selection = root.ownerDocument.getSelection()
  if (selection && selectionBelongsToRoot(selection, root)) selection.removeAllRanges()
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
