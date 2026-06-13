import type { ArtifactsListResponse } from "@buddy/sdk/types"

type WorkspaceArtifactIndexItem = ArtifactsListResponse["artifacts"][number]

type MermaidLibraryArtifact = Extract<WorkspaceArtifactIndexItem, { kind: "mermaid" }>
type QuestionSetLibraryArtifact = Extract<WorkspaceArtifactIndexItem, { kind: "question-set" }>
type FlashcardDeckLibraryArtifact = Extract<
  WorkspaceArtifactIndexItem,
  { kind: "flashcard-deck" }
>
type HtmlWidgetLibraryArtifact = Extract<WorkspaceArtifactIndexItem, { kind: "html-widget" }>
type MediaPresentationLibraryArtifact = Extract<
  WorkspaceArtifactIndexItem,
  { kind: "media-presentation" }
>
type MediaLibraryArtifact = Extract<
  WorkspaceArtifactIndexItem,
  { kind: "media-presentation" | "figure" | "freeform-figure" }
>
type MediaPresentationLibraryItem = MediaPresentationLibraryArtifact["summary"]["items"][number]

type WorkspaceArtifactsQuerySnapshot = {
  data?: {
    artifacts: WorkspaceArtifactIndexItem[]
  }
}

const MEDIA_LIBRARY_KINDS = ["media-presentation", "figure", "freeform-figure"] as const

function artifactKindFilter<TKind extends WorkspaceArtifactIndexItem["kind"]>(kind: TKind) {
  return (
    artifact: WorkspaceArtifactIndexItem,
  ): artifact is Extract<WorkspaceArtifactIndexItem, { kind: TKind }> => artifact.kind === kind
}

function isMediaLibraryArtifact(artifact: WorkspaceArtifactIndexItem): artifact is MediaLibraryArtifact {
  return (
    artifact.kind === "media-presentation" ||
    artifact.kind === "figure" ||
    artifact.kind === "freeform-figure"
  )
}

function availableMediaPresentationItems(
  artifact: MediaPresentationLibraryArtifact,
): MediaPresentationLibraryItem[] {
  return artifact.summary.items.filter((item) => item.availability.status === "available")
}

function isRenderableMediaLibraryArtifact(
  artifact: WorkspaceArtifactIndexItem,
): artifact is MediaLibraryArtifact {
  if (!isMediaLibraryArtifact(artifact)) {
    return false
  }
  return (
    artifact.kind !== "media-presentation" ||
    availableMediaPresentationItems(artifact).length > 0
  )
}

function sortMediaLibraryArtifacts(a: MediaLibraryArtifact, b: MediaLibraryArtifact): number {
  return b.createdAt.localeCompare(a.createdAt)
}

function selectMermaidArtifacts(
  snapshot: WorkspaceArtifactsQuerySnapshot | undefined,
): MermaidLibraryArtifact[] {
  return (snapshot?.data?.artifacts ?? []).filter(artifactKindFilter("mermaid"))
}

function selectQuestionSetArtifacts(
  snapshot: WorkspaceArtifactsQuerySnapshot | undefined,
): QuestionSetLibraryArtifact[] {
  return (snapshot?.data?.artifacts ?? []).filter(artifactKindFilter("question-set"))
}

function selectFlashcardDeckArtifacts(
  snapshot: WorkspaceArtifactsQuerySnapshot | undefined,
): FlashcardDeckLibraryArtifact[] {
  return (snapshot?.data?.artifacts ?? []).filter(artifactKindFilter("flashcard-deck"))
}

function selectHtmlWidgetArtifacts(
  snapshot: WorkspaceArtifactsQuerySnapshot | undefined,
): HtmlWidgetLibraryArtifact[] {
  return (snapshot?.data?.artifacts ?? []).filter(artifactKindFilter("html-widget"))
}

function mediaArtifactSubtitle(artifact: MediaLibraryArtifact): string {
  if (artifact.kind === "media-presentation") {
    const itemCount = availableMediaPresentationItems(artifact).length
    return `${itemCount} ${itemCount === 1 ? "file" : "files"} · ${artifact.summary.layout}`
  }

  return artifact.summary.caption ?? artifact.summary.alt
}

function selectMediaLibraryArtifacts(
  snapshots: readonly WorkspaceArtifactsQuerySnapshot[],
): MediaLibraryArtifact[] {
  return snapshots
    .flatMap((snapshot) => snapshot.data?.artifacts ?? [])
    .filter(isRenderableMediaLibraryArtifact)
    .toSorted(sortMediaLibraryArtifacts)
}

function countMediaArtifactsByDirectory(input: {
  directories: readonly string[]
  snapshots: readonly WorkspaceArtifactsQuerySnapshot[]
}): Map<string, number> {
  const counts = new Map<string, number>()
  input.directories.forEach((directory, directoryIndex) => {
    const start = directoryIndex * MEDIA_LIBRARY_KINDS.length
    const count = MEDIA_LIBRARY_KINDS.reduce((sum, _kind, kindIndex) => {
      const snapshot = input.snapshots[start + kindIndex]
      return (
        sum +
        (snapshot?.data?.artifacts.filter(isRenderableMediaLibraryArtifact).length ?? 0)
      )
    }, 0)
    counts.set(directory, count)
  })
  return counts
}

export {
  MEDIA_LIBRARY_KINDS,
  availableMediaPresentationItems,
  artifactKindFilter,
  countMediaArtifactsByDirectory,
  isMediaLibraryArtifact,
  isRenderableMediaLibraryArtifact,
  mediaArtifactSubtitle,
  selectFlashcardDeckArtifacts,
  selectHtmlWidgetArtifacts,
  selectMediaLibraryArtifacts,
  selectMermaidArtifacts,
  selectQuestionSetArtifacts,
  sortMediaLibraryArtifacts,
}

export type {
  FlashcardDeckLibraryArtifact,
  HtmlWidgetLibraryArtifact,
  MediaLibraryArtifact,
  MediaPresentationLibraryArtifact,
  MediaPresentationLibraryItem,
  MermaidLibraryArtifact,
  QuestionSetLibraryArtifact,
  WorkspaceArtifactIndexItem,
  WorkspaceArtifactsQuerySnapshot,
}
