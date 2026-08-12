import { useCallback } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { BENCH_CHAT_LAYOUT_DOCKED, type BenchModeRequest } from "@/lib/bench-targets"
import { useOpenBench, type OpenBenchResult } from "@/lib/use-open-bench"
import {
  isSupportedReadingResourcePath,
  readingResourceBlobQueryOptions,
  resourcesQueryOptions,
  type ResourceReadingTarget,
} from "@/state/resources-query"

/** Statuses where the bytes are not on disk yet, so prefetching them only fails. */
const READING_PREFETCH_BLOCKED_STATUSES = new Set<NonNullable<ResourceReadingTarget["status"]>>([
  "preparing",
  "unsupported",
  "error",
])

export type OpenReadingResource = (
  directory: string,
  resource: ResourceReadingTarget,
) => Promise<OpenBenchResult>

export type OpenReadingResourceOptions = {
  /** Defaults to docked; pass the policy request to keep the mode Bench is in. */
  mode?: BenchModeRequest
}

/**
 * Opens a source in the reader, warming the catalog and the file bytes on the
 * way. A processed source opens as its object so the reader keeps its position;
 * an unprocessed one opens as the plain file it still is.
 */
export function useOpenReadingResource(options?: OpenReadingResourceOptions): OpenReadingResource {
  const queryClient = useQueryClient()
  const openBench = useOpenBench()
  const mode = options?.mode ?? BENCH_CHAT_LAYOUT_DOCKED

  return useCallback(
    async (directory: string, resource: ResourceReadingTarget) => {
      void queryClient.prefetchQuery(resourcesQueryOptions(directory))
      const canPrefetchReadingBlob =
        isSupportedReadingResourcePath(resource.path) &&
        (resource.status === undefined || !READING_PREFETCH_BLOCKED_STATUSES.has(resource.status))
      if (canPrefetchReadingBlob) {
        void queryClient.prefetchQuery(readingResourceBlobQueryOptions(directory, resource.path))
      }

      return openBench({
        directory,
        target: resource.objectID
          ? {
              type: "object",
              ref: {
                kind: "resource",
                objectID: resource.objectID,
                revisionID: null,
                itemID: null,
              },
              viewID: "reader",
            }
          : { type: "workspace-file", path: resource.path, viewer: "file" },
        mode,
        autoOpen: null,
      })
    },
    [mode, openBench, queryClient],
  )
}
