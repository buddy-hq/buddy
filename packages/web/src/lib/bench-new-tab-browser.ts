import { inAppBrowserDisplayUrl } from "@buddy/browser-contract"
import type { InAppBrowserHistoryEntry } from "@/lib/in-app-browser-history"
import { normalizeRelativePath, workspaceRelativeFilePath } from "@/lib/workspace-file-paths"
import {
  inAppBrowserSearchEngineLabel,
  resolveInAppBrowserInput,
  type InAppBrowserSearchEngine,
} from "@/lib/in-app-browser-search"

const BENCH_NEW_TAB_BROWSER_HISTORY_LIMIT = 5
const NOTEBOOK_FILE_EXTENSIONS = new Set([
  "c",
  "cc",
  "cpp",
  "cs",
  "css",
  "csv",
  "env",
  "epub",
  "gif",
  "go",
  "h",
  "hpp",
  "htm",
  "html",
  "java",
  "jpeg",
  "jpg",
  "js",
  "json",
  "jsonc",
  "jsx",
  "kt",
  "lock",
  "md",
  "mdx",
  "mjs",
  "pdf",
  "png",
  "py",
  "rb",
  "rs",
  "scss",
  "sh",
  "sql",
  "svg",
  "swift",
  "toml",
  "ts",
  "tsx",
  "txt",
  "webp",
  "xml",
  "yaml",
  "yml",
])
const DEFINITE_FILE_PATH_PREFIX = /^(?:\.{1,2}[\\/]|~[\\/]|[\\/]|[a-z]:[\\/])/iu

/** Browser action derived synchronously from the unified new-tab input. */
export type BenchNewTabBrowserInputAction = {
  readonly kind: "url" | "search"
  /** Fallbacks wait for notebook search so a file can own Enter when both match. */
  readonly placement: "primary" | "fallback"
  readonly url: string
  readonly title: string
  readonly description: string
}

function hasNotebookFileExtension(input: string): boolean {
  const path = input.split(/[?#]/u, 1)[0] ?? input
  const name = path.split(/[\\/]/u).at(-1) ?? path
  const dotIndex = name.lastIndexOf(".")
  if (dotIndex < 0 || dotIndex === name.length - 1) return false
  return NOTEBOOK_FILE_EXTENSIONS.has(name.slice(dotIndex + 1).toLowerCase())
}

/** Paths that should never be sent to a web search provider. */
export function isDefiniteBenchNewTabFilePath(input: string): boolean {
  const value = input.trim()
  if (!value || /^https?:\/\//iu.test(value)) return false
  return DEFINITE_FILE_PATH_PREFIX.test(value) || value.includes("\\")
}

/** Normalize paths typed into the unified input for the notebook path-search provider. */
export function benchNewTabNotebookQuery(input: { directory: string; query: string }): string {
  const query = input.query.trim()
  const workspaceRelative = workspaceRelativeFilePath({ directory: input.directory, path: query })
  if (workspaceRelative) return workspaceRelative
  if (/^\.[\\/]/u.test(query)) return normalizeRelativePath(query.slice(2))
  if (!/^(?:[\\/]|[a-z]:[\\/])/iu.test(query) && query.includes("\\")) {
    return normalizeRelativePath(query)
  }
  return query
}

/** Resolve a non-empty new-tab query into a labeled Browser navigation action. */
export function resolveBenchNewTabBrowserInputAction(
  query: string,
  searchEngine: InAppBrowserSearchEngine,
): BenchNewTabBrowserInputAction | undefined {
  const input = query.trim()
  if (!input || isDefiniteBenchNewTabFilePath(input)) return undefined
  const resolution = resolveInAppBrowserInput(input, searchEngine)
  if (!("url" in resolution)) return undefined

  if (resolution.kind === "url") {
    return {
      kind: resolution.kind,
      placement: hasNotebookFileExtension(input) ? "fallback" : "primary",
      url: resolution.url,
      title: input,
      description: inAppBrowserDisplayUrl(resolution.url),
    }
  }

  return {
    kind: resolution.kind,
    placement: "fallback",
    url: resolution.url,
    title: `Search ${inAppBrowserSearchEngineLabel(searchEngine)} for “${input}”`,
    description: inAppBrowserSearchEngineLabel(searchEngine),
  }
}

function browserHistoryMatchScore(
  entry: InAppBrowserHistoryEntry,
  query: string,
): number | undefined {
  const title = entry.title.toLocaleLowerCase()
  const address = inAppBrowserDisplayUrl(entry.url).toLocaleLowerCase()
  if (title === query || address === query) return 0
  if (title.startsWith(query)) return 10
  if (address.startsWith(query)) return 20
  const titleIndex = title.indexOf(query)
  if (titleIndex >= 0) return 30 + titleIndex
  const addressIndex = address.indexOf(query)
  return addressIndex >= 0 ? 60 + addressIndex : undefined
}

/** Return the best recent Browser pages matching a unified new-tab query. */
export function searchBenchNewTabBrowserHistory(
  entries: readonly InAppBrowserHistoryEntry[],
  query: string,
): readonly InAppBrowserHistoryEntry[] {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  if (!normalizedQuery) return []

  return entries
    .flatMap((entry) => {
      const score = browserHistoryMatchScore(entry, normalizedQuery)
      return score === undefined ? [] : [{ entry, score }]
    })
    .toSorted((left, right) =>
      left.score === right.score
        ? right.entry.visitedAt - left.entry.visitedAt
        : left.score - right.score,
    )
    .slice(0, BENCH_NEW_TAB_BROWSER_HISTORY_LIMIT)
    .map(({ entry }) => entry)
}
