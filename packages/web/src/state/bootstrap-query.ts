import { queryOptions, type QueryClient } from "@tanstack/react-query"
import {
  bootstrapOpenProjects,
  loadNotebookHome,
  loadOpenProjects,
  loadProviderCatalogSnapshot,
  preloadProjectSessions,
  type NotebookHomeState,
} from "./chat-actions"

const BOOTSTRAP_QUERY_SCOPE = "bootstrap" as const
const OPEN_PROJECTS_QUERY_KEY = "open-projects" as const
const OPEN_PROJECTS_WITH_SESSIONS_QUERY_KEY = "open-projects-with-sessions" as const
const NOTEBOOK_HOME_QUERY_KEY = "notebook-home" as const
const PROVIDER_SNAPSHOT_QUERY_KEY = "provider-snapshot" as const
const PRELOADED_SESSIONS_QUERY_KEY = "preloaded-sessions" as const
const GLOBAL_DIRECTORY_QUERY_KEY = "__global__" as const

function normalizeDirectories(directories: readonly string[]) {
  return Array.from(
    new Set(directories.map((directory) => directory.trim()).filter(Boolean)),
  ).toSorted((left, right) => left.localeCompare(right))
}

export const bootstrapQueryKeys = {
  openProjects: () => [BOOTSTRAP_QUERY_SCOPE, OPEN_PROJECTS_QUERY_KEY] as const,
  openProjectsWithSessions: () =>
    [BOOTSTRAP_QUERY_SCOPE, OPEN_PROJECTS_WITH_SESSIONS_QUERY_KEY] as const,
  notebookHome: () => [BOOTSTRAP_QUERY_SCOPE, NOTEBOOK_HOME_QUERY_KEY] as const,
  providerSnapshot: (directory?: string) =>
    [
      BOOTSTRAP_QUERY_SCOPE,
      PROVIDER_SNAPSHOT_QUERY_KEY,
      directory ?? GLOBAL_DIRECTORY_QUERY_KEY,
    ] as const,
  preloadedSessions: (directories: readonly string[]) =>
    [
      BOOTSTRAP_QUERY_SCOPE,
      PRELOADED_SESSIONS_QUERY_KEY,
      ...normalizeDirectories(directories),
    ] as const,
}

export function openProjectsQueryOptions() {
  return queryOptions({
    queryKey: bootstrapQueryKeys.openProjects(),
    queryFn: () => loadOpenProjects(),
  })
}

export function openProjectsWithSessionsQueryOptions() {
  return queryOptions({
    queryKey: bootstrapQueryKeys.openProjectsWithSessions(),
    queryFn: () => bootstrapOpenProjects(),
  })
}

export function notebookHomeQueryOptions() {
  return queryOptions({
    queryKey: bootstrapQueryKeys.notebookHome(),
    queryFn: () => loadNotebookHome(),
  })
}

export function providerCatalogSnapshotQueryOptions(directory?: string) {
  return queryOptions({
    queryKey: bootstrapQueryKeys.providerSnapshot(directory),
    queryFn: () => loadProviderCatalogSnapshot(directory),
  })
}

export function preloadedProjectSessionsQueryOptions(directories: readonly string[]) {
  const normalizedDirectories = normalizeDirectories(directories)
  return queryOptions({
    queryKey: bootstrapQueryKeys.preloadedSessions(normalizedDirectories),
    queryFn: async () => {
      await preloadProjectSessions(normalizedDirectories)
      return normalizedDirectories
    },
  })
}

export function setOpenProjectsQueryData(queryClient: QueryClient, directories: readonly string[]) {
  const normalizedDirectories = normalizeDirectories(directories)
  queryClient.setQueryData(bootstrapQueryKeys.openProjects(), normalizedDirectories)
  queryClient.setQueryData(bootstrapQueryKeys.openProjectsWithSessions(), normalizedDirectories)
}

export function setNotebookHomeQueryData(
  queryClient: QueryClient,
  nextNotebookHome: NotebookHomeState,
) {
  queryClient.setQueryData(bootstrapQueryKeys.notebookHome(), nextNotebookHome)
}
