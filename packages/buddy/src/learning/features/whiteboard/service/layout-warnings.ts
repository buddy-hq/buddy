import type { WhiteboardElement } from "./types"

const MAX_MODEL_VISIBLE_LAYOUT_WARNINGS = 10
const TEXT_WIDTH_FACTOR = 0.6
const TEXT_LINE_HEIGHT_FACTOR = 1.25
const DEFAULT_FONT_SIZE = 20
const MIN_OVERLAP_AREA = 1
const MIN_TEXT_OVERLAP_RATIO = 0.15
const MIN_TEXT_NEAR_DISTANCE = 12
const MAX_LINE_TEXT_DISTANCE = 2
const LABEL_HORIZONTAL_PADDING = 12
const CONTAINER_AREA_RATIO = 2.5
const CONTAINER_CONTAINMENT_RATIO = 0.85
const CROWDED_ZONE_CHILD_PADDING = 24
const MIN_CROWDED_ZONE_CHILD_COUNT = 4
const MIN_CROWDED_ZONE_HARD_COLLISION_COUNT = 3
const MIN_CROWDED_ZONE_AFFECTED_ELEMENT_COUNT = 4
const MIN_CROWDED_ZONE_PADDED_OCCUPANCY_RATIO = 0.2
const VENN_MIN_AREA_RATIO = 0.5
const VENN_MAX_AREA_RATIO = 2
const VENN_MIN_OVERLAP_RATIO = 0.1
const VENN_MAX_OVERLAP_RATIO = 0.75

const WHITEBOARD_LAYOUT_WARNING_LEGEND = {
  lt: "arrow/line crosses text/label",
  tt: "text/label overlaps text/label",
  ss: "sibling shapes overlap",
  ln: "arrow/line nearly touches text/label",
  tn: "text/label nearly touches text/label",
} as const

const WHITEBOARD_LAYOUT_RELAYOUT_ACTION = "roomy_relayout_once_before_reply"
const WHITEBOARD_LAYOUT_REDRAW_ZONE_ACTION = "redraw_crowded_zone_once_before_reply"
const WHITEBOARD_LAYOUT_CONTINUE_ACTION = "continue"
const WHITEBOARD_LAYOUT_RELAYOUT_INSTRUCTION =
  'Before replying, make at most one follow-up whiteboard_create_view call. Start it with restoreCheckpoint, create more space, and use translate to move related elements together when that is enough. If a local area is too crowded to patch cleanly, delete and redraw just that area with new ids. Preserve content and do not add detail.'
const WHITEBOARD_LAYOUT_REDRAW_ZONE_INSTRUCTION =
  "Before replying, make at most one follow-up whiteboard_create_view call. Start it with restoreCheckpoint. Delete exactly layoutWarnings.redrawZone.ids, then recreate only that zone and its children with new ids in a substantially larger area. Keep every element outside that zone unchanged. Expand the camera if needed. Preserve content and do not add detail."
const WHITEBOARD_LAYOUT_CONTINUE_INSTRUCTION =
  "Advisory proximity only. Continue unless one cleanup would clearly improve readability."
const WHITEBOARD_LAYOUT_RELAYOUT_OUTPUT_PREFIX =
  "WHITEBOARD LAYOUT REPAIR SUGGESTED BEFORE REPLYING."
const WHITEBOARD_LAYOUT_REDRAW_ZONE_OUTPUT_PREFIX =
  "WHITEBOARD CROWDED ZONE REDRAW SUGGESTED BEFORE REPLYING."

type WhiteboardLayoutWarningCode = keyof typeof WHITEBOARD_LAYOUT_WARNING_LEGEND
type WhiteboardLayoutWarningAction =
  | typeof WHITEBOARD_LAYOUT_RELAYOUT_ACTION
  | typeof WHITEBOARD_LAYOUT_REDRAW_ZONE_ACTION
  | typeof WHITEBOARD_LAYOUT_CONTINUE_ACTION

type WhiteboardLayoutWarningTuple = [
  code: WhiteboardLayoutWarningCode,
  primaryID: string,
  secondaryID: string,
]

type WhiteboardLayoutWarnings = {
  legend: typeof WHITEBOARD_LAYOUT_WARNING_LEGEND
  total: number
  hard: WhiteboardLayoutWarningTuple[]
  advisory: WhiteboardLayoutWarningTuple[]
  hidden: number
  action: WhiteboardLayoutWarningAction
  instruction:
    | typeof WHITEBOARD_LAYOUT_RELAYOUT_INSTRUCTION
    | typeof WHITEBOARD_LAYOUT_REDRAW_ZONE_INSTRUCTION
    | typeof WHITEBOARD_LAYOUT_CONTINUE_INSTRUCTION
  redrawZone?: WhiteboardCrowdedZone
}

type Bounds = {
  x: number
  y: number
  width: number
  height: number
}

type TextBounds = {
  id: string
  containerId?: string
  bounds: Bounds
}

type ShapeBounds = {
  id: string
  type: string
  bounds: Bounds
}

type Point = {
  x: number
  y: number
}

type Segment = {
  start: Point
  end: Point
}

type LineSegments = {
  id: string
  segments: Segment[]
}

type RawWarning = {
  code: WhiteboardLayoutWarningCode
  primaryID: string
  secondaryID: string
}

type LayoutElementBounds = {
  id: string
  bounds: Bounds
}

type WhiteboardCrowdedZone = {
  id: string
  ids: string
  childCount: number
  hardCollisionCount: number
  affectedElementCount: number
  paddedOccupancyRatio: number
}

const SHAPE_TYPES = new Set(["rectangle", "diamond", "ellipse"])
const LINE_TYPES = new Set(["arrow", "line"])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function readFiniteNumber(value: Record<string, unknown>, key: string): number | undefined {
  const candidate = value[key]
  return isFiniteNumber(candidate) ? candidate : undefined
}

function readText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined
}

function readElementText(element: WhiteboardElement): string | undefined {
  return readText(element.text) ?? readText(element.originalText)
}

function readLabelText(element: WhiteboardElement): string | undefined {
  return isRecord(element.label) ? readText(element.label.text) : undefined
}

function readFontSize(value: Record<string, unknown>): number {
  return readFiniteNumber(value, "fontSize") ?? DEFAULT_FONT_SIZE
}

function readElementBounds(element: WhiteboardElement): Bounds | undefined {
  const x = readFiniteNumber(element, "x")
  const y = readFiniteNumber(element, "y")
  if (x === undefined || y === undefined) return undefined
  const width = readFiniteNumber(element, "width")
  const height = readFiniteNumber(element, "height")
  if (width === undefined || height === undefined) return undefined
  return normalizeBounds({
    x,
    y,
    width,
    height,
  })
}

function normalizeBounds(bounds: Bounds): Bounds {
  return {
    x: Math.min(bounds.x, bounds.x + bounds.width),
    y: Math.min(bounds.y, bounds.y + bounds.height),
    width: Math.abs(bounds.width),
    height: Math.abs(bounds.height),
  }
}

function estimateTextBounds(input: {
  id: string
  text: string
  x: number
  y: number
  fontSize: number
  maxWidth?: number
  containerId?: string
}): TextBounds {
  const estimatedWidth = Math.max(
    input.fontSize,
    input.text.length * input.fontSize * TEXT_WIDTH_FACTOR,
  )
  const width = input.maxWidth ? Math.min(input.maxWidth, estimatedWidth) : estimatedWidth
  const lines = input.maxWidth ? Math.max(1, Math.ceil(estimatedWidth / input.maxWidth)) : 1
  const height = lines * input.fontSize * TEXT_LINE_HEIGHT_FACTOR
  return {
    id: input.id,
    bounds: {
      x: input.x,
      y: input.y,
      width,
      height,
    },
    ...(input.containerId ? { containerId: input.containerId } : {}),
  }
}

function readTextBounds(element: WhiteboardElement): TextBounds | undefined {
  const text = readElementText(element)
  if (!text) return undefined
  const x = readFiniteNumber(element, "x")
  const y = readFiniteNumber(element, "y")
  if (x === undefined || y === undefined) return undefined
  const fontSize = readFontSize(element)
  const width = readFiniteNumber(element, "width")
  const height = readFiniteNumber(element, "height")
  return {
    id: element.id,
    bounds:
      width !== undefined && height !== undefined
        ? normalizeBounds({ x, y, width, height })
        : estimateTextBounds({
            id: element.id,
            text,
            x,
            y,
            fontSize,
          }).bounds,
    ...(typeof element.containerId === "string" ? { containerId: element.containerId } : {}),
  }
}

function readLabelBounds(element: WhiteboardElement): TextBounds | undefined {
  const text = readLabelText(element)
  if (!text) return undefined
  const elementBounds = readElementBounds(element)
  if (!elementBounds) return undefined
  const label = isRecord(element.label) ? element.label : {}
  const fontSize = readFontSize(label)
  const estimated = estimateTextBounds({
    id: element.id,
    text,
    x: 0,
    y: 0,
    fontSize,
    maxWidth: Math.max(fontSize, elementBounds.width - LABEL_HORIZONTAL_PADDING * 2),
    containerId: element.id,
  }).bounds
  return {
    id: element.id,
    containerId: element.id,
    bounds: {
      x: elementBounds.x + elementBounds.width / 2 - estimated.width / 2,
      y: elementBounds.y + elementBounds.height / 2 - estimated.height / 2,
      width: estimated.width,
      height: estimated.height,
    },
  }
}

function readShapeBounds(element: WhiteboardElement): ShapeBounds | undefined {
  if (!SHAPE_TYPES.has(element.type)) return undefined
  const bounds = readElementBounds(element)
  if (!bounds) return undefined
  if (bounds.width <= 0 || bounds.height <= 0) return undefined
  return {
    id: element.id,
    type: element.type,
    bounds,
  }
}

function readPoint(value: unknown): Point | undefined {
  if (!Array.isArray(value) || value.length < 2) return undefined
  const x = value[0]
  const y = value[1]
  if (!isFiniteNumber(x) || !isFiniteNumber(y)) return undefined
  return { x, y }
}

function readElementPoints(element: WhiteboardElement): Point[] | undefined {
  if (!Array.isArray(element.points)) return undefined
  const points: Point[] = []
  for (const value of element.points) {
    const point = readPoint(value)
    if (!point) return undefined
    points.push(point)
  }
  return points.length >= 2 ? points : undefined
}

function toSegments(points: Point[]): Segment[] {
  const segments: Segment[] = []
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1]
    const end = points[index]
    if (start.x === end.x && start.y === end.y) continue
    segments.push({ start, end })
  }
  return segments
}

function readLineSegments(element: WhiteboardElement): LineSegments | undefined {
  if (!LINE_TYPES.has(element.type)) return undefined
  const x = readFiniteNumber(element, "x")
  const y = readFiniteNumber(element, "y")
  if (x === undefined || y === undefined) return undefined

  const points =
    readElementPoints(element)?.map((point) => ({
      x: x + point.x,
      y: y + point.y,
    })) ??
    (() => {
      const width = readFiniteNumber(element, "width")
      const height = readFiniteNumber(element, "height")
      if (width === undefined || height === undefined) return undefined
      return [
        { x, y },
        { x: x + width, y: y + height },
      ]
    })()
  if (!points) return undefined

  const segments = toSegments(points)
  if (segments.length === 0) return undefined
  return {
    id: element.id,
    segments,
  }
}

function boundsArea(bounds: Bounds): number {
  return bounds.width * bounds.height
}

function boundsDistance(first: Bounds, second: Bounds): number {
  const dx = Math.max(first.x - (second.x + second.width), second.x - (first.x + first.width), 0)
  const dy = Math.max(first.y - (second.y + second.height), second.y - (first.y + first.height), 0)
  return Math.hypot(dx, dy)
}

function intersectionArea(first: Bounds, second: Bounds): number {
  const left = Math.max(first.x, second.x)
  const right = Math.min(first.x + first.width, second.x + second.width)
  const top = Math.max(first.y, second.y)
  const bottom = Math.min(first.y + first.height, second.y + second.height)
  if (right <= left || bottom <= top) return 0
  return (right - left) * (bottom - top)
}

function expandBounds(bounds: Bounds, padding: number): Bounds {
  return {
    x: bounds.x - padding,
    y: bounds.y - padding,
    width: bounds.width + padding * 2,
    height: bounds.height + padding * 2,
  }
}

function clipBounds(bounds: Bounds, container: Bounds): Bounds | undefined {
  const left = Math.max(bounds.x, container.x)
  const top = Math.max(bounds.y, container.y)
  const right = Math.min(bounds.x + bounds.width, container.x + container.width)
  const bottom = Math.min(bounds.y + bounds.height, container.y + container.height)
  if (right <= left || bottom <= top) return undefined
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  }
}

function pointIsInsideBounds(point: Point, bounds: Bounds): boolean {
  return (
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height
  )
}

function unionBoundsArea(bounds: Bounds[]): number {
  const xValues = [
    ...new Set(bounds.flatMap((value) => [value.x, value.x + value.width])),
  ].toSorted((first, second) => first - second)
  let area = 0
  for (let index = 1; index < xValues.length; index += 1) {
    const left = xValues[index - 1]
    const right = xValues[index]
    if (right <= left) continue
    const intervals = bounds
      .filter((value) => value.x < right && value.x + value.width > left)
      .map((value) => [value.y, value.y + value.height] as const)
      .toSorted((first, second) => first[0] - second[0])
    let coveredHeight = 0
    let currentStart: number | undefined
    let currentEnd: number | undefined
    for (const [start, end] of intervals) {
      if (currentStart === undefined || currentEnd === undefined) {
        currentStart = start
        currentEnd = end
        continue
      }
      if (start > currentEnd) {
        coveredHeight += currentEnd - currentStart
        currentStart = start
        currentEnd = end
        continue
      }
      currentEnd = Math.max(currentEnd, end)
    }
    if (currentStart !== undefined && currentEnd !== undefined) {
      coveredHeight += currentEnd - currentStart
    }
    area += (right - left) * coveredHeight
  }
  return area
}

function hasClearIntersection(first: Bounds, second: Bounds): boolean {
  return intersectionArea(first, second) > MIN_OVERLAP_AREA
}

function pointDistanceToBounds(point: Point, bounds: Bounds): number {
  const dx = Math.max(bounds.x - point.x, 0, point.x - (bounds.x + bounds.width))
  const dy = Math.max(bounds.y - point.y, 0, point.y - (bounds.y + bounds.height))
  return Math.hypot(dx, dy)
}

function pointToSegmentDistance(point: Point, segment: Segment): number {
  const dx = segment.end.x - segment.start.x
  const dy = segment.end.y - segment.start.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return Math.hypot(point.x - segment.start.x, point.y - segment.start.y)
  const rawT = ((point.x - segment.start.x) * dx + (point.y - segment.start.y) * dy) / lengthSquared
  const t = Math.max(0, Math.min(1, rawT))
  return Math.hypot(point.x - (segment.start.x + t * dx), point.y - (segment.start.y + t * dy))
}

function orientation(first: Point, second: Point, third: Point): number {
  return (second.y - first.y) * (third.x - second.x) - (second.x - first.x) * (third.y - second.y)
}

function pointIsOnSegment(point: Point, segment: Segment): boolean {
  return (
    point.x >= Math.min(segment.start.x, segment.end.x) &&
    point.x <= Math.max(segment.start.x, segment.end.x) &&
    point.y >= Math.min(segment.start.y, segment.end.y) &&
    point.y <= Math.max(segment.start.y, segment.end.y)
  )
}

function segmentsIntersect(first: Segment, second: Segment): boolean {
  const firstOrientation = orientation(first.start, first.end, second.start)
  const secondOrientation = orientation(first.start, first.end, second.end)
  const thirdOrientation = orientation(second.start, second.end, first.start)
  const fourthOrientation = orientation(second.start, second.end, first.end)

  if (
    ((firstOrientation > 0 && secondOrientation < 0) ||
      (firstOrientation < 0 && secondOrientation > 0)) &&
    ((thirdOrientation > 0 && fourthOrientation < 0) ||
      (thirdOrientation < 0 && fourthOrientation > 0))
  ) {
    return true
  }

  return (
    (firstOrientation === 0 && pointIsOnSegment(second.start, first)) ||
    (secondOrientation === 0 && pointIsOnSegment(second.end, first)) ||
    (thirdOrientation === 0 && pointIsOnSegment(first.start, second)) ||
    (fourthOrientation === 0 && pointIsOnSegment(first.end, second))
  )
}

function segmentIntersectsBounds(segment: Segment, bounds: Bounds): boolean {
  if (pointDistanceToBounds(segment.start, bounds) === 0) return true
  if (pointDistanceToBounds(segment.end, bounds) === 0) return true
  const topLeft = { x: bounds.x, y: bounds.y }
  const topRight = { x: bounds.x + bounds.width, y: bounds.y }
  const bottomLeft = { x: bounds.x, y: bounds.y + bounds.height }
  const bottomRight = { x: bounds.x + bounds.width, y: bounds.y + bounds.height }
  return (
    segmentsIntersect(segment, { start: topLeft, end: topRight }) ||
    segmentsIntersect(segment, { start: topRight, end: bottomRight }) ||
    segmentsIntersect(segment, { start: bottomRight, end: bottomLeft }) ||
    segmentsIntersect(segment, { start: bottomLeft, end: topLeft })
  )
}

function segmentDistanceToBounds(segment: Segment, bounds: Bounds): number {
  if (segmentIntersectsBounds(segment, bounds)) return 0
  const corners = [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x, y: bounds.y + bounds.height },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
  ]
  return Math.min(
    pointDistanceToBounds(segment.start, bounds),
    pointDistanceToBounds(segment.end, bounds),
    ...corners.map((corner) => pointToSegmentDistance(corner, segment)),
  )
}

function isSameContainer(first: TextBounds, second: TextBounds): boolean {
  return (
    first.containerId !== undefined &&
    second.containerId !== undefined &&
    first.containerId === second.containerId
  )
}

function isContainerOverlap(first: ShapeBounds, second: ShapeBounds): boolean {
  const firstArea = boundsArea(first.bounds)
  const secondArea = boundsArea(second.bounds)
  if (firstArea <= 0 || secondArea <= 0) return false
  const overlap = intersectionArea(first.bounds, second.bounds)
  const firstContainsSecond =
    firstArea / secondArea >= CONTAINER_AREA_RATIO &&
    overlap / secondArea >= CONTAINER_CONTAINMENT_RATIO
  const secondContainsFirst =
    secondArea / firstArea >= CONTAINER_AREA_RATIO &&
    overlap / firstArea >= CONTAINER_CONTAINMENT_RATIO
  return firstContainsSecond || secondContainsFirst
}

function isVennLikeOverlap(first: ShapeBounds, second: ShapeBounds): boolean {
  if (first.type !== "ellipse" || second.type !== "ellipse") return false
  const firstArea = boundsArea(first.bounds)
  const secondArea = boundsArea(second.bounds)
  if (firstArea <= 0 || secondArea <= 0) return false
  const areaRatio = firstArea / secondArea
  if (areaRatio < VENN_MIN_AREA_RATIO || areaRatio > VENN_MAX_AREA_RATIO) return false
  const overlapRatio =
    intersectionArea(first.bounds, second.bounds) / Math.min(firstArea, secondArea)
  return overlapRatio >= VENN_MIN_OVERLAP_RATIO && overlapRatio <= VENN_MAX_OVERLAP_RATIO
}

function warningKey(warning: RawWarning): string {
  const ids = [warning.primaryID, warning.secondaryID].toSorted()
  return `${warning.code}:${ids[0]}:${ids[1]}`
}

function toTuple(warning: RawWarning): WhiteboardLayoutWarningTuple {
  return [warning.code, warning.primaryID, warning.secondaryID]
}

function warningRank(warning: RawWarning): number {
  if (warning.code === "lt") return 1
  if (warning.code === "tt") return 2
  if (warning.code === "ss") return 3
  if (warning.code === "ln") return 4
  return 5
}

function isHardWarning(warning: RawWarning): boolean {
  return warning.code === "lt" || warning.code === "tt" || warning.code === "ss"
}

function pushWarning(input: {
  warnings: RawWarning[]
  seen: Set<string>
  warning: RawWarning
}): void {
  const key = warningKey(input.warning)
  if (input.seen.has(key)) return
  input.seen.add(key)
  input.warnings.push(input.warning)
}

function detectTextWarnings(input: {
  texts: TextBounds[]
  warnings: RawWarning[]
  seen: Set<string>
}): void {
  for (let firstIndex = 0; firstIndex < input.texts.length; firstIndex += 1) {
    const first = input.texts[firstIndex]
    for (let secondIndex = firstIndex + 1; secondIndex < input.texts.length; secondIndex += 1) {
      const second = input.texts[secondIndex]
      if (first.id === second.id || isSameContainer(first, second)) continue
      const overlap = intersectionArea(first.bounds, second.bounds)
      if (overlap <= MIN_OVERLAP_AREA) continue
      const overlapRatio = overlap / Math.min(boundsArea(first.bounds), boundsArea(second.bounds))
      if (overlapRatio < MIN_TEXT_OVERLAP_RATIO) continue
      pushWarning({
        warnings: input.warnings,
        seen: input.seen,
        warning: {
          code: "tt",
          primaryID: first.id,
          secondaryID: second.id,
        },
      })
    }
  }
}

function detectTextNearWarnings(input: {
  texts: TextBounds[]
  warnings: RawWarning[]
  seen: Set<string>
}): void {
  for (let firstIndex = 0; firstIndex < input.texts.length; firstIndex += 1) {
    const first = input.texts[firstIndex]
    for (let secondIndex = firstIndex + 1; secondIndex < input.texts.length; secondIndex += 1) {
      const second = input.texts[secondIndex]
      if (first.id === second.id || isSameContainer(first, second)) continue
      if (intersectionArea(first.bounds, second.bounds) > MIN_OVERLAP_AREA) continue
      if (boundsDistance(first.bounds, second.bounds) > MIN_TEXT_NEAR_DISTANCE) continue
      pushWarning({
        warnings: input.warnings,
        seen: input.seen,
        warning: {
          code: "tn",
          primaryID: first.id,
          secondaryID: second.id,
        },
      })
    }
  }
}

function detectLineTextWarnings(input: {
  lines: LineSegments[]
  texts: TextBounds[]
  warnings: RawWarning[]
  seen: Set<string>
}): void {
  for (const line of input.lines) {
    for (const text of input.texts) {
      if (line.id === text.id || text.containerId === line.id) continue
      const distance = Math.min(
        ...line.segments.map((segment) => segmentDistanceToBounds(segment, text.bounds)),
      )
      if (distance > MAX_LINE_TEXT_DISTANCE) continue
      pushWarning({
        warnings: input.warnings,
        seen: input.seen,
        warning: {
          code: distance === 0 ? "lt" : "ln",
          primaryID: line.id,
          secondaryID: text.id,
        },
      })
    }
  }
}

function detectShapeWarnings(input: {
  shapes: ShapeBounds[]
  warnings: RawWarning[]
  seen: Set<string>
}): void {
  for (let firstIndex = 0; firstIndex < input.shapes.length; firstIndex += 1) {
    const first = input.shapes[firstIndex]
    for (let secondIndex = firstIndex + 1; secondIndex < input.shapes.length; secondIndex += 1) {
      const second = input.shapes[secondIndex]
      if (!hasClearIntersection(first.bounds, second.bounds)) continue
      if (isContainerOverlap(first, second)) continue
      if (isVennLikeOverlap(first, second)) continue
      pushWarning({
        warnings: input.warnings,
        seen: input.seen,
        warning: {
          code: "ss",
          primaryID: first.id,
          secondaryID: second.id,
        },
      })
    }
  }
}

function readLayoutElementBounds(elements: WhiteboardElement[]): LayoutElementBounds[] {
  const bounds: LayoutElementBounds[] = []
  for (const element of elements) {
    const elementBounds = readElementBounds(element) ?? readTextBounds(element)?.bounds
    if (!elementBounds) continue
    bounds.push({
      id: element.id,
      bounds: elementBounds,
    })
  }
  return bounds
}

function readCrowdedZoneChildren(input: {
  zone: ShapeBounds
  elements: LayoutElementBounds[]
}): LayoutElementBounds[] {
  return input.elements.filter((element) => {
    if (element.id === input.zone.id) return false
    if (boundsArea(element.bounds) >= boundsArea(input.zone.bounds)) return false
    return pointIsInsideBounds(
      {
        x: element.bounds.x + element.bounds.width / 2,
        y: element.bounds.y + element.bounds.height / 2,
      },
      input.zone.bounds,
    )
  })
}

function readZoneElementIDs(input: {
  zone: ShapeBounds
  elements: WhiteboardElement[]
  layoutElements: LayoutElementBounds[]
}): string[] {
  const ids = new Set([
    input.zone.id,
    ...readCrowdedZoneChildren({
      zone: input.zone,
      elements: input.layoutElements,
    }).map((element) => element.id),
  ])
  let addedBoundText = true
  while (addedBoundText) {
    addedBoundText = false
    for (const element of input.elements) {
      if (
        ids.has(element.id) ||
        typeof element.containerId !== "string" ||
        !ids.has(element.containerId)
      ) {
        continue
      }
      ids.add(element.id)
      addedBoundText = true
    }
  }
  return [
    input.zone.id,
    ...input.elements
      .filter((element) => element.id !== input.zone.id && ids.has(element.id))
      .map((element) => element.id),
  ]
}

function buildCrowdedZone(input: {
  zone: ShapeBounds
  elementIDs: string[]
  children: LayoutElementBounds[]
  warnings: RawWarning[]
}): WhiteboardCrowdedZone | undefined {
  if (input.children.length < MIN_CROWDED_ZONE_CHILD_COUNT) return undefined
  const zoneIDs = new Set(input.elementIDs)
  const hardWarnings = input.warnings
    .filter(isHardWarning)
    .filter((warning) => zoneIDs.has(warning.primaryID) && zoneIDs.has(warning.secondaryID))
  const affectedIDs = new Set(
    hardWarnings
      .flatMap((warning) => [warning.primaryID, warning.secondaryID])
      .filter((id) => id !== input.zone.id),
  )
  const paddedBounds = input.children
    .map((child) =>
      clipBounds(expandBounds(child.bounds, CROWDED_ZONE_CHILD_PADDING), input.zone.bounds),
    )
    .filter((bounds): bounds is Bounds => bounds !== undefined)
  const paddedOccupancyRatio = unionBoundsArea(paddedBounds) / boundsArea(input.zone.bounds)
  if (paddedOccupancyRatio < MIN_CROWDED_ZONE_PADDED_OCCUPANCY_RATIO) return undefined
  if (
    hardWarnings.length < MIN_CROWDED_ZONE_HARD_COLLISION_COUNT &&
    affectedIDs.size < MIN_CROWDED_ZONE_AFFECTED_ELEMENT_COUNT
  ) {
    return undefined
  }
  return {
    id: input.zone.id,
    ids: input.elementIDs.join(","),
    childCount: input.children.length,
    hardCollisionCount: hardWarnings.length,
    affectedElementCount: affectedIDs.size,
    paddedOccupancyRatio: Math.round(paddedOccupancyRatio * 100) / 100,
  }
}

function findCrowdedZone(input: {
  elements: WhiteboardElement[]
  shapes: ShapeBounds[]
  warnings: RawWarning[]
}): WhiteboardCrowdedZone | undefined {
  const elements = readLayoutElementBounds(input.elements)
  return input.shapes
    .filter((shape) => shape.type === "rectangle")
    .toSorted((first, second) => boundsArea(first.bounds) - boundsArea(second.bounds))
    .map((zone) => {
      const children = readCrowdedZoneChildren({ zone, elements })
      return buildCrowdedZone({
        zone,
        elementIDs: readZoneElementIDs({
          zone,
          elements: input.elements,
          layoutElements: elements,
        }),
        children,
        warnings: input.warnings,
      })
    })
    .find((zone): zone is WhiteboardCrowdedZone => zone !== undefined)
}

function collectWhiteboardLayoutWarnings(elements: WhiteboardElement[]): RawWarning[] {
  const texts: TextBounds[] = []
  const shapes: ShapeBounds[] = []
  const lines: LineSegments[] = []
  for (const element of elements) {
    const textBounds = readTextBounds(element)
    if (textBounds) texts.push(textBounds)
    const labelBounds = readLabelBounds(element)
    if (labelBounds) texts.push(labelBounds)
    const shapeBounds = readShapeBounds(element)
    if (shapeBounds) shapes.push(shapeBounds)
    const lineSegments = readLineSegments(element)
    if (lineSegments) lines.push(lineSegments)
  }

  const seen = new Set<string>()
  const warnings: RawWarning[] = []
  detectLineTextWarnings({ lines, texts, warnings, seen })
  detectTextWarnings({ texts, warnings, seen })
  detectTextNearWarnings({ texts, warnings, seen })
  detectShapeWarnings({ shapes, warnings, seen })
  return warnings
}

function detectWhiteboardLayoutWarnings(elements: WhiteboardElement[]): WhiteboardLayoutWarnings | undefined {
  const warnings = collectWhiteboardLayoutWarnings(elements)
  if (warnings.length === 0) return undefined

  const orderedWarnings = warnings.toSorted(
    (first, second) => warningRank(first) - warningRank(second),
  )
  const shown = orderedWarnings.slice(0, MAX_MODEL_VISIBLE_LAYOUT_WARNINGS)
  const hard = shown.filter(isHardWarning).map(toTuple)
  const advisory = shown.filter((warning) => !isHardWarning(warning)).map(toTuple)
  const hasHardWarnings = warnings.some(isHardWarning)
  const redrawZone = findCrowdedZone({
    elements,
    shapes: elements
      .map(readShapeBounds)
      .filter((shape): shape is ShapeBounds => shape !== undefined),
    warnings,
  })
  const action = hasHardWarnings
    ? redrawZone
      ? WHITEBOARD_LAYOUT_REDRAW_ZONE_ACTION
      : WHITEBOARD_LAYOUT_RELAYOUT_ACTION
    : WHITEBOARD_LAYOUT_CONTINUE_ACTION
  return {
    legend: WHITEBOARD_LAYOUT_WARNING_LEGEND,
    total: warnings.length,
    hard,
    advisory,
    hidden: Math.max(0, warnings.length - shown.length),
    action,
    instruction:
      action === WHITEBOARD_LAYOUT_RELAYOUT_ACTION
        ? WHITEBOARD_LAYOUT_RELAYOUT_INSTRUCTION
        : action === WHITEBOARD_LAYOUT_REDRAW_ZONE_ACTION
          ? WHITEBOARD_LAYOUT_REDRAW_ZONE_INSTRUCTION
          : WHITEBOARD_LAYOUT_CONTINUE_INSTRUCTION,
    ...(redrawZone ? { redrawZone } : {}),
  }
}

function formatWhiteboardLayoutWarningsForModel(warnings: WhiteboardLayoutWarnings): string[] {
  const payload = `layoutWarnings: ${JSON.stringify(warnings)}`
  if (warnings.action === WHITEBOARD_LAYOUT_RELAYOUT_ACTION) {
    return [WHITEBOARD_LAYOUT_RELAYOUT_OUTPUT_PREFIX, payload]
  }
  if (warnings.action === WHITEBOARD_LAYOUT_REDRAW_ZONE_ACTION) {
    return [WHITEBOARD_LAYOUT_REDRAW_ZONE_OUTPUT_PREFIX, payload]
  }
  return [payload]
}

export {
  WHITEBOARD_LAYOUT_WARNING_LEGEND,
  detectWhiteboardLayoutWarnings,
  formatWhiteboardLayoutWarningsForModel,
}
export type {
  WhiteboardLayoutWarningCode,
  WhiteboardLayoutWarningTuple,
  WhiteboardLayoutWarnings,
  WhiteboardCrowdedZone,
}
