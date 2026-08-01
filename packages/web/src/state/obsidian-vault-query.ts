import type { ObsidianProfileResponses, ObsidianResolveLinksResponses } from "@buddy/sdk"
import { queryOptions, type QueryClient } from "@tanstack/react-query"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"

const OBSIDIAN_VAULT_QUERY_SCOPE = "obsidian-vault" as const
const OBSIDIAN_VAULT_PROFILE_STALE_TIME_MS = 30_000
const OBSIDIAN_LINK_RESOLUTIONS_STALE_TIME_MS = 30_000
const OBSIDIAN_RESOLVE_LINKS_BATCH_SIZE = 500
const MARKDOWN_EXTENSION = ".md"
const OBSIDIAN_CONFIG_MARKER_FILE_NAMES = new Set(["app.json", "core-plugins.json"])
const MARKDOWN_FRONTMATTER_PATTERN =
  /^\uFEFF?---[\t ]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[\t ]*(?:\r?\n|$)/u

export type ObsidianVaultProfile = ObsidianProfileResponses[200]
export type ObsidianLinkResolution = ObsidianResolveLinksResponses[200]["links"][number]

function obsidianLinkScopeQueryKey(directory: string) {
  return [OBSIDIAN_VAULT_QUERY_SCOPE, "links", directory] as const
}

function markdownFrontmatter(content: string): string | undefined {
  return MARKDOWN_FRONTMATTER_PATTERN.exec(content)?.[0]
}

function obsidianResolutionMetadataChanged(input: {
  path: string
  content: string
  previousContent?: string
}): boolean {
  if (!input.path.toLocaleLowerCase().endsWith(MARKDOWN_EXTENSION)) return false
  if (input.previousContent === undefined) return true
  return markdownFrontmatter(input.previousContent) !== markdownFrontmatter(input.content)
}

function obsidianProfileMayHaveChanged(input: {
  path: string
  event: "add" | "change" | "unlink"
}): boolean {
  const segments = input.path.replaceAll("\\", "/").split("/").filter(Boolean)
  const rootEntry = segments[0]
  if (!rootEntry?.startsWith(".")) return false
  if (segments.length === 1) {
    return input.event !== "change"
  }
  return segments.length === 2 && OBSIDIAN_CONFIG_MARKER_FILE_NAMES.has(segments[1] ?? "")
}

export const obsidianVaultQueryKeys = {
  profile: (directory: string) => [OBSIDIAN_VAULT_QUERY_SCOPE, "profile", directory] as const,
  linkScope: obsidianLinkScopeQueryKey,
  links: (directory: string, documentPath: string, targets: readonly string[]) =>
    [...obsidianLinkScopeQueryKey(directory), documentPath, targets] as const,
  embeddedNote: (directory: string, path: string) =>
    [OBSIDIAN_VAULT_QUERY_SCOPE, "embedded-note", directory, path] as const,
}

export async function loadObsidianVaultProfile(directory: string): Promise<ObsidianVaultProfile> {
  return requireBuddyData<ObsidianVaultProfile>(await getBuddyClient(directory).obsidian.profile())
}

async function updateObsidianVaultConnection(
  directory: string,
  connected: boolean,
): Promise<ObsidianVaultProfile> {
  requireBuddyData(
    await getBuddyClient(directory).config.update({
      body: { obsidian_vault: { connected } },
    }),
  )
  return loadObsidianVaultProfile(directory)
}

export function connectObsidianVault(directory: string): Promise<ObsidianVaultProfile> {
  return updateObsidianVaultConnection(directory, true)
}

export function disconnectObsidianVault(directory: string): Promise<ObsidianVaultProfile> {
  return updateObsidianVaultConnection(directory, false)
}

export function batchObsidianLinkTargets(targets: readonly string[]): string[][] {
  const batches: string[][] = []
  for (let index = 0; index < targets.length; index += OBSIDIAN_RESOLVE_LINKS_BATCH_SIZE) {
    batches.push(targets.slice(index, index + OBSIDIAN_RESOLVE_LINKS_BATCH_SIZE))
  }
  return batches
}

export function obsidianVaultProfileQueryOptions(directory: string) {
  return queryOptions({
    queryKey: obsidianVaultQueryKeys.profile(directory),
    queryFn: () => loadObsidianVaultProfile(directory),
    staleTime: OBSIDIAN_VAULT_PROFILE_STALE_TIME_MS,
  })
}

export function obsidianLinkResolutionsQueryOptions(input: {
  directory: string
  documentPath: string
  enabled: boolean
  targets: readonly string[]
}) {
  return queryOptions({
    queryKey: obsidianVaultQueryKeys.links(input.directory, input.documentPath, input.targets),
    queryFn: async () => {
      const client = getBuddyClient(input.directory)
      const responses: ObsidianResolveLinksResponses[200][] = []
      for (const targets of batchObsidianLinkTargets(input.targets)) {
        const response = await client.obsidian.resolveLinks({
          documentPath: input.documentPath,
          targets,
        })
        responses.push(requireBuddyData<ObsidianResolveLinksResponses[200]>(response))
      }
      return {
        links: responses.flatMap((response) => response.links),
        partial: responses.some((response) => response.partial),
      }
    },
    enabled: input.enabled && input.targets.length > 0,
    staleTime: OBSIDIAN_LINK_RESOLUTIONS_STALE_TIME_MS,
  })
}

export async function invalidateObsidianFileCaches(
  queryClient: QueryClient,
  input: {
    directory: string
    path: string
    content: string
    previousContent?: string
  },
): Promise<void> {
  const invalidations = [
    queryClient.invalidateQueries({
      queryKey: obsidianVaultQueryKeys.embeddedNote(input.directory, input.path),
    }),
  ]
  if (obsidianResolutionMetadataChanged(input)) {
    invalidations.push(
      queryClient.invalidateQueries({
        queryKey: obsidianVaultQueryKeys.linkScope(input.directory),
      }),
    )
  }
  await Promise.all(invalidations)
}

export async function invalidateObsidianWatcherCaches(
  queryClient: QueryClient,
  input: {
    directory: string
    path: string
    event: "add" | "change" | "unlink"
  },
): Promise<void> {
  const invalidations = [
    queryClient.invalidateQueries({
      queryKey: obsidianVaultQueryKeys.embeddedNote(input.directory, input.path),
    }),
  ]
  if (obsidianProfileMayHaveChanged(input)) {
    invalidations.push(
      queryClient.invalidateQueries({
        queryKey: obsidianVaultQueryKeys.profile(input.directory),
      }),
    )
  }
  if (input.event !== "change" || input.path.toLocaleLowerCase().endsWith(MARKDOWN_EXTENSION)) {
    invalidations.push(
      queryClient.invalidateQueries({
        queryKey: obsidianVaultQueryKeys.linkScope(input.directory),
      }),
    )
  }
  await Promise.all(invalidations)
}
