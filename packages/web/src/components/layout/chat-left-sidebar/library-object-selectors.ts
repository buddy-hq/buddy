import type { ObjectFlashcardDeckReadDeckResponse, ObjectsListResponse } from "@buddy/sdk/types"
import {
  defaultBenchObjectViewID,
  type BenchObjectKind,
  type BenchTarget,
} from "@/lib/bench-navigation"

type WorkspaceObjectIndexItem = ObjectsListResponse["objects"][number]
type WorkspaceObjectLoadError = ObjectsListResponse["loadErrors"][number]
type WorkspaceObjectOfKind<TKind extends WorkspaceObjectIndexItem["kind"]> =
  WorkspaceObjectIndexItem & { kind: TKind }

type MermaidLibraryObject = WorkspaceObjectOfKind<"mermaid">
type QuestionSetLibraryObject = WorkspaceObjectOfKind<"question-set">
type FlashcardDeckLibraryObject = WorkspaceObjectOfKind<"flashcard-deck">
type HtmlWidgetLibraryObject = WorkspaceObjectOfKind<"html-widget">
type MediaPresentationLibraryObject = WorkspaceObjectOfKind<"media-presentation">
type MediaLibraryObject = WorkspaceObjectOfKind<"media-presentation" | "figure" | "freeform-figure">
type FlashcardDeckObjectSummary = {
  noteCount: number
  cardCount: number
}

type WorkspaceObjectsQuerySnapshot = {
  data?: ObjectsListResponse
}

const MEDIA_LIBRARY_KINDS = ["media-presentation", "figure", "freeform-figure"] as const
const UNAVAILABLE_OBJECT_STATUS = "unavailable" satisfies WorkspaceObjectIndexItem["status"]
const BENCH_OBJECT_SURFACE = "bench" satisfies WorkspaceObjectIndexItem["surfaces"][number]

function createBenchObjectTarget(kind: BenchObjectKind, objectID: string): BenchTarget {
  return {
    type: "object",
    ref: {
      kind,
      objectID,
      revisionID: null,
      itemID: null,
    },
    viewID: defaultBenchObjectViewID(kind),
  }
}

function workspaceObjectLoadErrorKey(loadError: WorkspaceObjectLoadError): string {
  return `${loadError.kind ?? "unknown"}:${loadError.objectID ?? loadError.path}:${loadError.message}`
}

function objectKindFilter<TKind extends WorkspaceObjectIndexItem["kind"]>(kind: TKind) {
  return (object: WorkspaceObjectIndexItem): object is WorkspaceObjectOfKind<TKind> =>
    object.kind === kind
}

function isLibraryVisibleObject(object: WorkspaceObjectIndexItem): boolean {
  return object.hasLibraryView && object.status !== UNAVAILABLE_OBJECT_STATUS
}

function isRightSidebarVisibleObject(object: WorkspaceObjectIndexItem): boolean {
  return (
    object.status !== UNAVAILABLE_OBJECT_STATUS &&
    (object.hasLibraryView || object.surfaces.includes(BENCH_OBJECT_SURFACE))
  )
}

function isMediaLibraryObject(object: WorkspaceObjectIndexItem): object is MediaLibraryObject {
  return (
    object.kind === "media-presentation" ||
    object.kind === "figure" ||
    object.kind === "freeform-figure"
  )
}

function isRenderableMediaLibraryObject(
  object: WorkspaceObjectIndexItem,
): object is MediaLibraryObject {
  return isMediaLibraryObject(object) && isRightSidebarVisibleObject(object)
}

function sortMediaLibraryObjects(a: MediaLibraryObject, b: MediaLibraryObject): number {
  return b.updatedAt.localeCompare(a.updatedAt)
}

function selectMermaidObjects(
  snapshot: WorkspaceObjectsQuerySnapshot | undefined,
): MermaidLibraryObject[] {
  return (snapshot?.data?.objects ?? [])
    .filter(isRightSidebarVisibleObject)
    .filter(objectKindFilter("mermaid"))
}

function selectQuestionSetObjects(
  snapshot: WorkspaceObjectsQuerySnapshot | undefined,
): QuestionSetLibraryObject[] {
  return (snapshot?.data?.objects ?? [])
    .filter(isRightSidebarVisibleObject)
    .filter(objectKindFilter("question-set"))
}

function selectFlashcardDeckObjects(
  snapshot: WorkspaceObjectsQuerySnapshot | undefined,
): FlashcardDeckLibraryObject[] {
  return (snapshot?.data?.objects ?? [])
    .filter(isRightSidebarVisibleObject)
    .filter(objectKindFilter("flashcard-deck"))
}

function selectHtmlWidgetObjects(
  snapshot: WorkspaceObjectsQuerySnapshot | undefined,
): HtmlWidgetLibraryObject[] {
  return (snapshot?.data?.objects ?? [])
    .filter(isRightSidebarVisibleObject)
    .filter(objectKindFilter("html-widget"))
}

function selectMediaLibraryObjects(
  snapshot: WorkspaceObjectsQuerySnapshot | undefined,
): MediaLibraryObject[] {
  return (snapshot?.data?.objects ?? [])
    .filter(isRenderableMediaLibraryObject)
    .toSorted(sortMediaLibraryObjects)
}

function selectWorkspaceObjectLoadErrors(
  snapshot: WorkspaceObjectsQuerySnapshot | undefined,
  kinds: readonly WorkspaceObjectIndexItem["kind"][],
): WorkspaceObjectLoadError[] {
  return (snapshot?.data?.loadErrors ?? []).filter(
    (loadError) => loadError.kind === null || kinds.includes(loadError.kind),
  )
}

function getFlashcardDeckObjectSummary(
  deck: ObjectFlashcardDeckReadDeckResponse,
): FlashcardDeckObjectSummary {
  return {
    noteCount: deck.notes.length,
    cardCount: deck.cards.length,
  }
}

function countMediaObjectsByDirectory(input: {
  directories: readonly string[]
  snapshots: readonly WorkspaceObjectsQuerySnapshot[]
}): Map<string, number> {
  const counts = new Map<string, number>()
  input.directories.forEach((directory, directoryIndex) => {
    const snapshot = input.snapshots[directoryIndex]
    const count = snapshot?.data?.objects.filter(isRenderableMediaLibraryObject).length ?? 0
    counts.set(directory, count)
  })
  return counts
}

export {
  MEDIA_LIBRARY_KINDS,
  createBenchObjectTarget,
  objectKindFilter,
  countMediaObjectsByDirectory,
  getFlashcardDeckObjectSummary,
  isLibraryVisibleObject,
  isMediaLibraryObject,
  isRenderableMediaLibraryObject,
  isRightSidebarVisibleObject,
  selectFlashcardDeckObjects,
  selectHtmlWidgetObjects,
  selectMediaLibraryObjects,
  selectMermaidObjects,
  selectQuestionSetObjects,
  selectWorkspaceObjectLoadErrors,
  sortMediaLibraryObjects,
  workspaceObjectLoadErrorKey,
}

export type {
  FlashcardDeckObjectSummary,
  FlashcardDeckLibraryObject,
  HtmlWidgetLibraryObject,
  MediaLibraryObject,
  MediaPresentationLibraryObject,
  MermaidLibraryObject,
  QuestionSetLibraryObject,
  WorkspaceObjectIndexItem,
  WorkspaceObjectOfKind,
  WorkspaceObjectLoadError,
  WorkspaceObjectsQuerySnapshot,
}
