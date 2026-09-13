import { useCallback, useDeferredValue, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  collectObsidianWikiLinkTargets,
  EXPLORER_EMBEDDED_MARKDOWN_LOADER,
  useObsidianResolutionMap,
  viewerForObsidianResolution,
  type ObsidianLinkResolution,
  type ObsidianWikiLinkContext,
} from "@/components/bench/markdown/plugins/obsidian"
import {
  BENCH_MODE_REQUEST_POLICY,
  BENCH_WORKSPACE_ROOT_NOTEBOOK,
  useOpenBench,
} from "@/lib/bench-navigation"
import {
  obsidianLinkResolutionsQueryOptions,
  obsidianVaultProfileQueryOptions,
} from "@/state/obsidian-vault-query"

export function useMarkdownBenchWikiLinkContext(input: {
  directory: string
  storageDirectory: string
  path: string
  markdown: string
  createContext: ((markdown: string) => ObsidianWikiLinkContext) | undefined
}): ObsidianWikiLinkContext {
  const { createContext, directory, path, storageDirectory } = input
  const openBenchRoute = useOpenBench()
  const deferredMarkdown = useDeferredValue(input.markdown)
  const targets = useMemo(
    () => collectObsidianWikiLinkTargets(deferredMarkdown),
    [deferredMarkdown],
  )
  const profileQuery = useQuery(obsidianVaultProfileQueryOptions(directory))
  const connected = profileQuery.data?.connected === true
  const linksQuery = useQuery(
    obsidianLinkResolutionsQueryOptions({
      directory,
      documentPath: path,
      enabled: connected,
      targets,
    }),
  )
  const resolutions = useObsidianResolutionMap(linksQuery.data?.links)

  const openResolution = useCallback(
    (resolution: ObsidianLinkResolution) => {
      if (resolution.status !== "resolved" || !resolution.path) return
      void openBenchRoute({
        directory,
        target: Object.assign(
          {
            type: "workspace-file" as const,
            root: BENCH_WORKSPACE_ROOT_NOTEBOOK,
            path: resolution.path,
            viewer: viewerForObsidianResolution(resolution),
          },
          resolution.fragment ? { fragment: resolution.fragment } : undefined,
        ),
        mode: BENCH_MODE_REQUEST_POLICY,
        autoOpen: null,
      })
    },
    [directory, openBenchRoute],
  )

  const vaultContext = useMemo<ObsidianWikiLinkContext>(
    () => ({
      directory: storageDirectory,
      documentPath: path,
      compatible: connected,
      resolutions,
      embeddedMarkdownLoader: EXPLORER_EMBEDDED_MARKDOWN_LOADER,
      openResolution,
    }),
    [connected, openResolution, path, resolutions, storageDirectory],
  )

  return useMemo(
    () => createContext?.(deferredMarkdown) ?? vaultContext,
    [createContext, deferredMarkdown, vaultContext],
  )
}
