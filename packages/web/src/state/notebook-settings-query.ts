import { queryOptions, type QueryClient } from "@tanstack/react-query"
import { loadRawProjectConfig } from "./chat-actions"

const NOTEBOOK_SETTINGS_QUERY_SCOPE = "notebook-settings" as const
const NOTEBOOK_RAW_PROJECT_CONFIG_QUERY_KEY = "raw-project-config" as const

export const notebookSettingsQueryKeys = {
  rawProjectConfig: (directory: string) =>
    [NOTEBOOK_SETTINGS_QUERY_SCOPE, NOTEBOOK_RAW_PROJECT_CONFIG_QUERY_KEY, directory] as const,
}

export function notebookRawProjectConfigQueryOptions(directory: string) {
  return queryOptions({
    queryKey: notebookSettingsQueryKeys.rawProjectConfig(directory),
    queryFn: () => loadRawProjectConfig(directory),
  })
}

export function invalidateNotebookRawProjectConfigQuery(
  queryClient: QueryClient,
  directory: string,
) {
  return queryClient.invalidateQueries({
    queryKey: notebookSettingsQueryKeys.rawProjectConfig(directory),
  })
}
