import { isMarkdownBenchPath } from "@buddy/workspace-file-policy"
import type { NotebookSearchResult, NotebookSearchResultKind } from "@/state/notebook-search"
import type { SessionInfo } from "@/state/chat-types"
import type { BenchObjectKind } from "@/lib/bench-navigation"
import { isBenchObjectKind } from "@/lib/bench-navigation"
import {
  isRightSidebarVisibleObject,
  type WorkspaceObjectIndexItem,
} from "@/components/layout/chat-left-sidebar/library-object-selectors"
import { relativeTime } from "@/components/layout/sidebar-helpers"
import type { ResourceRecord } from "@/state/resource-actions"
import { resourceFileExtensionFromFormat } from "@/state/resources-query"
import {
  fileExtensionFromPath,
  fileNameFromPath,
  normalizeRelativePath,
} from "@/lib/workspace-file-paths"

const NOTEBOOK_ROOT_LABEL = "Notebook root"

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

function titleCaseStatus(value: string): string {
  return `${value.slice(0, 1).toLocaleUpperCase()}${value.slice(1)}`
}

/** Where the resource actually opens from: reader output, origin, then source. */
function resourcePath(record: ResourceRecord): string {
  return record.readerPath ?? record.sourceOriginRelpath ?? record.sourceRelpath
}

function resourceExtension(record: ResourceRecord) {
  const fromFormat = resourceFileExtensionFromFormat(record.format)
  if (fromFormat) return fromFormat
  const extension = fileExtensionFromPath(resourcePath(record))
  return extension === "pdf" || extension === "epub" ? extension : undefined
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

/**
 * A processed source. Its recency comes from the object index where the caller
 * has it — a resource's own `preparedAt` only records when it was ingested.
 */
function notebookSearchResultFromResource(
  resource: ResourceRecord,
  updatedAtMs?: number,
): NotebookSearchResult {
  const path = resourcePath(resource)
  const extension = resourceExtension(resource)
  const updatedAt = updatedAtMs ?? parseNotebookSearchTimestamp(resource.preparedAt)
  const result: NotebookSearchResult = {
    id: `source:${resource.objectID}`,
    kind: "source",
    title: resource.title ?? resource.alias ?? fileNameFromPath(path),
    metadata: `${resource.format.toUpperCase()} · ${
      resource.author ?? titleCaseStatus(resource.status)
    }`,
    keywords: `${resource.sourceRelpath} ${resource.sourceOriginRelpath ?? ""}`,
    updatedAtMs: updatedAt,
    target: {
      type: "resource",
      path,
      name: fileNameFromPath(path) || resource.alias,
      objectID: resource.objectID,
      status: resource.status,
    },
  }
  if (extension) {
    result.resourceVisual = {
      extension,
      ...(resource.coverRelpath ? { coverRelpath: resource.coverRelpath } : {}),
    }
  }
  return result
}

function notebookSearchResultFromSession(session: SessionInfo): NotebookSearchResult {
  const updatedAt = session.time.updated ?? session.time.created
  return {
    id: `thread:${session.id}`,
    kind: "thread",
    title: session.title,
    metadata: notebookSearchTimestampMetadata("Chat", updatedAt),
    updatedAtMs: updatedAt,
    target: { type: "thread", sessionID: session.id },
  }
}

/**
 * A file the remote scan found. A PDF or EPUB with no resource record behind it
 * is still a source — the reader can open it, it just has not been processed.
 */
function notebookSearchResultFromFilePath(path: string): NotebookSearchResult {
  const extension = fileExtensionFromPath(path)
  const name = fileNameFromPath(path)
  const normalizedPath = normalizeRelativePath(path) ?? path
  const parentPath = normalizedPath.includes("/")
    ? normalizedPath.slice(0, normalizedPath.lastIndexOf("/"))
    : NOTEBOOK_ROOT_LABEL

  if (extension === "pdf" || extension === "epub") {
    return {
      id: `source-file:${normalizedPath}`,
      kind: "source",
      title: name,
      metadata: `${extension.toUpperCase()} · Unprocessed`,
      keywords: normalizedPath,
      updatedAtMs: 0,
      target: {
        type: "resource",
        path: normalizedPath,
        name,
        status: "unprocessed",
      },
      resourceVisual: { extension },
    }
  }

  return {
    id: `file:${normalizedPath}`,
    kind: "file",
    title: name,
    metadata: `File · ${parentPath}`,
    keywords: normalizedPath,
    updatedAtMs: 0,
    target: {
      type: "file",
      path: normalizedPath,
      viewer: isMarkdownBenchPath(normalizedPath) ? "markdown" : "file",
    },
  }
}

export {
  notebookSearchResultFromFilePath,
  notebookSearchResultFromResource,
  notebookSearchResultFromSession,
  notebookSearchResultFromWorkspaceObject,
  notebookSearchTimestampMetadata,
  parseNotebookSearchTimestamp,
  resourcePath,
}
