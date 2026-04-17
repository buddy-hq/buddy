import { queryOptions, type QueryClient } from "@tanstack/react-query"
import { loadMcpStatus, loadProjectConfig } from "./chat-actions"

const MCP_DIRECTORY_QUERY_SCOPE = "mcp-directory" as const
const MCP_STATUS_QUERY_KEY = "status" as const
const PROJECT_CONFIG_QUERY_KEY = "project-config" as const
const GLOBAL_DIRECTORY_QUERY_KEY = "__global__" as const
const MCP_QUERY_STALE_TIME_MS = 0

function resolveDirectoryQueryKey(directory: string) {
  const normalizedDirectory = directory.trim()
  return normalizedDirectory.length > 0 ? normalizedDirectory : GLOBAL_DIRECTORY_QUERY_KEY
}

export const mcpDirectoryQueryKeys = {
  status: (directory: string) =>
    [MCP_DIRECTORY_QUERY_SCOPE, MCP_STATUS_QUERY_KEY, resolveDirectoryQueryKey(directory)] as const,
  projectConfig: (directory: string) =>
    [
      MCP_DIRECTORY_QUERY_SCOPE,
      PROJECT_CONFIG_QUERY_KEY,
      resolveDirectoryQueryKey(directory),
    ] as const,
}

export function mcpStatusQueryOptions(directory: string) {
  return queryOptions({
    queryKey: mcpDirectoryQueryKeys.status(directory),
    queryFn: () => loadMcpStatus(directory),
    staleTime: MCP_QUERY_STALE_TIME_MS,
  })
}

export function projectConfigQueryOptions(directory: string) {
  return queryOptions({
    queryKey: mcpDirectoryQueryKeys.projectConfig(directory),
    queryFn: () => loadProjectConfig(directory),
    staleTime: MCP_QUERY_STALE_TIME_MS,
  })
}

export async function invalidateMcpDirectoryQueries(queryClient: QueryClient, directory: string) {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: mcpDirectoryQueryKeys.status(directory),
    }),
    queryClient.invalidateQueries({
      queryKey: mcpDirectoryQueryKeys.projectConfig(directory),
    }),
  ])
}
