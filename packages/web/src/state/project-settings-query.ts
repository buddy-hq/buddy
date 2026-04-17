import { queryOptions, type QueryClient } from "@tanstack/react-query"
import {
  loadPersonaCatalog,
  loadProjectConfig,
  loadProviderCatalog,
  type PersonaConfigOption,
} from "./chat-actions"
import type { ProviderCatalogState } from "./chat-types"

const PROJECT_SETTINGS_QUERY_SCOPE = "project-settings" as const
const PROJECT_SETTINGS_BUNDLE_QUERY_KEY = "bundle" as const
const GLOBAL_DIRECTORY_QUERY_KEY = "__global__" as const

export type ProjectSettingsBundle = {
  projectConfig: Record<string, unknown>
  providerCatalog: ProviderCatalogState
  personaCatalog: PersonaConfigOption[]
}

function resolveDirectoryQueryKey(directory: string) {
  const normalizedDirectory = directory.trim()
  return normalizedDirectory.length > 0 ? normalizedDirectory : GLOBAL_DIRECTORY_QUERY_KEY
}

export const projectSettingsQueryKeys = {
  bundle: (directory: string) =>
    [
      PROJECT_SETTINGS_QUERY_SCOPE,
      PROJECT_SETTINGS_BUNDLE_QUERY_KEY,
      resolveDirectoryQueryKey(directory),
    ] as const,
}

async function loadProjectSettingsBundle(directory: string): Promise<ProjectSettingsBundle> {
  const [projectConfig, providerCatalog, personas] = await Promise.all([
    loadProjectConfig(directory),
    loadProviderCatalog(directory),
    loadPersonaCatalog(directory),
  ])

  return {
    projectConfig,
    providerCatalog,
    personaCatalog: personas.filter((persona) => !persona.hidden),
  }
}

export function projectSettingsQueryOptions(directory: string) {
  return queryOptions({
    queryKey: projectSettingsQueryKeys.bundle(directory),
    queryFn: () => loadProjectSettingsBundle(directory),
  })
}

export function invalidateProjectSettingsQuery(queryClient: QueryClient, directory: string) {
  return queryClient.invalidateQueries({
    queryKey: projectSettingsQueryKeys.bundle(directory),
  })
}
