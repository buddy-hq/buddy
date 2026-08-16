import type { NotebookSearchResult } from "@/state/notebook-search"
import type { BenchObjectKind } from "@/lib/bench-targets"
import { createBenchObjectTarget } from "@/components/layout/chat-left-sidebar/library-object-selectors"
import { describeObject, type ObjectDescriptorInput } from "./describe-object"
import {
  OBJECT_KIND_THREAD,
  OBJECT_KIND_WORKSPACE_FILE,
  OBJECT_THUMBNAIL_COVER,
  type ObjectModel,
  type ObjectPresentationKind,
} from "./types"

const RESOURCE_OBJECT_KIND: BenchObjectKind = "resource"

type TCoverThumbnail = {
  source: typeof OBJECT_THUMBNAIL_COVER
  directory: string
  coverRelpath?: string
  extension: string
  fileName: string
}

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
  const thumbnail: TCoverThumbnail | undefined =
    result.target.type === "resource" && result.resourceVisual
      ? Object.assign(
          {
            source: OBJECT_THUMBNAIL_COVER,
            directory: input.directory,
            extension: result.resourceVisual.extension,
            fileName: result.target.name,
          } as const,
          result.resourceVisual.coverRelpath
            ? { coverRelpath: result.resourceVisual.coverRelpath }
            : undefined,
        )
      : undefined

  const descriptor: ObjectDescriptorInput = Object.assign(
    {
      kind: notebookSearchResultKind(result),
      title: result.title,
      meta: [result.metadata],
      directory: input.directory,
    },
    result.target.type === "resource" && result.resourceVisual ? { thumbnail } : undefined,
    // An unprocessed source has no object yet, so the file on disk is its identity.
    result.target.type === "resource"
      ? {
          target: result.target.objectID
            ? createBenchObjectTarget(RESOURCE_OBJECT_KIND, result.target.objectID)
            : {
                type: "workspace-file" as const,
                path: result.target.path,
                viewer: "file" as const,
              },
        }
      : undefined,
    Object.assign(
      {},
      result.target.type === "object"
        ? { target: createBenchObjectTarget(result.target.kind, result.target.objectID) }
        : undefined,
      result.target.type === "file"
        ? {
            target: {
              type: "workspace-file" as const,
              path: result.target.path,
              viewer: result.target.viewer,
            },
          }
        : undefined,
    ),
  )

  return describeObject(descriptor)
}
