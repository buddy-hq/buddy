import type { WhiteboardBounds, WhiteboardRenderReport } from "./types"

const MAX_LAYOUT_DIGEST_ISSUES = 10
const CONTAINER_PADDING = 12
const MIN_TEXT_OVERFLOW_AREA_RATIO = 0.08
const MIN_TEXT_OVERFLOW_PIXELS = 6

type WhiteboardLayoutDigestIssue =
  | {
      code: "text_overflow"
      id: string
      containerId: string
      outsideRatio: number
      maxOverflowPx: number
      suggested: string
    }
  | {
      code: "overlap"
      a: string
      b: string
      suggested: { type: "translate"; ids: string; dx: number; dy: number }
    }

type WhiteboardLayoutDigest = {
  status: "ok" | "issues"
  canvas: { width: number; height: number; zoom: number }
  contentBounds: WhiteboardBounds | null
  issues?: WhiteboardLayoutDigestIssue[]
  issuesTruncated?: boolean
}

function roundBounds(bounds: WhiteboardBounds): WhiteboardBounds {
  return {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.round(bounds.width),
    height: Math.round(bounds.height),
  }
}

function right(bounds: WhiteboardBounds): number {
  return bounds.x + bounds.width
}

function bottom(bounds: WhiteboardBounds): number {
  return bounds.y + bounds.height
}

function overlaps(a: WhiteboardBounds, b: WhiteboardBounds): boolean {
  return a.x < right(b) && right(a) > b.x && a.y < bottom(b) && bottom(a) > b.y
}

function area(bounds: WhiteboardBounds): number {
  return bounds.width * bounds.height
}

function intersectionArea(a: WhiteboardBounds, b: WhiteboardBounds): number {
  const left = Math.max(a.x, b.x)
  const top = Math.max(a.y, b.y)
  const intersectionRight = Math.min(right(a), right(b))
  const intersectionBottom = Math.min(bottom(a), bottom(b))
  if (intersectionRight <= left || intersectionBottom <= top) return 0
  return (intersectionRight - left) * (intersectionBottom - top)
}

function maxOverflowPixels(bounds: WhiteboardBounds, container: WhiteboardBounds): number {
  return Math.max(
    container.x - bounds.x,
    bounds.x + bounds.width - right(container),
    container.y - bounds.y,
    bounds.y + bounds.height - bottom(container),
    0,
  )
}

function readRenderedTextOverflow(input: {
  bounds: WhiteboardBounds
  container: WhiteboardBounds
}): { outsideRatio: number; maxOverflowPx: number } | undefined {
  const textArea = area(input.bounds)
  if (textArea <= 0) return undefined
  const outsideRatio = 1 - intersectionArea(input.bounds, input.container) / textArea
  const maxOverflowPx = maxOverflowPixels(input.bounds, input.container)
  if (
    outsideRatio < MIN_TEXT_OVERFLOW_AREA_RATIO ||
    maxOverflowPx < MIN_TEXT_OVERFLOW_PIXELS
  ) {
    return undefined
  }
  return {
    outsideRatio: Math.round(outsideRatio * 100) / 100,
    maxOverflowPx: Math.round(maxOverflowPx),
  }
}

function isTextLike(element: WhiteboardRenderReport["elements"][number]): boolean {
  return element.type === "text" || typeof element.text === "string"
}

function suggestedTranslate(
  a: WhiteboardRenderReport["elements"][number],
  b: WhiteboardRenderReport["elements"][number],
): { type: "translate"; ids: string; dx: number; dy: number } {
  const moveDown = bottom(a.bounds) <= bottom(b.bounds)
  const dy = moveDown
    ? Math.max(40, Math.round(bottom(b.bounds) - a.bounds.y + CONTAINER_PADDING))
    : -Math.max(40, Math.round(bottom(a.bounds) - b.bounds.y + CONTAINER_PADDING))
  return {
    type: "translate",
    ids: a.containerId ?? a.id,
    dx: 0,
    dy,
  }
}

function buildWhiteboardLayoutDigest(
  report: WhiteboardRenderReport | undefined,
): WhiteboardLayoutDigest | undefined {
  if (!report) return undefined
  const elementsByID = new Map(report.elements.map((element) => [element.id, element] as const))
  const issues: WhiteboardLayoutDigestIssue[] = []

  for (const element of report.elements) {
    if (!isTextLike(element) || !element.containerId) continue
    const container = elementsByID.get(element.containerId)
    if (!container) continue
    const overflow = readRenderedTextOverflow({
      bounds: element.bounds,
      container: container.bounds,
    })
    if (!overflow) continue
    issues.push({
      code: "text_overflow",
      id: element.id,
      containerId: element.containerId,
      outsideRatio: overflow.outsideRatio,
      maxOverflowPx: overflow.maxOverflowPx,
      suggested: "resize container wider or shorten label",
    })
  }

  const textLikeElements = report.elements.filter(isTextLike)
  for (let textIndex = 0; textIndex < textLikeElements.length; textIndex += 1) {
    const textElement = textLikeElements[textIndex]
    for (const otherElement of report.elements) {
      if (textElement.id === otherElement.id) continue
      if (textElement.containerId === otherElement.id) continue
      if (otherElement.containerId === textElement.id) continue
      if (textElement.containerId && textElement.containerId === otherElement.containerId) continue
      if (!overlaps(textElement.bounds, otherElement.bounds)) continue
      issues.push({
        code: "overlap",
        a: textElement.id,
        b: otherElement.id,
        suggested: suggestedTranslate(textElement, otherElement),
      })
      break
    }
  }

  const shown = issues.slice(0, MAX_LAYOUT_DIGEST_ISSUES)
  return {
    status: shown.length > 0 ? "issues" : "ok",
    canvas: {
      width: Math.round(report.canvas.width),
      height: Math.round(report.canvas.height),
      zoom: Math.round(report.canvas.zoom * 100) / 100,
    },
    contentBounds: report.contentBounds ? roundBounds(report.contentBounds) : null,
    ...(shown.length > 0 ? { issues: shown } : {}),
    ...(issues.length > shown.length ? { issuesTruncated: true } : {}),
  }
}

export { buildWhiteboardLayoutDigest }
export type { WhiteboardLayoutDigest }
