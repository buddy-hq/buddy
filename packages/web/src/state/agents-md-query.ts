import { queryOptions, type QueryClient } from "@tanstack/react-query"
import { loadNotebookAgentsMd, type NotebookAgentsMdState } from "./agents-md-actions"
import { loadGlobalAgentsMd, type GlobalAgentsMdState } from "./global-agents-md-actions"

const AGENTS_MD_QUERY_SCOPE = "agents-md" as const
const NOTEBOOK_QUERY_KEY = "notebook" as const
const GLOBAL_QUERY_KEY = "global" as const

export const agentsMdQueryKeys = {
  notebook: (directory: string) => [AGENTS_MD_QUERY_SCOPE, NOTEBOOK_QUERY_KEY, directory] as const,
  global: () => [AGENTS_MD_QUERY_SCOPE, GLOBAL_QUERY_KEY] as const,
}

export function notebookAgentsMdQueryOptions(directory: string) {
  return queryOptions({
    queryKey: agentsMdQueryKeys.notebook(directory),
    queryFn: () => loadNotebookAgentsMd(directory),
  })
}

export function globalAgentsMdQueryOptions() {
  return queryOptions({
    queryKey: agentsMdQueryKeys.global(),
    queryFn: () => loadGlobalAgentsMd(),
  })
}

export function setNotebookAgentsMdQueryData(
  queryClient: QueryClient,
  directory: string,
  nextState: NotebookAgentsMdState,
) {
  queryClient.setQueryData(agentsMdQueryKeys.notebook(directory), nextState)
}

export function setGlobalAgentsMdQueryData(
  queryClient: QueryClient,
  nextState: GlobalAgentsMdState,
) {
  queryClient.setQueryData(agentsMdQueryKeys.global(), nextState)
}
