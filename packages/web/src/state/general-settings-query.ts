import { queryOptions } from "@tanstack/react-query"
import { loadGlobalConfig } from "./chat-actions"
import {
  EMPTY_BUDDY_CONFIG,
  parseBuddyConfigObject,
  type TBuddyConfigObject,
} from "./parse-external"

const GENERAL_SETTINGS_QUERY_SCOPE = "general-settings" as const
const GENERAL_SETTINGS_BUNDLE_QUERY_KEY = "bundle" as const
const GLOBAL_DIRECTORY_QUERY_KEY = "__global__" as const

export type GeneralSettingsBundle = {
  globalConfig: TBuddyConfigObject
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
  const globalConfig = parseBuddyConfigObject(await loadGlobalConfig()) ?? EMPTY_BUDDY_CONFIG

  return { globalConfig }
}

export function generalSettingsQueryOptions() {
  return queryOptions({
    queryKey: generalSettingsQueryKeys.bundle(),
    queryFn: () => loadGeneralSettingsBundle(),
  })
}
