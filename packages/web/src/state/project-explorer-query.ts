import type { FileNode } from "@buddy/sdk"
import { queryOptions, type QueryClient } from "@tanstack/react-query"
import { listProjectExplorerDirectory } from "@/state/chat-actions"

const PROJECT_EXPLORER_DIRECTORY_QUERY_SCOPE = "project-explorer-directory" as const

function projectExplorerDirectoryQueryKey(input: { directory: string; path: string }) {
  return [PROJECT_EXPLORER_DIRECTORY_QUERY_SCOPE, input.directory, input.path] as const
}

export function projectExplorerDirectoryQueryOptions(input: { directory: string; path: string }) {
  return queryOptions({
    queryKey: projectExplorerDirectoryQueryKey(input),
    queryFn: (): Promise<FileNode[]> => listProjectExplorerDirectory(input),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  })
}

export async function invalidateProjectExplorerListings(
  queryClient: QueryClient,
  directory: string,
) {
  const queryKey = [PROJECT_EXPLORER_DIRECTORY_QUERY_SCOPE, directory]
  // A folder's first listing has no data to refetch over, so invalidation would join it even when
  // it started before the change.
  await queryClient.cancelQueries({ queryKey })
  await queryClient.invalidateQueries({ queryKey })
}
