import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform"
import type { Bounds } from "@excalidraw/excalidraw/element/bounds"
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types"
import type { AppState } from "@excalidraw/excalidraw/types"
import type {
  ObjectWhiteboardObjectReadResponse,
  ObjectWhiteboardObjectSaveLearnerEditData,
} from "@buddy/sdk"
import { z } from "zod"

type CurrentWhiteboardBoard = NonNullable<ObjectWhiteboardObjectReadResponse["currentBoard"]>
type PersistedWhiteboardElement = CurrentWhiteboardBoard["elements"][number]
type LearnerEditBody = NonNullable<ObjectWhiteboardObjectSaveLearnerEditData["body"]>
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
  text?: string
  containerId?: string | null
}

type TWhiteboardElementLabel = {
  text: string
  textAlign?: string
  verticalAlign?: string
}

type TWhiteboardDrawnElement = {
  id: string
  type: string
  x: number
  y: number
  width?: number
  height?: number
  text?: string
  seed?: number
  isDeleted?: boolean
  angle?: number
  version?: number
  versionNonce?: number
  groupIds?: readonly string[]
  containerId?: string | null
  label?: TWhiteboardElementLabel
}

type TEditorElementCandidate = TWhiteboardDrawnElement
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
const MIN_RENDERABLE_VIEWPORT_DIMENSION = 0

const whiteboardElementLabelSchema = z.object({
  text: z.string(),
  textAlign: z.string().optional(),
  verticalAlign: z.string().optional(),
})

const whiteboardDrawnElementSchema = z
  .object({
    id: z.string(),
    type: z.string(),
    x: z.number(),
    y: z.number(),
    width: z.number().optional(),
    height: z.number().optional(),
    text: z.string().optional(),
    seed: z.number().optional(),
    isDeleted: z.boolean().optional(),
    angle: z.number().optional(),
    version: z.number().optional(),
    versionNonce: z.number().optional(),
    groupIds: z.array(z.string()).optional(),
    containerId: z.string().nullable().optional(),
    label: whiteboardElementLabelSchema.optional(),
  })
  .passthrough()

const whiteboardElementIdentitySchema = z.object({
  id: z.string().optional(),
  type: z.string().optional(),
})

function isFiniteNumber(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value)
}

function parseDrawnElement(element: PersistedWhiteboardElement): TWhiteboardDrawnElement | undefined {
  const parsed = whiteboardDrawnElementSchema.safeParse(element)
  return parsed.success ? parsed.data : undefined
}

function normalizeLabel(element: TWhiteboardDrawnElement): TWhiteboardDrawnElement {
  if (element.label === undefined) return element
  return Object.assign({}, element, {
    label: Object.assign(
      {
        textAlign: "center",
        verticalAlign: "middle",
      },
      element.label,
    ),
  })
}

function stablePositiveHash(value: string): number {
  let hash = FNV_OFFSET_BASIS
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, FNV_PRIME) >>> 0
  }
  return (hash % EXCALIDRAW_MAX_SEED) + 1
}

function normalizeElement(element: TWhiteboardDrawnElement): TWhiteboardDrawnElement {
  const normalized = normalizeLabel(element)
  if (isFiniteNumber(normalized.seed)) return normalized
  return Object.assign({}, normalized, {
    seed: stablePositiveHash(`${normalized.type}:${normalized.id}`),
  })
}

function isSupportedSkeleton(
  element: TWhiteboardDrawnElement,
): element is TWhiteboardDrawnElement & ExcalidrawElementSkeleton {
  if (!SUPPORTED_ELEMENT_TYPES.has(element.type)) return false
  if (!Number.isFinite(element.x) || !Number.isFinite(element.y)) return false
  if (element.type === "text") return element.text !== undefined
  return true
}

function isNativeExcalidrawElement(
  element: TWhiteboardDrawnElement,
): element is TWhiteboardDrawnElement & OrderedExcalidrawElement {
  if (!isSupportedSkeleton(element)) return false
  return (
    isFiniteNumber(element.angle) &&
    isFiniteNumber(element.version) &&
    isFiniteNumber(element.versionNonce) &&
    (element.isDeleted === true || element.isDeleted === false) &&
    element.groupIds !== undefined
  )
}

function describeUnsupportedElement(
  element: PersistedWhiteboardElement,
  index: number,
): string {
  const parsed = whiteboardElementIdentitySchema.safeParse(element)
  if (!parsed.success) return `#${index}: non-object`
  const id = parsed.data.id ?? "missing-id"
  const type = parsed.data.type ?? "missing-type"
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
    const parsed = parseDrawnElement(original)
    if (parsed === undefined) {
      unsupported.push(describeUnsupportedElement(original, index))
      continue
    }
    if (isNativeExcalidrawElement(parsed)) {
      pushPreparedGroup({
        groups,
        group: { kind: "native", element: parsed },
      })
      continue
    }
    const element = normalizeElement(parsed)
    if (isSupportedSkeleton(element)) {
      pushPreparedGroup({
        groups,
        group: { kind: "skeleton", element },
      })
    } else {
      unsupported.push(describeUnsupportedElement(original, index))
    }
  }

  const warning = buildUnsupportedWarning({ unsupported })
  return warning ? { groups, warning } : { groups }
}

function isPersistableEditorElement(
  element: TEditorElementCandidate,
): element is TEditorElementCandidate & PersistedWhiteboardElement {
  if (element.isDeleted === true) return false
  if (element.id.trim().length === 0) return false
  if (!SUPPORTED_ELEMENT_TYPES.has(element.type)) return false
  if (!Number.isFinite(element.x) || !Number.isFinite(element.y)) return false
  if (element.type === "text" && element.text === undefined) return false
  return true
}

function toPersistedElements(
  elements: readonly TEditorElementCandidate[],
): PersistedWhiteboardElement[] {
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
  return element.text
}

function readRenderedElementContainerID(
  element: WhiteboardRenderedElementInput,
): string | undefined {
  return element.containerId ?? undefined
}

function createWhiteboardRenderReport<Element extends WhiteboardRenderedElementInput>(input: {
  boardID: string
  elements: readonly Element[]
  appState: WhiteboardRenderReportAppState
  readBounds: WhiteboardElementBoundsReader<Element>
}): WhiteboardRenderReport | undefined {
  const viewport = resolveWhiteboardViewportFromAppState(input.appState)
  if (!viewport) return undefined
  const liveElements = input.elements.filter((element) => element.isDeleted !== true)
  return {
    boardID: input.boardID,
    viewport,
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

function resolveWhiteboardViewportFromAppState(
  appState: WhiteboardRenderReportAppState,
): WhiteboardViewport | undefined {
  const scale = appState.zoom.value
  if (!isFiniteNumber(scale) || scale <= MIN_RENDERABLE_VIEWPORT_DIMENSION) return undefined
  const viewport = {
    x: -appState.scrollX / scale,
    y: -appState.scrollY / scale,
    width: appState.width / scale,
    height: appState.height / scale,
  }
  if (!isFiniteNumber(viewport.x) || !isFiniteNumber(viewport.y)) return undefined
  if (
    !isFiniteNumber(viewport.width) ||
    viewport.width <= MIN_RENDERABLE_VIEWPORT_DIMENSION ||
    !isFiniteNumber(viewport.height) ||
    viewport.height <= MIN_RENDERABLE_VIEWPORT_DIMENSION
  ) {
    return undefined
  }
  return viewport
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

function resolveWhiteboardRemoteSceneUpdate(input: {
  currentElementSignature: string
  nextElementSignature: string
  wasReadOnly: boolean
  isReadOnly: boolean
}) {
  if (input.currentElementSignature !== input.nextElementSignature) {
    return {
      shouldApply: true,
      preserveCurrentElements: false,
    }
  }
  if (input.wasReadOnly && !input.isReadOnly) {
    return {
      shouldApply: true,
      preserveCurrentElements: true,
    }
  }
  return {
    shouldApply: false,
    preserveCurrentElements: false,
  }
}

export {
  createWhiteboardRenderReport,
  elementVersionSignature,
  resolveWhiteboardRemoteSceneUpdate,
  resolveWhiteboardViewportFromAppState,
  resolveWhiteboardRemoteSceneViewport,
  toEditorElementConversion,
  toPersistedElements,
  viewportToAppState,
  whiteboardRenderReportSignature,
}
export type {
  PersistedWhiteboardElement,
  WhiteboardElementPreparation,
  WhiteboardRenderReport,
  WhiteboardViewport,
}
