import { queryOptions, type QueryClient } from "@tanstack/react-query"
import { loadSkillPresentations, loadSkillsCatalog } from "./skills-actions"

const SKILLS_QUERY_SCOPE = "skills" as const
const SKILLS_CATALOG_QUERY_KEY = "catalog" as const
const SKILL_PRESENTATIONS_QUERY_KEY = "presentations" as const
const GLOBAL_DIRECTORY_QUERY_KEY = "__global__" as const
const SKILLS_QUERY_STALE_TIME_MS = 0
/**
 * Artwork and labels only change when skills are installed or removed, and both
 * of those invalidate this query, so the chat surfaces that draw skills do not
 * re-list them every time a composer mounts.
 */
const SKILL_PRESENTATIONS_STALE_TIME_MS = 5 * 60 * 1000

function resolveDirectoryQueryKey(directory?: string) {
  const normalizedDirectory = directory?.trim()
  return normalizedDirectory && normalizedDirectory.length > 0
    ? normalizedDirectory
    : GLOBAL_DIRECTORY_QUERY_KEY
}

export const skillsCatalogQueryKeys = {
  catalog: (directory?: string) =>
    [SKILLS_QUERY_SCOPE, SKILLS_CATALOG_QUERY_KEY, resolveDirectoryQueryKey(directory)] as const,
  presentations: (directory?: string) =>
    [
      SKILLS_QUERY_SCOPE,
      SKILL_PRESENTATIONS_QUERY_KEY,
      resolveDirectoryQueryKey(directory),
    ] as const,
}

export function skillPresentationsQueryOptions(directory?: string) {
  return queryOptions({
    queryKey: skillsCatalogQueryKeys.presentations(directory),
    queryFn: () => loadSkillPresentations(directory),
    staleTime: SKILL_PRESENTATIONS_STALE_TIME_MS,
  })
}

export function skillsCatalogQueryOptions(directory?: string) {
  return queryOptions({
    queryKey: skillsCatalogQueryKeys.catalog(directory),
    queryFn: () => loadSkillsCatalog(directory),
    staleTime: SKILLS_QUERY_STALE_TIME_MS,
  })
}

export function invalidateSkillPresentationsQuery(
  queryClient: QueryClient,
  directory?: string,
): Promise<void> {
  return queryClient.invalidateQueries({
    queryKey: skillsCatalogQueryKeys.presentations(directory),
  })
}

/**
 * Installing, removing or renaming a skill changes both what the drawer lists
 * and what the chat surfaces draw, so the two views of the same skills are
 * always invalidated together.
 */
export function invalidateSkillsCatalogQuery(queryClient: QueryClient, directory?: string) {
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: skillsCatalogQueryKeys.catalog(directory),
    }),
    invalidateSkillPresentationsQuery(queryClient, directory),
  ])
}

export function invalidateAllSkillsCatalogQueries(queryClient: QueryClient) {
  return queryClient.invalidateQueries({
    queryKey: [SKILLS_QUERY_SCOPE],
  })
}
