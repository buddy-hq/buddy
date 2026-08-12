import {
  MAX_PDF_QUADS_PER_SEGMENT,
  MAX_PDF_QUOTE_LENGTH,
  MAX_PDF_TEXT_SEGMENTS,
  readReaderTextAnchor,
  readerTextAnchorKey,
  type PdfTextAnchor,
} from "@buddy/reader-contract"
import type { ReaderSelection } from "../reader-types"
import { pdfQuadFromClientRect, type PdfPageGeometryProvider } from "./pdf-geometry"
import { collectRangeTextRects, rectCoordinates } from "./pdf-text-rects"

const PDF_PAGE_NUMBER_OFFSET = 1
const PDF_QUOTE_CONTEXT_LENGTH = 96
const PDF_PAGE_SELECTOR = ".pdfViewer .page[data-page-number]"
const PDF_TEXT_LAYER_SELECTOR = ".textLayer"
const PDF_INTERACTIVE_TARGET_SELECTOR = [
  "a[href]",
  "button",
  "input",
  "label",
  "select",
  "textarea",
  "summary",
  "[contenteditable]:not([contenteditable='false'])",
  "[role='button']",
  "[role='link']",
  "[role='checkbox']",
  "[role='radio']",
  "[role='switch']",
  "[role='textbox']",
  "[role='combobox']",
  "[role='listbox']",
  "[role='slider']",
].join(",")

type PdfClientPoint = {
  x: number
  y: number
}

type PdfTextCaret = {
  node: Text
  offset: number
}

export type PdfWhitespaceSelectionDrag = {
  pointerId: number
  anchor: PdfTextCaret | undefined
}

type PdfSelectionPointer = {
  target: EventTarget | null
  pointerId: number
  clientX: number
  clientY: number
}

export function isPdfSelectionEventTarget(
  target: EventTarget | null,
  viewerContainer: HTMLElement,
): boolean {
  return target instanceof Node && viewerContainer.contains(target)
}

function textNodeAtBoundary(node: Node, offset: number): PdfTextCaret | undefined {
  if (node instanceof Text) {
    return { node, offset: Math.min(Math.max(offset, 0), node.length) }
  }
  const after = node.childNodes.item(offset)
  const before = offset > 0 ? node.childNodes.item(offset - 1) : null
  const walkerRoot = after ?? before
  if (!walkerRoot) return undefined
  const walker = node.ownerDocument?.createTreeWalker(walkerRoot, NodeFilter.SHOW_TEXT)
  const text = walkerRoot instanceof Text ? walkerRoot : walker?.nextNode()
  if (!(text instanceof Text)) return undefined
  return { node: text, offset: after ? 0 : text.length }
}

function caretFromPoint(document: Document, point: PdfClientPoint): PdfTextCaret | undefined {
  const caretPositionFromPoint: unknown = Reflect.get(document, "caretPositionFromPoint")
  if (typeof caretPositionFromPoint === "function") {
    const position: unknown = Reflect.apply(caretPositionFromPoint, document, [point.x, point.y])
    if (typeof position === "object" && position !== null) {
      const offsetNode: unknown = Reflect.get(position, "offsetNode")
      const offset: unknown = Reflect.get(position, "offset")
      if (offsetNode instanceof Node && typeof offset === "number") {
        return textNodeAtBoundary(offsetNode, offset)
      }
    }
  }

  const caretRangeFromPoint: unknown = Reflect.get(document, "caretRangeFromPoint")
  if (typeof caretRangeFromPoint !== "function") return undefined
  const range: unknown = Reflect.apply(caretRangeFromPoint, document, [point.x, point.y])
  if (!(range instanceof Range)) return undefined
  return textNodeAtBoundary(range.startContainer, range.startOffset)
}

function textNodeContainsPoint(node: Text, point: PdfClientPoint): boolean {
  const range = node.ownerDocument.createRange()
  range.selectNodeContents(node)
  try {
    return Array.from(range.getClientRects()).some(
      (rect) =>
        rect.width > 0 &&
        rect.height > 0 &&
        point.x >= rect.left &&
        point.x <= rect.right &&
        point.y >= rect.top &&
        point.y <= rect.bottom,
    )
  } finally {
    range.detach()
  }
}

function pdfTextCaretAtPoint(root: HTMLElement, point: PdfClientPoint): PdfTextCaret | undefined {
  const caret = caretFromPoint(root.ownerDocument, point)
  if (
    !caret ||
    !root.contains(caret.node) ||
    !caret.node.parentElement?.closest(PDF_TEXT_LAYER_SELECTOR)
  ) {
    return undefined
  }
  return textNodeContainsPoint(caret.node, point) ? caret : undefined
}

function pdfPageForTarget(root: HTMLElement, target: EventTarget | null): HTMLElement | undefined {
  const element = target instanceof Element ? target : target instanceof Node ? target.parentElement : null
  const page = element?.closest<HTMLElement>(PDF_PAGE_SELECTOR)
  return page && root.contains(page) ? page : undefined
}

function isPdfInteractiveTarget(target: EventTarget | null, page: HTMLElement): boolean {
  const element = target instanceof Element ? target : target instanceof Node ? target.parentElement : null
  const interactive = element?.closest(PDF_INTERACTIVE_TARGET_SELECTOR)
  return Boolean(interactive && page.contains(interactive))
}

/**
 * Native browser selection has no anchor when a drag starts on blank canvas.
 * Track that gesture only for whitespace inside a rendered PDF page; once it
 * crosses real text, the first intercepted caret becomes the selection anchor.
 */
export function beginPdfWhitespaceSelectionDrag(input: {
  root: HTMLElement
  pointer: PdfSelectionPointer
}): PdfWhitespaceSelectionDrag | undefined {
  const point = { x: input.pointer.clientX, y: input.pointer.clientY }
  const page = pdfPageForTarget(input.root, input.pointer.target)
  if (!page || isPdfInteractiveTarget(input.pointer.target, page)) return undefined
  if (pdfTextCaretAtPoint(input.root, point)) return undefined
  return { pointerId: input.pointer.pointerId, anchor: undefined }
}

/** Extends a whitespace-origin drag once it intersects PDF text. */
export function updatePdfWhitespaceSelectionDrag(input: {
  root: HTMLElement
  drag: PdfWhitespaceSelectionDrag
  pointer: PdfSelectionPointer
}): boolean {
  if (input.pointer.pointerId !== input.drag.pointerId) return false
  const focus = pdfTextCaretAtPoint(input.root, {
    x: input.pointer.clientX,
    y: input.pointer.clientY,
  })
  if (!focus) return false
  input.drag.anchor ??= focus
  const selection = input.root.ownerDocument.getSelection()
  if (!selection) return false
  selection.setBaseAndExtent(
    input.drag.anchor.node,
    input.drag.anchor.offset,
    focus.node,
    focus.offset,
  )
  return true
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

/**
 * Turns the live DOM selection into the canonical PDF anchor Buddy persists and
 * repaints. Geometry comes from the selected text nodes only, merged per line,
 * so the structural boxes PDF.js parks at the page origin never reach the anchor.
 */
export function readPdfSelection(input: {
  root: HTMLElement
  session: PdfPageGeometryProvider
  onLimitExceeded?: () => void
}): ReaderSelection | undefined {
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
      const quads = collectRangeTextRects(pageRange, geometry.textLayerDiv)
        .map((rect) =>
          pdfQuadFromClientRect(
            rect,
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
  const firstPageLabel =
    input.session.getPageLabel?.(firstPageIndex) ?? String(firstPageIndex + PDF_PAGE_NUMBER_OFFSET)
  const pageLabel =
    firstPageIndex === lastPageIndex
      ? firstPageLabel
      : `${firstPageLabel}–${input.session.getPageLabel?.(lastPageIndex) ?? String(lastPageIndex + PDF_PAGE_NUMBER_OFFSET)}`
  const tocLabel = input.session.getTocLabel?.(firstPageIndex)
  return {
    text,
    anchor: validatedAnchor,
    selectionKey: readerTextAnchorKey(validatedAnchor),
    ...(tocLabel ? { tocLabel } : {}),
    pageLabel,
  }
}

export function clearPdfSelection(root: HTMLElement): void {
  const selection = root.ownerDocument.getSelection()
  if (selection && selectionBelongsToRoot(selection, root)) selection.removeAllRanges()
}
