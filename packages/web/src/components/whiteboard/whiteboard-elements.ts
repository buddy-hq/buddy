import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform"
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types"
import type { AppState } from "@excalidraw/excalidraw/types"
import type {
  WhiteboardsRevisionReadResponse,
  WhiteboardsSceneSaveLearnerEditData,
} from "@buddy/sdk"

type PersistedWhiteboardElement = WhiteboardsRevisionReadResponse["elements"][number]
type LearnerEditBody = NonNullable<WhiteboardsSceneSaveLearnerEditData["body"]>
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
  if (value.type !== "text" && (!isFiniteNumber(value.width) || !isFiniteNumber(value.height))) {
    return false
  }
  if (value.type === "freedraw" && !Array.isArray(value.points)) return false
  return true
}

function toPersistedElements(elements: readonly unknown[]): PersistedWhiteboardElement[] {
  return elements.filter(isPersistableEditorElement).map((element) => Object.assign({}, element))
}

function elementVersionSignature(elements: readonly OrderedExcalidrawElement[]): string {
  return elements
    .map((element) => `${element.id}:${element.version}:${element.isDeleted ? "deleted" : "live"}`)
    .join("|")
}

function viewportFromAppState(appState: AppState): WhiteboardViewport {
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

export {
  elementVersionSignature,
  toEditorElementConversion,
  toPersistedElements,
  viewportFromAppState,
  viewportToAppState,
}
export type { PersistedWhiteboardElement, WhiteboardElementPreparation, WhiteboardViewport }
