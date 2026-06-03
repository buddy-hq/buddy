import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform"
import type { Bounds } from "@excalidraw/excalidraw/element/bounds"
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types"
import type { AppState } from "@excalidraw/excalidraw/types"
import type { WhiteboardsReadResponse, WhiteboardsSaveLearnerEditData } from "@buddy/sdk"

type CurrentWhiteboardBoard = NonNullable<WhiteboardsReadResponse["currentBoard"]>
type PersistedWhiteboardElement = CurrentWhiteboardBoard["elements"][number]
type LearnerEditBody = NonNullable<WhiteboardsSaveLearnerEditData["body"]>
type WhiteboardViewport = NonNullable<LearnerEditBody["viewport"]>
type WhiteboardEditorElementGroup =
  | {
      kind: "native"
      elements: OrderedExcalidrawElement[]
    }
  | {
      kind: "skeleton"
      elements: ExcalidrawElementSkeleton[]
    }
type WhiteboardElementPreparation = {
  groups: WhiteboardEditorElementGroup[]
  warning?: string
}
type WhiteboardViewportAppState = Pick<AppState, "scrollX" | "scrollY"> & {
  zoomValue: number
}
type WhiteboardRenderReportAppState = {
  scrollX: number
  scrollY: number
  width: number
  height: number
  zoom: { value: number }
}
type WhiteboardRenderBounds = {
  x: number
  y: number
  width: number
  height: number
}
type WhiteboardRenderReportElement = {
  id: string
  type: string
  version?: number
  versionNonce?: number
  containerId?: string
  text?: string
  fontSize?: number
  backgroundColor?: string
  fillStyle?: string
  opacity?: number
  bounds: WhiteboardRenderBounds
}
type WhiteboardRenderReport = {
  boardID: string
  viewport: WhiteboardViewport
  canvas: {
    width: number
    height: number
    zoom: number
  }
  contentBounds: WhiteboardRenderBounds | null
  elements: WhiteboardRenderReportElement[]
}
type WhiteboardRenderedElementInput = {
  id: string
  type: string
  isDeleted?: boolean
  version?: number
  versionNonce?: number
  backgroundColor?: string
  fillStyle?: string
  opacity?: number
  fontSize?: number
}
type WhiteboardElementBoundsReader<Element extends WhiteboardRenderedElementInput> = (
  elements: readonly Element[],
) => Bounds

const SUPPORTED_ELEMENT_TYPES = new Set([
  "arrow",
  "diamond",
  "ellipse",
  "freedraw",
  "line",
  "rectangle",
  "text",
])
const EXCALIDRAW_MAX_SEED = 2_147_483_647
const FNV_OFFSET_BASIS = 2_166_136_261
const FNV_PRIME = 16_777_619
const MAX_UNSUPPORTED_ELEMENT_DESCRIPTIONS = 3
const RENDER_REPORT_SIGNATURE_PRECISION = 100

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function normalizeLabel(value: unknown): unknown {
  if (!isRecord(value) || !isRecord(value.label) || typeof value.label.text !== "string") {
    return value
  }
  return {
    ...value,
    label: {
      textAlign: "center",
      verticalAlign: "middle",
      ...value.label,
    },
  }
}

function stablePositiveHash(value: string): number {
  let hash = FNV_OFFSET_BASIS
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, FNV_PRIME) >>> 0
  }
  return (hash % EXCALIDRAW_MAX_SEED) + 1
}

function normalizeElement(value: unknown): unknown {
  const normalized = normalizeLabel(value)
  if (!isRecord(normalized)) return normalized
  if (typeof normalized.id !== "string" || typeof normalized.type !== "string") return normalized
  if (isFiniteNumber(normalized.seed)) return normalized
  return {
    ...normalized,
    seed: stablePositiveHash(`${normalized.type}:${normalized.id}`),
  }
}

function isSupportedSkeleton(value: unknown): value is ExcalidrawElementSkeleton {
  if (!isRecord(value) || typeof value.type !== "string") return false
  if (!SUPPORTED_ELEMENT_TYPES.has(value.type)) return false
  if (!isFiniteNumber(value.x) || !isFiniteNumber(value.y)) return false
  if (value.type === "text") return typeof value.text === "string"
  return true
}

function isNativeExcalidrawElement(value: unknown): value is OrderedExcalidrawElement {
  if (!isRecord(value)) return false
  const record: Record<string, unknown> = value
  if (!isSupportedSkeleton(value)) return false
  return (
    isFiniteNumber(record["angle"]) &&
    isFiniteNumber(record["version"]) &&
    isFiniteNumber(record["versionNonce"]) &&
    typeof record["isDeleted"] === "boolean" &&
    Array.isArray(record["groupIds"])
  )
}

function describeUnsupportedElement(value: unknown, index: number): string {
  if (!isRecord(value)) return `#${index}: non-object`
  const id = typeof value.id === "string" ? value.id : "missing-id"
  const type = typeof value.type === "string" ? value.type : "missing-type"
  return `#${index}: ${type}:${id}`
}

function pushPreparedGroup(input: {
  groups: WhiteboardEditorElementGroup[]
  group:
    | { kind: "native"; element: OrderedExcalidrawElement }
    | { kind: "skeleton"; element: ExcalidrawElementSkeleton }
}): void {
  const previous = input.groups.at(-1)
  if (previous?.kind === "native" && input.group.kind === "native") {
    previous.elements.push(input.group.element)
    return
  }
  if (previous?.kind === "skeleton" && input.group.kind === "skeleton") {
    previous.elements.push(input.group.element)
    return
  }
  if (input.group.kind === "native") {
    input.groups.push({
      kind: "native",
      elements: [input.group.element],
    })
    return
  }
  input.groups.push({
    kind: "skeleton",
    elements: [input.group.element],
  })
}

function buildUnsupportedWarning(input: {
  unsupported: string[]
  conversionError?: string
}): string | undefined {
  if (input.conversionError) {
    return `Whiteboard rendering skipped invalid element data: ${input.conversionError}`
  }
  if (input.unsupported.length === 0) return undefined
  const shown = input.unsupported.slice(0, MAX_UNSUPPORTED_ELEMENT_DESCRIPTIONS).join(", ")
  const remaining = input.unsupported.length - MAX_UNSUPPORTED_ELEMENT_DESCRIPTIONS
  const suffix = remaining > 0 ? `, and ${remaining} more` : ""
  return `Skipped ${input.unsupported.length} unsupported whiteboard element(s): ${shown}${suffix}.`
}

function toEditorElementConversion(
  elements: PersistedWhiteboardElement[],
): WhiteboardElementPreparation {
  const groups: WhiteboardEditorElementGroup[] = []
  const unsupported: string[] = []
  for (let index = 0; index < elements.length; index += 1) {
    const original = elements[index]
    if (isNativeExcalidrawElement(original)) {
      pushPreparedGroup({
        groups,
        group: { kind: "native", element: original },
      })
      continue
    }
    const element = normalizeElement(original)
    if (isSupportedSkeleton(element)) {
      pushPreparedGroup({
        groups,
        group: { kind: "skeleton", element },
      })
    } else {
      unsupported.push(describeUnsupportedElement(element, index))
    }
  }

  const warning = buildUnsupportedWarning({ unsupported })
  return warning ? { groups, warning } : { groups }
}

function isPersistableEditorElement(value: unknown): value is PersistedWhiteboardElement {
  if (!isRecord(value)) return false
  if (value.isDeleted === true) return false
  if (typeof value.id !== "string" || value.id.trim().length === 0) return false
  if (!isSupportedSkeleton(value)) return false
  return true
}

function toPersistedElements(elements: readonly unknown[]): PersistedWhiteboardElement[] {
  return elements.filter(isPersistableEditorElement).map((element) => Object.assign({}, element))
}

function boundsToRenderBounds(bounds: Bounds): WhiteboardRenderBounds {
  return {
    x: bounds[0],
    y: bounds[1],
    width: bounds[2] - bounds[0],
    height: bounds[3] - bounds[1],
  }
}

function readRenderedElementText(element: WhiteboardRenderedElementInput): string | undefined {
  return "text" in element && typeof element.text === "string" ? element.text : undefined
}

function readRenderedElementContainerID(
  element: WhiteboardRenderedElementInput,
): string | undefined {
  return "containerId" in element && typeof element.containerId === "string"
    ? element.containerId
    : undefined
}

function createWhiteboardRenderReport<Element extends WhiteboardRenderedElementInput>(input: {
  boardID: string
  elements: readonly Element[]
  appState: WhiteboardRenderReportAppState
  readBounds: WhiteboardElementBoundsReader<Element>
}): WhiteboardRenderReport {
  const liveElements = input.elements.filter((element) => element.isDeleted !== true)
  return {
    boardID: input.boardID,
    viewport: viewportFromAppState(input.appState),
    canvas: {
      width: input.appState.width,
      height: input.appState.height,
      zoom: input.appState.zoom.value,
    },
    contentBounds:
      liveElements.length > 0 ? boundsToRenderBounds(input.readBounds(liveElements)) : null,
    elements: liveElements.map((element) => {
      const containerId = readRenderedElementContainerID(element)
      const text = readRenderedElementText(element)
      const reportElement: WhiteboardRenderReportElement = {
        id: element.id,
        type: element.type,
        version: element.version,
        versionNonce: element.versionNonce,
        bounds: boundsToRenderBounds(input.readBounds([element])),
      }
      if (containerId) reportElement.containerId = containerId
      if (text) reportElement.text = text
      if (isFiniteNumber(element.fontSize)) reportElement.fontSize = element.fontSize
      if (element.backgroundColor) reportElement.backgroundColor = element.backgroundColor
      if (element.fillStyle) reportElement.fillStyle = element.fillStyle
      if (isFiniteNumber(element.opacity)) reportElement.opacity = element.opacity
      return reportElement
    }),
  }
}

function roundRenderSignatureValue(value: number): number {
  return Math.round(value * RENDER_REPORT_SIGNATURE_PRECISION) / RENDER_REPORT_SIGNATURE_PRECISION
}

function whiteboardRenderReportSignature(report: WhiteboardRenderReport): string {
  return JSON.stringify({
    boardID: report.boardID,
    viewport: {
      x: roundRenderSignatureValue(report.viewport.x),
      y: roundRenderSignatureValue(report.viewport.y),
      width: roundRenderSignatureValue(report.viewport.width),
      height: roundRenderSignatureValue(report.viewport.height),
    },
    canvas: {
      width: roundRenderSignatureValue(report.canvas.width),
      height: roundRenderSignatureValue(report.canvas.height),
      zoom: roundRenderSignatureValue(report.canvas.zoom),
    },
    elements: report.elements.map((element) => [
      element.id,
      element.version ?? "",
      element.versionNonce ?? "",
      element.containerId ?? "",
      element.backgroundColor ?? "",
      element.fillStyle ?? "",
      element.opacity ?? "",
      element.fontSize ?? "",
    ]),
  })
}

function elementVersionSignature(elements: readonly OrderedExcalidrawElement[]): string {
  return elements
    .map((element) => `${element.id}:${element.version}:${element.isDeleted ? "deleted" : "live"}`)
    .join("|")
}

function viewportFromAppState(appState: WhiteboardRenderReportAppState): WhiteboardViewport {
  const scale = appState.zoom.value
  return {
    x: -appState.scrollX / scale,
    y: -appState.scrollY / scale,
    width: appState.width / scale,
    height: appState.height / scale,
  }
}

function viewportToAppState(
  viewport: WhiteboardViewport,
  dimensions?: Pick<AppState, "width" | "height">,
): WhiteboardViewportAppState {
  const widthScale =
    dimensions && dimensions.width > 0 ? dimensions.width / viewport.width : undefined
  const heightScale =
    dimensions && dimensions.height > 0 ? dimensions.height / viewport.height : undefined
  const scale = Math.min(widthScale ?? heightScale ?? 1, heightScale ?? widthScale ?? 1)
  return {
    scrollX: -viewport.x * scale,
    scrollY: -viewport.y * scale,
    zoomValue: scale,
  }
}

function resolveWhiteboardRemoteSceneViewport(input: {
  phase: "initial-mount" | "mounted-update"
  viewport?: WhiteboardViewport
}): WhiteboardViewport | undefined {
  return input.phase === "initial-mount" ? input.viewport : undefined
}

export {
  createWhiteboardRenderReport,
  elementVersionSignature,
  resolveWhiteboardRemoteSceneViewport,
  toEditorElementConversion,
  toPersistedElements,
  viewportFromAppState,
  viewportToAppState,
  whiteboardRenderReportSignature,
}
export type {
  PersistedWhiteboardElement,
  WhiteboardElementPreparation,
  WhiteboardRenderReport,
  WhiteboardViewport,
}
