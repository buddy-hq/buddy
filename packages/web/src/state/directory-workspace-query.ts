import { queryOptions, type QueryClient } from "@tanstack/react-query"
import {
  readPersistedDirectoryWorkspace,
  type DirectoryWorkspacePersistenceReadResult,
  type DirectoryWorkspacePersistenceStorage,
} from "@/state/directory-workspace-store"
import { v1ImportMayBeIncomplete, v1ImportQueryOptions } from "@/state/v1-import-query"

export type DirectoryWorkspaceHydrationData = {
  persisted: DirectoryWorkspacePersistenceReadResult
  importMayBeIncomplete: boolean
}

export function directoryWorkspaceHydrationQueryKey(
  directory: string,
): readonly ["directory-workspace-hydration", string] {
  return ["directory-workspace-hydration", directory]
}

export async function loadDirectoryWorkspaceHydration(input: {
  directory: string
  queryClient: QueryClient
  storage?: DirectoryWorkspacePersistenceStorage
}): Promise<DirectoryWorkspaceHydrationData> {
  const [persisted, importReport] = await Promise.all([
    readPersistedDirectoryWorkspace(input),
    input.queryClient.fetchQuery(v1ImportQueryOptions()).catch(() => undefined),
  ])
  return { persisted, importMayBeIncomplete: v1ImportMayBeIncomplete(importReport) }
}

export function directoryWorkspaceHydrationQueryOptions(directory: string) {
  return queryOptions({
    queryKey: directoryWorkspaceHydrationQueryKey(directory),
    queryFn: ({ client }) => loadDirectoryWorkspaceHydration({ directory, queryClient: client }),
    gcTime: Infinity,
    retry: false,
  })
}
