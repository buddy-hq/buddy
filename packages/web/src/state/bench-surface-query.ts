import { queryOptions } from "@tanstack/react-query"
import { isMarkdownBenchPath } from "@buddy/workspace-file-policy"
import { defaultBenchObjectViewID, type BenchObjectKind } from "@/lib/bench-navigation"
import { resolveResourceObjectViewerPathWithFallback } from "@/lib/resource-object-viewer-path"
import {
  LARGE_TEXT_FILE_LIMIT_BYTES,
  readWorkspaceFileRawMetadata,
} from "@/lib/workspace-file-media"
import {
  readProjectExplorerEditableFile,
  type ProjectExplorerEditableFileState,
} from "@/state/chat-actions"
import { resourcesQueryOptions } from "@/state/resources-query"
import {
  objectFlashcardDeckPayloadQueryOptions,
  objectQuestionSetPayloadQueryOptions,
  objectReadQueryOptions,
  objectViewQueryOptions,
} from "@/state/workspace-objects-query"
import type {
  ObjectFlashcardDeckReadDeckResponse,
  ObjectQuestionSetReadQuestionsResponse,
  ObjectsViewResponse,
} from "@buddy/sdk/types"

/**
 * Bench surfaces used to receive their data from TanStack Router loaders. A parked surface has no
 * route match, so it cannot read loader data — these query options own that fetching instead, which
 * is what lets an instance stay mounted while another chat's target is the active route.
 */

const BENCH_SURFACE_QUERY_ROOT = "bench-surface"
const BENCH_SURFACE_STALE_TIME_MS = 30_000

export const benchSurfaceQueryKeys = {
  root: [BENCH_SURFACE_QUERY_ROOT] as const,
  fileMetadata: (input: { directory: string; path: string }) =>
    [BENCH_SURFACE_QUERY_ROOT, "file-metadata", input.directory, input.path] as const,
  markdownFile: (input: { directory: string; path: string }) =>
    [BENCH_SURFACE_QUERY_ROOT, "markdown-file", input.directory, input.path] as const,
  objectView: (input: {
    directory: string
    kind: BenchObjectKind
    objectID: string
    viewID: string
    revisionID?: string
    itemID?: string
  }) =>
    [
      BENCH_SURFACE_QUERY_ROOT,
      "object-view",
      input.directory,
      input.kind,
      input.objectID,
      input.viewID,
      input.revisionID ?? null,
      input.itemID ?? null,
    ] as const,
}

export type WorkspaceFileMetadata = {
  mimeType: string | undefined
  sizeBytes: number | undefined
}

export function workspaceFileMetadataQueryOptions(input: { directory: string; path: string }) {
  return queryOptions({
    queryKey: benchSurfaceQueryKeys.fileMetadata(input),
    queryFn: (): Promise<WorkspaceFileMetadata> => readWorkspaceFileRawMetadata(input),
    staleTime: BENCH_SURFACE_STALE_TIME_MS,
  })
}

export type MarkdownBenchFileData =
  | {
      status: "ready"
      initialFile: ProjectExplorerEditableFileState
      sizeBytes: number | undefined
    }
  | {
      status: "requires-approval"
      sizeBytes: number
    }

/**
 * Large-file approval is deliberately not consulted here. Approval is a per-open user decision held
 * in a store, and a cached query must not capture it; the surface reads it and re-requests the file.
 */
export function markdownBenchFileQueryOptions(input: { directory: string; path: string }) {
  return queryOptions({
    queryKey: benchSurfaceQueryKeys.markdownFile(input),
    queryFn: async (): Promise<MarkdownBenchFileData> => {
      if (!isMarkdownBenchPath(input.path)) {
        throw new Error("Only Markdown and MDX files can open on the Markdown Bench.")
      }
      const metadata = await readWorkspaceFileRawMetadata(input)
      if (
        typeof metadata.sizeBytes === "number" &&
        metadata.sizeBytes > LARGE_TEXT_FILE_LIMIT_BYTES
      ) {
        return { status: "requires-approval", sizeBytes: metadata.sizeBytes }
      }
      const initialFile = await readProjectExplorerEditableFile(input)
      return { status: "ready", initialFile, sizeBytes: metadata.sizeBytes }
    },
    staleTime: BENCH_SURFACE_STALE_TIME_MS,
  })
}

export function markdownBenchApprovedFileQueryOptions(input: { directory: string; path: string }) {
  return queryOptions({
    queryKey: [...benchSurfaceQueryKeys.markdownFile(input), "approved"] as const,
    queryFn: (): Promise<ProjectExplorerEditableFileState> =>
      readProjectExplorerEditableFile(input),
    staleTime: BENCH_SURFACE_STALE_TIME_MS,
  })
}

export type ObjectBenchSurfaceData = {
  directory: string
  kind: BenchObjectKind
  objectID: string
  view: ObjectsViewResponse | null
  unavailable?: {
    title: string
    reason: string | null
  }
  resourcePath?: string
  resourceViewer?: "reading" | "markdown"
  resourceMarkdown?: ProjectExplorerEditableFileState
  resourceKey?: string
  questionSet?: ObjectQuestionSetReadQuestionsResponse
  flashcardDeck?: ObjectFlashcardDeckReadDeckResponse
}

export function objectBenchSurfaceQueryOptions(input: {
  directory: string
  kind: BenchObjectKind
  objectID: string
  viewID?: string
  revisionID?: string
  itemID?: string
}) {
  const viewID = input.viewID ?? defaultBenchObjectViewID(input.kind)
  return queryOptions({
    queryKey: benchSurfaceQueryKeys.objectView({ ...input, viewID }),
    queryFn: async ({ client }): Promise<ObjectBenchSurfaceData> => {
      const { directory, kind, objectID } = input
      const objectRead = await client.ensureQueryData(
        objectReadQueryOptions({ directory, kind, objectID }),
      )
      if (objectRead.status === "unavailable") {
        return {
          directory,
          kind,
          objectID,
          view: null,
          unavailable: {
            title: objectRead.tombstone.title ?? "Object unavailable",
            reason: objectRead.tombstone.reason ?? null,
          },
        }
      }
      if (objectRead.status === "error") {
        throw new Error(objectRead.loadError.message)
      }

      const view = await client.ensureQueryData(
        objectViewQueryOptions(
          Object.assign(
            {
              directory,
              kind,
              objectID,
              viewID,
            },
            input.revisionID ? { revisionID: input.revisionID } : undefined,
            input.itemID ? { itemID: input.itemID } : undefined,
          ),
        ),
      )

      if (view.data.renderer === "resource-reader") {
        const alias = view.data.alias
        const resourceData = await client.ensureQueryData(resourcesQueryOptions(directory))
        const record = resourceData.processed.find(
          (resource) => resource.objectID === objectID || resource.alias === alias,
        )
        const viewerPath = resolveResourceObjectViewerPathWithFallback({
          record,
          authoritativeReaderPath: view.data.readerPath,
        })
        const resourceMarkdown =
          viewerPath?.viewer === "markdown"
            ? await readProjectExplorerEditableFile({ directory, path: viewerPath.path })
            : undefined
        return Object.assign(
          {
            directory,
            kind,
            objectID,
            view,
          },
          viewerPath
            ? { resourcePath: viewerPath.path, resourceViewer: viewerPath.viewer }
            : undefined,
          resourceMarkdown ? { resourceMarkdown } : undefined,
          { resourceKey: record?.objectID ?? objectID },
        )
      }

      if (view.data.renderer === "question-set") {
        return {
          directory,
          kind,
          objectID,
          view,
          questionSet: await client.ensureQueryData(
            objectQuestionSetPayloadQueryOptions({ directory, objectID }),
          ),
        }
      }

      if (view.data.renderer === "flashcard-deck") {
        return {
          directory,
          kind,
          objectID,
          view,
          flashcardDeck: await client.ensureQueryData(
            objectFlashcardDeckPayloadQueryOptions({ directory, objectID }),
          ),
        }
      }

      return { directory, kind, objectID, view }
    },
    staleTime: BENCH_SURFACE_STALE_TIME_MS,
  })
}
