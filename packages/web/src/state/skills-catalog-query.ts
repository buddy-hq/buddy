import { queryOptions, type QueryClient } from "@tanstack/react-query"
import { loadSkillsCatalog } from "./skills-actions"

const SKILLS_QUERY_SCOPE = "skills" as const
const SKILLS_CATALOG_QUERY_KEY = "catalog" as const
const GLOBAL_DIRECTORY_QUERY_KEY = "__global__" as const
const SKILLS_QUERY_STALE_TIME_MS = 0

function resolveDirectoryQueryKey(directory?: string) {
  const normalizedDirectory = directory?.trim()
  return normalizedDirectory && normalizedDirectory.length > 0
    ? normalizedDirectory
    : GLOBAL_DIRECTORY_QUERY_KEY
}

export const skillsCatalogQueryKeys = {
  catalog: (directory?: string) =>
    [SKILLS_QUERY_SCOPE, SKILLS_CATALOG_QUERY_KEY, resolveDirectoryQueryKey(directory)] as const,
}

export function skillsCatalogQueryOptions(directory?: string) {
  return queryOptions({
    queryKey: skillsCatalogQueryKeys.catalog(directory),
    queryFn: () => loadSkillsCatalog(directory),
    staleTime: SKILLS_QUERY_STALE_TIME_MS,
  })
}

export function invalidateSkillsCatalogQuery(queryClient: QueryClient, directory?: string) {
  return queryClient.invalidateQueries({
    queryKey: skillsCatalogQueryKeys.catalog(directory),
  })
}

export function invalidateAllSkillsCatalogQueries(queryClient: QueryClient) {
  return queryClient.invalidateQueries({
    queryKey: [SKILLS_QUERY_SCOPE, SKILLS_CATALOG_QUERY_KEY],
  })
}
