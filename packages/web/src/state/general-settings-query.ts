import { queryOptions } from "@tanstack/react-query"
import { loadGlobalConfig } from "./chat-actions"

const GENERAL_SETTINGS_QUERY_SCOPE = "general-settings" as const
const GENERAL_SETTINGS_BUNDLE_QUERY_KEY = "bundle" as const
const GLOBAL_DIRECTORY_QUERY_KEY = "__global__" as const

export type GeneralSettingsBundle = {
  globalConfig: Record<string, unknown>
}

export const generalSettingsQueryKeys = {
  bundle: () =>
    [
      GENERAL_SETTINGS_QUERY_SCOPE,
      GENERAL_SETTINGS_BUNDLE_QUERY_KEY,
      GLOBAL_DIRECTORY_QUERY_KEY,
    ] as const,
}

async function loadGeneralSettingsBundle(): Promise<GeneralSettingsBundle> {
  const globalConfig = await loadGlobalConfig()

  return { globalConfig }
}

export function generalSettingsQueryOptions() {
  return queryOptions({
    queryKey: generalSettingsQueryKeys.bundle(),
    queryFn: () => loadGeneralSettingsBundle(),
  })
}
