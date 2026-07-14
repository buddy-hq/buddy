import { queryOptions, type QueryClient } from "@tanstack/react-query"
import { loadGlobalConfig } from "./chat-actions"
import { setGlobalConfigQueryData } from "./global-config-query"
import { readPersonalization, type PersonalizationSettings } from "./project-config-readers"

const PERSONALIZATION_SETTINGS_QUERY_SCOPE = "personalization-settings" as const
const PERSONALIZATION_SETTINGS_BUNDLE_QUERY_KEY = "bundle" as const

export type PersonalizationSettingsBundle = {
  globalConfig: Record<string, unknown>
  personalization: PersonalizationSettings
}

export const personalizationSettingsQueryKeys = {
  bundle: () =>
    [PERSONALIZATION_SETTINGS_QUERY_SCOPE, PERSONALIZATION_SETTINGS_BUNDLE_QUERY_KEY] as const,
}

async function loadPersonalizationSettingsBundle(): Promise<PersonalizationSettingsBundle> {
  const globalConfig = await loadGlobalConfig()

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

export function setPersonalizationSettingsQueryData(
  queryClient: QueryClient,
  globalConfig: Record<string, unknown>,
): PersonalizationSettingsBundle {
  const bundle = {
    globalConfig,
    personalization: readPersonalization(globalConfig),
  }

  setGlobalConfigQueryData(queryClient, globalConfig)
  queryClient.setQueryData(personalizationSettingsQueryKeys.bundle(), bundle)
  return bundle
}
