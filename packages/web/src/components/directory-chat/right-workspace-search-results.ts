import type { NotebookSearchResult, NotebookSearchResultKind } from "@/state/notebook-search"
import type { BenchObjectKind } from "@/lib/bench-navigation"
import { isBenchObjectKind } from "@/lib/bench-navigation"
import {
  isRightSidebarVisibleObject,
  type WorkspaceObjectIndexItem,
} from "@/components/layout/chat-left-sidebar/library-object-selectors"
import { relativeTime } from "@/components/layout/sidebar-helpers"

function parseNotebookSearchTimestamp(value: string | undefined): number {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

function notebookSearchTimestampMetadata(prefix: string, timestamp: number): string {
  return timestamp > 0 ? `${prefix} · ${relativeTime(timestamp)}` : prefix
}

function objectKindLabel(kind: BenchObjectKind): string {
  if (kind === "html-widget") return "Widget"
  if (kind === "mermaid") return "Diagram"
  if (kind === "figure" || kind === "freeform-figure") return "Figure"
  if (kind === "media-presentation") return "Media"
  if (kind === "flashcard-deck") return "Flashcards"
  if (kind === "question-set") return "Question set"
  if (kind === "whiteboard") return "Board"
  return "Source"
}

function workspaceObjectSearchKind(
  kind: WorkspaceObjectIndexItem["kind"],
): NotebookSearchResultKind | undefined {
  if (
    kind === "html-widget" ||
    kind === "mermaid" ||
    kind === "figure" ||
    kind === "freeform-figure" ||
    kind === "media-presentation"
  ) {
    return "creation"
  }
  if (kind === "flashcard-deck" || kind === "question-set") return "practice"
  if (kind === "whiteboard") return "board"
  if (kind === "resource") return "source"
  return undefined
}

function notebookSearchResultFromWorkspaceObject(
  object: WorkspaceObjectIndexItem,
): NotebookSearchResult | undefined {
  if (!isRightSidebarVisibleObject(object) || !isBenchObjectKind(object.kind)) {
    return undefined
  }

  const kind = workspaceObjectSearchKind(object.kind)
  if (!kind) return undefined

  const updatedAt = parseNotebookSearchTimestamp(object.updatedAt)
  return {
    id: kind === "source" ? `source:${object.objectID}` : `${kind}:${object.objectID}`,
    kind,
    title: object.title,
    metadata: notebookSearchTimestampMetadata(objectKindLabel(object.kind), updatedAt),
    keywords: object.kind,
    updatedAtMs: updatedAt,
    target: {
      type: "object",
      kind: object.kind,
      objectID: object.objectID,
    },
  }
}

export {
  notebookSearchResultFromWorkspaceObject,
  notebookSearchTimestampMetadata,
  parseNotebookSearchTimestamp,
}
