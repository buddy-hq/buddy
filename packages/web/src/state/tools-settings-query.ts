import { queryOptions, type QueryClient } from "@tanstack/react-query"
import { loadGlobalConfig, loadRawProjectConfig } from "./chat-actions"

const TOOLS_SETTINGS_QUERY_SCOPE = "tools-settings" as const
const BUNDLE_QUERY_KEY = "bundle" as const

export type ToolsSettingsBundle = {
  globalConfig: Record<string, unknown>
  rawProjectConfig: Record<string, unknown>
}

export const toolsSettingsQueryKeys = {
  bundle: (directory: string) => [TOOLS_SETTINGS_QUERY_SCOPE, BUNDLE_QUERY_KEY, directory] as const,
}

async function loadToolsSettingsBundle(directory: string): Promise<ToolsSettingsBundle> {
  const [globalConfig, rawProjectConfig] = await Promise.all([
    loadGlobalConfig(),
    loadRawProjectConfig(directory),
  ])

  return {
    globalConfig,
    rawProjectConfig,
  }
}

export function toolsSettingsBundleQueryOptions(directory: string) {
  return queryOptions({
    queryKey: toolsSettingsQueryKeys.bundle(directory),
    queryFn: () => loadToolsSettingsBundle(directory),
  })
}

export function setToolsSettingsBundleQueryData(
  queryClient: QueryClient,
  directory: string,
  nextBundle: ToolsSettingsBundle,
) {
  queryClient.setQueryData(toolsSettingsQueryKeys.bundle(directory), nextBundle)
}
