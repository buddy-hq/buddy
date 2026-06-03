import type { WhiteboardBounds, WhiteboardRenderReport } from "./types"

const MAX_LAYOUT_DIGEST_ISSUES = 10
const MIN_TEXT_OVERFLOW_AREA_RATIO = 0.08
const MIN_TEXT_OVERFLOW_PIXELS = 6
const MIN_TEXT_OCCLUSION_PIXELS = 4
const MIN_TEXT_OCCLUDER_OPACITY = 85
const MIN_READABLE_RENDERED_FONT_PIXELS = 12
const RENDERED_FONT_PIXEL_PRECISION = 10
const CONTAINER_LIKE_SHAPE_TYPES = new Set(["diamond", "ellipse", "rectangle"])
const OPAQUE_FILL_STYLE = "solid"
const TRANSPARENT_BACKGROUND_COLOR = "transparent"

type WhiteboardRenderReportElement = WhiteboardRenderReport["elements"][number]
type OverflowDirection = "horizontal" | "vertical" | "both"
type SeparationAxis = "horizontal" | "vertical"
type WhiteboardLayoutSize = { width: number; height: number }
type WhiteboardLayoutOverflowPixels = { x?: number; y?: number }
type WhiteboardLayoutIssue =
  | {
      code: "text_too_small"
      id: string
      fontSize: number
      renderedFontPx: number
      zoom: number
      repairHint: string
    }
  | {
      code: "text_overflow"
      id: string
      containerId: string
      overflowDirection: OverflowDirection
      overflowPx: WhiteboardLayoutOverflowPixels
      elementSize: WhiteboardLayoutSize
      containerSize: WhiteboardLayoutSize
      repairHint: string
    }
  | {
      code: "text_occluded"
      textId: string
      occluderId: string
      overlapPx: { x: number; y: number }
      occluderOpacity: number
      repairHint: string
    }
  | {
      code: "sibling_collision"
      a: string
      b: string
      separationAxis: SeparationAxis
      overlapPx: { x: number; y: number }
      moveTogetherId?: string
      repairHint: string
    }

type WhiteboardLayoutDigest = {
  status: "ok" | "issues"
  canvas: { width: number; height: number; zoom: number }
  contentBounds: WhiteboardBounds | null
  issues?: WhiteboardLayoutIssue[]
  issuesTruncated?: boolean
}

type WhiteboardLayoutDigestOptions = {
  priorityElementIDs?: ReadonlySet<string>
}

type LayoutContext = {
  report: WhiteboardRenderReport
  elementsByID: Map<string, WhiteboardRenderReportElement>
  renderOrderByID: Map<string, number>
  textElements: WhiteboardRenderReportElement[]
}

type RenderedTextOverflow = {
  overflowDirection: OverflowDirection
  overflowPx: WhiteboardLayoutOverflowPixels
  elementSize: WhiteboardLayoutSize
  containerSize: WhiteboardLayoutSize
  repairHint: string
}

function buildWhiteboardLayoutDigest(
  report: WhiteboardRenderReport | undefined,
  options: WhiteboardLayoutDigestOptions = {},
): WhiteboardLayoutDigest | undefined {
  if (!report) return undefined
  const context = createLayoutContext(report)

  // Keep this as an explicit checklist. Every pass uses frontend-rendered bounds only.
  const issues = [
    ...findTextTooSmallAtCurrentZoom(context),
    ...findBoundTextOverflow(context),
    ...findImplicitContainerTextOverflow(context),
    ...findTextOcclusions(context),
    ...findSiblingCollisions(context),
  ]

  return buildDigestFromIssues({
    report,
    issues: prioritizeLayoutIssues({
      issues,
      priorityElementIDs: options.priorityElementIDs,
    }),
  })
}

function createLayoutContext(report: WhiteboardRenderReport): LayoutContext {
  return {
    report,
    elementsByID: new Map(report.elements.map((element) => [element.id, element] as const)),
    renderOrderByID: new Map(report.elements.map((element, index) => [element.id, index] as const)),
    textElements: report.elements.filter(isTextLike),
  }
}

function findBoundTextOverflow(context: LayoutContext): WhiteboardLayoutIssue[] {
  const issues: WhiteboardLayoutIssue[] = []
  for (const textElement of context.textElements) {
    if (!textElement.containerId) continue
    const container = context.elementsByID.get(textElement.containerId)
    if (!container) continue
    const overflow = readRenderedTextOverflow({
      textBounds: textElement.bounds,
      containerBounds: container.bounds,
    })
    if (!overflow) continue
    issues.push(
      buildTextOverflowIssue({
        textElement,
        containerId: container.id,
        overflow,
      }),
    )
  }
  return issues
}

function findImplicitContainerTextOverflow(context: LayoutContext): WhiteboardLayoutIssue[] {
  const issues: WhiteboardLayoutIssue[] = []
  for (const textElement of context.textElements) {
    if (textElement.containerId) continue
    const container = readImplicitContainerForText({ context, textElement })
    if (!container) continue
    const overflow = readRenderedTextOverflow({
      textBounds: textElement.bounds,
      containerBounds: container.bounds,
    })
    if (!overflow) continue
    issues.push(
      buildTextOverflowIssue({
        textElement,
        containerId: container.id,
        overflow,
      }),
    )
  }
  return issues
}

function findSiblingCollisions(context: LayoutContext): WhiteboardLayoutIssue[] {
  const issues: WhiteboardLayoutIssue[] = []
  for (const textElement of context.textElements) {
    for (const otherElement of context.report.elements) {
      if (shouldSkipCollisionPair({ context, textElement, otherElement })) continue
      if (!boundsOverlap(textElement.bounds, otherElement.bounds)) continue
      issues.push(buildSiblingCollisionIssue({ textElement, otherElement }))
      break
    }
  }
  return issues
}

function buildDigestFromIssues(input: {
  report: WhiteboardRenderReport
  issues: WhiteboardLayoutIssue[]
}): WhiteboardLayoutDigest {
  const shown = input.issues.slice(0, MAX_LAYOUT_DIGEST_ISSUES)
  return {
    status: shown.length > 0 ? "issues" : "ok",
    canvas: {
      width: Math.round(input.report.canvas.width),
      height: Math.round(input.report.canvas.height),
      zoom: Math.round(input.report.canvas.zoom * 100) / 100,
    },
    contentBounds: input.report.contentBounds ? roundBounds(input.report.contentBounds) : null,
    ...(shown.length > 0 ? { issues: shown } : {}),
    ...(input.issues.length > shown.length ? { issuesTruncated: true } : {}),
  }
}

function prioritizeLayoutIssues(input: {
  issues: WhiteboardLayoutIssue[]
  priorityElementIDs: ReadonlySet<string> | undefined
}): WhiteboardLayoutIssue[] {
  const priorityElementIDs = input.priorityElementIDs
  if (!priorityElementIDs || priorityElementIDs.size === 0) {
    return input.issues
  }
  return input.issues.toSorted(
    (a, b) =>
      Number(layoutIssueTouchesAnyID(b, priorityElementIDs)) -
      Number(layoutIssueTouchesAnyID(a, priorityElementIDs)),
  )
}

function layoutIssueTouchesAnyID(issue: WhiteboardLayoutIssue, ids: ReadonlySet<string>): boolean {
  switch (issue.code) {
    case "text_too_small":
      return ids.has(issue.id)
    case "text_overflow":
      return ids.has(issue.id) || ids.has(issue.containerId)
    case "text_occluded":
      return ids.has(issue.textId) || ids.has(issue.occluderId)
    case "sibling_collision":
      return (
        ids.has(issue.a) ||
        ids.has(issue.b) ||
        (issue.moveTogetherId !== undefined && ids.has(issue.moveTogetherId))
      )
  }
}

function findTextTooSmallAtCurrentZoom(context: LayoutContext): WhiteboardLayoutIssue[] {
  const issues: WhiteboardLayoutIssue[] = []
  for (const textElement of context.textElements) {
    if (typeof textElement.fontSize !== "number" || !Number.isFinite(textElement.fontSize)) {
      continue
    }
    const renderedFontPx = textElement.fontSize * context.report.canvas.zoom
    if (renderedFontPx >= MIN_READABLE_RENDERED_FONT_PIXELS) continue
    issues.push({
      code: "text_too_small",
      id: textElement.id,
      fontSize: roundRenderedFontValue(textElement.fontSize),
      renderedFontPx: roundRenderedFontValue(renderedFontPx),
      zoom: Math.round(context.report.canvas.zoom * 100) / 100,
      repairHint:
        "At the current camera zoom this text renders too small and can look blurry. Increase font size, use a less dense local layout, or narrow the camera viewport.",
    })
  }
  return issues
}

function findTextOcclusions(context: LayoutContext): WhiteboardLayoutIssue[] {
  const issues: WhiteboardLayoutIssue[] = []
  for (const textElement of context.textElements) {
    for (let index = context.report.elements.length - 1; index >= 0; index -= 1) {
      const occluder = context.report.elements[index]
      if (!occluder) continue
      if (!isTextOccludedByOpaqueShape({ context, textElement, occluder })) continue
      const overlapSize = readIntersectionSize(textElement.bounds, occluder.bounds)
      if (
        overlapSize.width < MIN_TEXT_OCCLUSION_PIXELS ||
        overlapSize.height < MIN_TEXT_OCCLUSION_PIXELS
      ) {
        continue
      }
      issues.push({
        code: "text_occluded",
        textId: textElement.id,
        occluderId: occluder.id,
        overlapPx: {
          x: Math.round(overlapSize.width),
          y: Math.round(overlapSize.height),
        },
        occluderOpacity: readElementOpacity(occluder),
        repairHint:
          "A later solid filled shape covers this text. Redraw locally so the text is above the shape, or move/delete the occluding shape.",
      })
      break
    }
  }
  return issues
}

function buildTextOverflowIssue(input: {
  textElement: WhiteboardRenderReportElement
  containerId: string
  overflow: RenderedTextOverflow
}): WhiteboardLayoutIssue {
  return {
    code: "text_overflow",
    id: input.textElement.id,
    containerId: input.containerId,
    overflowDirection: input.overflow.overflowDirection,
    overflowPx: input.overflow.overflowPx,
    elementSize: input.overflow.elementSize,
    containerSize: input.overflow.containerSize,
    repairHint: input.overflow.repairHint,
  }
}

function buildSiblingCollisionIssue(input: {
  textElement: WhiteboardRenderReportElement
  otherElement: WhiteboardRenderReportElement
}): WhiteboardLayoutIssue {
  const overlapSize = readIntersectionSize(input.textElement.bounds, input.otherElement.bounds)
  const separationAxis = overlapSize.width <= overlapSize.height ? "horizontal" : "vertical"
  return {
    code: "sibling_collision",
    a: input.textElement.id,
    b: input.otherElement.id,
    separationAxis,
    overlapPx: {
      x: Math.round(overlapSize.width),
      y: Math.round(overlapSize.height),
    },
    ...(input.textElement.containerId ? { moveTogetherId: input.textElement.containerId } : {}),
    repairHint:
      separationAxis === "horizontal"
        ? "Rendered overlap is horizontally separable. Increase horizontal gap/width or shorten local text; increasing height alone will not separate these elements."
        : "Rendered overlap is vertically separable. Increase vertical gap or shorten/move the local content.",
  }
}

function shouldSkipCollisionPair(input: {
  context: LayoutContext
  textElement: WhiteboardRenderReportElement
  otherElement: WhiteboardRenderReportElement
}): boolean {
  if (input.textElement.id === input.otherElement.id) return true
  if (input.textElement.containerId === input.otherElement.id) return true
  if (input.otherElement.containerId === input.textElement.id) return true
  if (
    isTextOccludedByOpaqueShape({
      context: input.context,
      textElement: input.textElement,
      occluder: input.otherElement,
    })
  ) {
    return true
  }
  if (
    input.textElement.containerId &&
    input.textElement.containerId === input.otherElement.containerId
  ) {
    return true
  }
  return isTextAnchoredInEarlierContainerLikeShape({
    context: input.context,
    textElement: input.textElement,
    containerCandidate: input.otherElement,
  })
}

function readImplicitContainerForText(input: {
  context: LayoutContext
  textElement: WhiteboardRenderReportElement
}): WhiteboardRenderReportElement | undefined {
  let best: WhiteboardRenderReportElement | undefined
  for (const candidate of input.context.report.elements) {
    if (
      !isTextAnchoredInEarlierContainerLikeShape({
        context: input.context,
        textElement: input.textElement,
        containerCandidate: candidate,
      })
    ) {
      continue
    }
    if (!best || boundsArea(candidate.bounds) < boundsArea(best.bounds)) best = candidate
  }
  return best
}

function isTextAnchoredInEarlierContainerLikeShape(input: {
  context: LayoutContext
  textElement: WhiteboardRenderReportElement
  containerCandidate: WhiteboardRenderReportElement
}): boolean {
  return (
    input.textElement.id !== input.containerCandidate.id &&
    input.textElement.containerId !== input.containerCandidate.id &&
    isContainerLikeShape(input.containerCandidate) &&
    wasCandidateRenderedBeforeText(input) &&
    isTextAnchorInsideBounds(input.textElement.bounds, input.containerCandidate.bounds)
  )
}

function wasCandidateRenderedBeforeText(input: {
  context: LayoutContext
  textElement: WhiteboardRenderReportElement
  containerCandidate: WhiteboardRenderReportElement
}): boolean {
  const textOrder = input.context.renderOrderByID.get(input.textElement.id)
  const candidateOrder = input.context.renderOrderByID.get(input.containerCandidate.id)
  return textOrder !== undefined && candidateOrder !== undefined && candidateOrder <= textOrder
}

function readRenderedTextOverflow(input: {
  textBounds: WhiteboardBounds
  containerBounds: WhiteboardBounds
}): RenderedTextOverflow | undefined {
  const textArea = boundsArea(input.textBounds)
  if (textArea <= 0) return undefined
  const outsideRatio = 1 - readIntersectionArea(input.textBounds, input.containerBounds) / textArea
  const overflowPixels = readOverflowPixels(input)
  const maxOverflowPixels = Math.max(overflowPixels.x, overflowPixels.y)
  if (outsideRatio < MIN_TEXT_OVERFLOW_AREA_RATIO || maxOverflowPixels < MIN_TEXT_OVERFLOW_PIXELS) {
    return undefined
  }
  const overflowDirection = readOverflowDirection(overflowPixels)
  return {
    overflowDirection,
    overflowPx: compactOverflowPixels(overflowPixels),
    elementSize: roundSize(input.textBounds),
    containerSize: roundSize(input.containerBounds),
    repairHint: textOverflowRepairHint(overflowDirection),
  }
}

function readOverflowPixels(input: {
  textBounds: WhiteboardBounds
  containerBounds: WhiteboardBounds
}): { x: number; y: number } {
  return {
    x: Math.max(
      input.containerBounds.x - input.textBounds.x,
      right(input.textBounds) - right(input.containerBounds),
      0,
    ),
    y: Math.max(
      input.containerBounds.y - input.textBounds.y,
      bottom(input.textBounds) - bottom(input.containerBounds),
      0,
    ),
  }
}

function readOverflowDirection(overflowPx: { x: number; y: number }): OverflowDirection {
  const hasHorizontal = overflowPx.x >= MIN_TEXT_OVERFLOW_PIXELS
  const hasVertical = overflowPx.y >= MIN_TEXT_OVERFLOW_PIXELS
  if (hasHorizontal && hasVertical) return "both"
  if (hasHorizontal) return "horizontal"
  return "vertical"
}

function compactOverflowPixels(overflowPx: {
  x: number
  y: number
}): WhiteboardLayoutOverflowPixels {
  return {
    ...(overflowPx.x >= MIN_TEXT_OVERFLOW_PIXELS ? { x: Math.round(overflowPx.x) } : {}),
    ...(overflowPx.y >= MIN_TEXT_OVERFLOW_PIXELS ? { y: Math.round(overflowPx.y) } : {}),
  }
}

function textOverflowRepairHint(direction: OverflowDirection): string {
  switch (direction) {
    case "horizontal":
      return "Text extends past the container horizontally. Increase width/gap or shorten text; increasing height alone will not fix this."
    case "vertical":
      return "Text extends past the container vertically. Increase height or shorten/redraw the local content."
    case "both":
      return "Text extends past the container in both axes. Resize the local container in both dimensions or shorten/redraw the content."
  }
}

function isTextLike(element: WhiteboardRenderReportElement): boolean {
  return element.type === "text" || typeof element.text === "string"
}

function isContainerLikeShape(element: WhiteboardRenderReportElement): boolean {
  return CONTAINER_LIKE_SHAPE_TYPES.has(element.type) && !isTextLike(element)
}

function isTextOccludedByOpaqueShape(input: {
  context: LayoutContext
  textElement: WhiteboardRenderReportElement
  occluder: WhiteboardRenderReportElement
}): boolean {
  return (
    input.textElement.id !== input.occluder.id &&
    isElementRenderedAfterText({
      context: input.context,
      textElement: input.textElement,
      candidate: input.occluder,
    }) &&
    isOpaqueFilledShape(input.occluder) &&
    boundsOverlap(input.textElement.bounds, input.occluder.bounds)
  )
}

function isElementRenderedAfterText(input: {
  context: LayoutContext
  textElement: WhiteboardRenderReportElement
  candidate: WhiteboardRenderReportElement
}): boolean {
  const textOrder = input.context.renderOrderByID.get(input.textElement.id)
  const candidateOrder = input.context.renderOrderByID.get(input.candidate.id)
  return textOrder !== undefined && candidateOrder !== undefined && candidateOrder > textOrder
}

function isOpaqueFilledShape(element: WhiteboardRenderReportElement): boolean {
  return (
    isContainerLikeShape(element) &&
    element.fillStyle === OPAQUE_FILL_STYLE &&
    hasVisibleBackgroundColor(element.backgroundColor) &&
    readElementOpacity(element) >= MIN_TEXT_OCCLUDER_OPACITY
  )
}

function hasVisibleBackgroundColor(backgroundColor: string | undefined): boolean {
  return (
    typeof backgroundColor === "string" &&
    backgroundColor.trim().length > 0 &&
    backgroundColor.trim().toLowerCase() !== TRANSPARENT_BACKGROUND_COLOR
  )
}

function readElementOpacity(element: WhiteboardRenderReportElement): number {
  return typeof element.opacity === "number" && Number.isFinite(element.opacity)
    ? Math.round(element.opacity)
    : 100
}

function isTextAnchorInsideBounds(
  textBounds: WhiteboardBounds,
  containerBounds: WhiteboardBounds,
): boolean {
  const anchorX = textBounds.x
  const anchorY = textBounds.y
  return (
    anchorX >= containerBounds.x &&
    anchorX <= right(containerBounds) &&
    anchorY >= containerBounds.y &&
    anchorY <= bottom(containerBounds)
  )
}

function boundsOverlap(a: WhiteboardBounds, b: WhiteboardBounds): boolean {
  return a.x < right(b) && right(a) > b.x && a.y < bottom(b) && bottom(a) > b.y
}

function boundsArea(bounds: WhiteboardBounds): number {
  return bounds.width * bounds.height
}

function readIntersectionArea(a: WhiteboardBounds, b: WhiteboardBounds): number {
  const size = readIntersectionSize(a, b)
  return size.width * size.height
}

function readIntersectionSize(
  a: WhiteboardBounds,
  b: WhiteboardBounds,
): { width: number; height: number } {
  const left = Math.max(a.x, b.x)
  const top = Math.max(a.y, b.y)
  const intersectionRight = Math.min(right(a), right(b))
  const intersectionBottom = Math.min(bottom(a), bottom(b))
  return {
    width: Math.max(0, intersectionRight - left),
    height: Math.max(0, intersectionBottom - top),
  }
}

function roundBounds(bounds: WhiteboardBounds): WhiteboardBounds {
  return {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.round(bounds.width),
    height: Math.round(bounds.height),
  }
}

function roundSize(bounds: WhiteboardBounds): WhiteboardLayoutSize {
  return {
    width: Math.round(bounds.width),
    height: Math.round(bounds.height),
  }
}

function roundRenderedFontValue(value: number): number {
  return Math.round(value * RENDERED_FONT_PIXEL_PRECISION) / RENDERED_FONT_PIXEL_PRECISION
}

function right(bounds: WhiteboardBounds): number {
  return bounds.x + bounds.width
}

function bottom(bounds: WhiteboardBounds): number {
  return bounds.y + bounds.height
}

export { buildWhiteboardLayoutDigest }
export type { WhiteboardLayoutDigest, WhiteboardLayoutDigestOptions }
