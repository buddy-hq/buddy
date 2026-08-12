import type { RectCoordinates } from "./pdf-geometry"

/**
 * `Range.getClientRects()` over a PDF.js text layer reports more than glyphs.
 * The layer positions every child absolutely, so the `<br>` line breaks it
 * inserts collapse onto the page origin and the `endOfContent` sentinel spans
 * the whole page while a drag is in flight. Both land in the rect list and paint
 * as stray bands far away from the selected words.
 *
 * Reading rects from the text nodes inside the range keeps the geometry on the
 * glyphs, and merging them per line turns the per-span fragments PDF.js emits
 * into one band per visual line, so highlights read as continuous strokes
 * instead of a mosaic of overlapping tiles.
 */

/** Share of the shorter rect that must overlap vertically to count as one line. */
const PDF_TEXT_LINE_OVERLAP_RATIO = 0.5
/** Horizontal gap, relative to line height, still treated as one continuous run. */
const PDF_TEXT_LINE_JOIN_RATIO = 0.35
const PDF_TEXT_LINE_JOIN_MIN_PX = 1
const PDF_TEXT_LINE_JOIN_MAX_PX = 6

type PdfTextLine = {
  top: number
  bottom: number
  rects: RectCoordinates[]
}

export function rectCoordinates(rect: DOMRect | DOMRectReadOnly): RectCoordinates {
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
  }
}

type VerticalSpan = {
  top: number
  bottom: number
}

export function verticalOverlapRatio(left: VerticalSpan, right: VerticalSpan): number {
  const overlap = Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top)
  if (overlap <= 0) return 0
  const shortest = Math.min(left.bottom - left.top, right.bottom - right.top)
  return shortest <= 0 ? 0 : overlap / shortest
}

export function unionRects(rects: readonly RectCoordinates[]): RectCoordinates | undefined {
  const first = rects[0]
  if (!first) return undefined
  return rects.reduce<RectCoordinates>(
    (union, rect) => ({
      left: Math.min(union.left, rect.left),
      top: Math.min(union.top, rect.top),
      right: Math.max(union.right, rect.right),
      bottom: Math.max(union.bottom, rect.bottom),
    }),
    first,
  )
}

/** The band the overlay anchors to: the topmost visual line of a rect list. */
export function firstLineBounds(rects: readonly RectCoordinates[]): RectCoordinates | undefined {
  const ordered = sortedRects(rects)
  const first = ordered[0]
  if (!first) return undefined
  return unionRects(
    ordered.filter((rect) => verticalOverlapRatio(first, rect) >= PDF_TEXT_LINE_OVERLAP_RATIO),
  )
}

function sortedRects(rects: readonly RectCoordinates[]): RectCoordinates[] {
  return rects.toSorted((left, right) => left.top - right.top || left.left - right.left)
}

function lineRuns(line: PdfTextLine): RectCoordinates[] {
  const tolerance = Math.min(
    PDF_TEXT_LINE_JOIN_MAX_PX,
    Math.max(PDF_TEXT_LINE_JOIN_MIN_PX, (line.bottom - line.top) * PDF_TEXT_LINE_JOIN_RATIO),
  )
  const runs: RectCoordinates[] = []
  for (const rect of line.rects.toSorted((left, right) => left.left - right.left)) {
    const current = runs.at(-1)
    if (current && rect.left - current.right <= tolerance) {
      current.right = Math.max(current.right, rect.right)
      continue
    }
    runs.push({ left: rect.left, top: line.top, right: rect.right, bottom: line.bottom })
  }
  return runs
}

/** Collapse fragmented text rects into one rect per contiguous run per line. */
export function mergeTextLineRects(rects: readonly RectCoordinates[]): RectCoordinates[] {
  const lines: PdfTextLine[] = []
  for (const rect of sortedRects(rects)) {
    if (rect.right <= rect.left || rect.bottom <= rect.top) continue
    const line = lines.find(
      (candidate) => verticalOverlapRatio(candidate, rect) >= PDF_TEXT_LINE_OVERLAP_RATIO,
    )
    if (!line) {
      lines.push({ top: rect.top, bottom: rect.bottom, rects: [rect] })
      continue
    }
    line.top = Math.min(line.top, rect.top)
    line.bottom = Math.max(line.bottom, rect.bottom)
    line.rects.push(rect)
  }
  return sortedRects(lines.flatMap(lineRuns))
}

function rangesOverlap(range: Range, candidate: Range): boolean {
  try {
    return (
      range.compareBoundaryPoints(Range.START_TO_END, candidate) > 0 &&
      range.compareBoundaryPoints(Range.END_TO_START, candidate) < 0
    )
  } catch {
    return false
  }
}

/** The parts of `range` that fall on text nodes inside `root`, one range per node. */
function textNodeRanges(range: Range, root: Element): Range[] {
  const ownerDocument = root.ownerDocument
  const walker = ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const ranges: Range[] = []
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (!(node instanceof Text) || node.length === 0) continue
    const nodeRange = ownerDocument.createRange()
    nodeRange.selectNodeContents(node)
    if (!rangesOverlap(range, nodeRange)) {
      nodeRange.detach()
      continue
    }
    if (node === range.startContainer) nodeRange.setStart(node, range.startOffset)
    if (node === range.endContainer) nodeRange.setEnd(node, range.endOffset)
    if (nodeRange.collapsed) {
      nodeRange.detach()
      continue
    }
    ranges.push(nodeRange)
  }
  return ranges
}

/** Glyph geometry for a range, merged into one rect per line run. */
export function collectRangeTextRects(range: Range, root: Element): RectCoordinates[] {
  const rects: RectCoordinates[] = []
  for (const nodeRange of textNodeRanges(range, root)) {
    try {
      for (const clientRect of Array.from(nodeRange.getClientRects())) {
        if (clientRect.width <= 0 || clientRect.height <= 0) continue
        rects.push(rectCoordinates(clientRect))
      }
    } finally {
      nodeRange.detach()
    }
  }
  return mergeTextLineRects(rects)
}
