import type { NotebookSearchResult } from "@/state/notebook-search"
import type { BenchObjectKind } from "@/lib/bench-targets"
import { createBenchObjectTarget } from "@/components/layout/chat-left-sidebar/library-object-selectors"
import { describeObject } from "./describe-object"
import {
  OBJECT_KIND_THREAD,
  OBJECT_KIND_WORKSPACE_FILE,
  OBJECT_THUMBNAIL_COVER,
  type ObjectModel,
  type ObjectPresentationKind,
} from "./types"

const RESOURCE_OBJECT_KIND: BenchObjectKind = "resource"

/**
 * The target, not the filter bucket, decides how a result is drawn: it names the
 * exact object kind, so a widget and a diagram get their own glyphs instead of
 * sharing one "creation" icon.
 */
export function notebookSearchResultKind(result: NotebookSearchResult): ObjectPresentationKind {
  if (result.target.type === "object") return result.target.kind
  if (result.target.type === "resource") return RESOURCE_OBJECT_KIND
  if (result.target.type === "thread") return OBJECT_KIND_THREAD
  return OBJECT_KIND_WORKSPACE_FILE
}

/** One presentation for a search result, wherever the search is offered. */
export function describeNotebookSearchResult(input: {
  result: NotebookSearchResult
  directory: string
}): ObjectModel {
  const { result } = input

  return describeObject({
    kind: notebookSearchResultKind(result),
    title: result.title,
    meta: [result.metadata],
    directory: input.directory,
    ...(result.target.type === "resource" && result.resourceVisual
      ? {
          thumbnail: {
            source: OBJECT_THUMBNAIL_COVER,
            directory: input.directory,
            ...(result.resourceVisual.coverRelpath
              ? { coverRelpath: result.resourceVisual.coverRelpath }
              : {}),
            extension: result.resourceVisual.extension,
            fileName: result.target.name,
          },
        }
      : {}),
    // An unprocessed source has no object yet, so the file on disk is its identity.
    ...(result.target.type === "resource"
      ? {
          target: result.target.objectID
            ? createBenchObjectTarget(RESOURCE_OBJECT_KIND, result.target.objectID)
            : {
                type: "workspace-file" as const,
                path: result.target.path,
                viewer: "file" as const,
              },
        }
      : {}),
    ...(result.target.type === "object"
      ? { target: createBenchObjectTarget(result.target.kind, result.target.objectID) }
      : {}),
    ...(result.target.type === "file"
      ? {
          target: {
            type: "workspace-file" as const,
            path: result.target.path,
            viewer: result.target.viewer,
          },
        }
      : {}),
  })
}
