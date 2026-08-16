import { queryOptions, type QueryClient } from "@tanstack/react-query"
import { loadGlobalConfig } from "./chat-actions"
import { setGlobalConfigQueryData } from "./global-config-query"
import { readPersonalization, type PersonalizationSettings } from "./project-config-readers"
import { EMPTY_BUDDY_CONFIG, parseBuddyConfigObject, type TBuddyConfigObject } from "./parse-external"

const PERSONALIZATION_SETTINGS_QUERY_SCOPE = "personalization-settings" as const
const PERSONALIZATION_SETTINGS_BUNDLE_QUERY_KEY = "bundle" as const

export type PersonalizationSettingsBundle = {
  globalConfig: TBuddyConfigObject
  personalization: PersonalizationSettings
}

export const personalizationSettingsQueryKeys = {
  bundle: () =>
    [PERSONALIZATION_SETTINGS_QUERY_SCOPE, PERSONALIZATION_SETTINGS_BUNDLE_QUERY_KEY] as const,
}

async function loadPersonalizationSettingsBundle(): Promise<PersonalizationSettingsBundle> {
  const globalConfig = parseBuddyConfigObject(await loadGlobalConfig()) ?? EMPTY_BUDDY_CONFIG

  return {
    globalConfig,
    personalization: readPersonalization(globalConfig),
  }
}

export function personalizationSettingsQueryOptions() {
  return queryOptions({
    queryKey: personalizationSettingsQueryKeys.bundle(),
    queryFn: () => loadPersonalizationSettingsBundle(),
  })
}

export function setPersonalizationSettingsQueryData<TConfig>(
  queryClient: QueryClient,
  globalConfig: TConfig,
): PersonalizationSettingsBundle {
  const parsed = parseBuddyConfigObject(globalConfig) ?? EMPTY_BUDDY_CONFIG
  const bundle = {
    globalConfig: parsed,
    personalization: readPersonalization(parsed),
  }

  setGlobalConfigQueryData(queryClient, parsed)
  queryClient.setQueryData(personalizationSettingsQueryKeys.bundle(), bundle)
  return bundle
}
