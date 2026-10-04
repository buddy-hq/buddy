import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useQueries, useQueryClient, type UseQueryResult } from "@tanstack/react-query"
import { useDurableScrollTop } from "@/lib/use-durable-scroll-top"
import {
  WORKSPACE_DRAWER_UI_EXPLORER,
  readWorkspaceDrawerUiState,
  workspaceDrawerUiKey,
  writeWorkspaceDrawerUiState,
} from "@/state/workspace-drawer-ui-state"
import { Button, FolderIcon, cn, toast } from "@buddy/ui"
import { ChevronDownIcon, ChevronRightIcon, Loader2Icon, RefreshCwIcon } from "@/icons/app-icons"
import { FileTypeIcon } from "@/components/files/file-type-icon"
import { language } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { stringifyError } from "@/lib/api-client"
import { useWorkspaceFileOpen, type WorkspaceResourceOpener } from "@/lib/use-workspace-file-open"
import type { BenchModeRequest } from "@/lib/bench-navigation"
import { WorkspaceFileMissingError, readWorkspaceFileRawMetadata } from "@/lib/workspace-file-media"
import { absoluteWorkspaceFilePath, fileNameFromPath } from "@/lib/workspace-file-paths"
import type { ProjectExplorerFileNode } from "@/state/chat-actions"
import { notifyNotebookFilesChanged } from "@/state/notebook-files-changed"
import {
  invalidateProjectExplorerListings,
  projectExplorerDirectoryQueryOptions,
} from "@/state/project-explorer-query"
import {
  NOTEBOOK_FILE_SEARCH_MIN_QUERY_LENGTH,
  NOTEBOOK_FILE_SEARCH_RESULT_LIMIT,
  useNotebookFileSearch,
} from "@/state/notebook-file-search"
import { scoreNotebookSearchText } from "@/state/notebook-search"

const ROOT_DIRECTORY_PATH = ""
const EMPTY_CHILDREN: string[] = []
const TREE_DEPTH_INDENT_PX = 12
const TREE_ROW_BASE_PADDING_PX = 8
const TREE_FILE_ICON_OFFSET_PX = 16
const MARKDOWN_FILE_EXTENSION_PATTERN = /\.md$/iu

type ProjectFileExplorerVariant = "default" | "obsidian"

type ProjectFileExplorerPanelProps = {
  directory: string
  className?: string
  mode?: "full" | "selector"
  benchMode?: BenchModeRequest
  onFileOpenBlocked?: () => void
  onSelectFile?: () => void
  onOpenResource?: WorkspaceResourceOpener
  searchValue?: string
  showHeader?: boolean
  refreshRequest?: number
  variant?: ProjectFileExplorerVariant
  selectedPath?: string
}

type DirectoryExpansionMap = Record<string, boolean>

type ExplorerDirectoryListing = {
  loaded: boolean
  loading: boolean
  error?: string
  children: string[]
}

type DirectoryListingMap = Record<string, ExplorerDirectoryListing>
type NodeMap = Record<string, ProjectExplorerFileNode>

const UNLISTED_DIRECTORY: ExplorerDirectoryListing = {
  loaded: false,
  loading: false,
  children: EMPTY_CHILDREN,
}

function expandedDirectoryPaths(expansion: DirectoryExpansionMap): string[] {
  return Object.entries(expansion)
    .filter(([, expanded]) => expanded)
    .map(([path]) => path)
}

function normalizeExplorerPath(path: string): string {
  return path.replaceAll("\\", "/").replace(/\/+$/u, "")
}

function ancestorDirectoryPaths(filePath: string): string[] {
  const segments = normalizeExplorerPath(filePath).split("/").filter(Boolean)
  return segments.slice(0, -1).map((_, index) => segments.slice(0, index + 1).join("/"))
}

function restoreDirectoryExpansion(expandedPaths: string[] | undefined): DirectoryExpansionMap {
  return Object.fromEntries((expandedPaths ?? []).map((path) => [path, true] as const))
}

function sortedNodes(paths: string[], nodesByPath: NodeMap) {
  return paths
    .map((path) => nodesByPath[path])
    .filter((node): node is ProjectExplorerFileNode => node !== undefined)
    .toSorted((left, right) => {
      if (left.type !== right.type) return left.type === "directory" ? -1 : 1
      return left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
    })
}

function FileNodeIcon(props: { node: ProjectExplorerFileNode }) {
  if (props.node.type === "directory") {
    return <FolderIcon className="size-4 shrink-0 text-text-weak" />
  }
  return <FileTypeIcon fileName={props.node.path} className="size-4 shrink-0 object-contain" />
}

export function projectFileExplorerNodeLabel(input: {
  name: string
  nodeType: ProjectExplorerFileNode["type"]
  variant: ProjectFileExplorerVariant
}): string {
  if (input.variant !== "obsidian" || input.nodeType !== "file") return input.name
  return input.name.replace(MARKDOWN_FILE_EXTENSION_PATTERN, "")
}

export function ProjectFileExplorerPanel(props: ProjectFileExplorerPanelProps) {
  const variant = props.variant ?? "default"
  const showNodeIcons = variant !== "obsidian"
  const drawerUiKey = workspaceDrawerUiKey({
    directory: props.directory,
    drawer: WORKSPACE_DRAWER_UI_EXPLORER,
  })
  const {
    containerRef: treeContainerRef,
    onScroll: onTreeScroll,
    cancelPendingRestore,
  } = useDurableScrollTop(drawerUiKey)
  const previousRefreshRequestRef = useRef(props.refreshRequest)
  const selectedRowRef = useRef<HTMLButtonElement>(null)
  const revealedSelectionRef = useRef<string>()
  const revealedAncestorsRef = useRef<{ key: string; paths: Set<string> }>()
  const platform = usePlatform()
  const queryClient = useQueryClient()
  const { executePrimary } = useWorkspaceFileOpen(props.directory, props.onOpenResource, {
    benchMode: props.benchMode,
  })
  // The drawer unmounts on every chat switch, so expansion is seeded from durable state and the
  // listings are reloaded rather than cached here.
  const [directoryExpansion, setDirectoryExpansion] = useState<DirectoryExpansionMap>(() =>
    restoreDirectoryExpansion(readWorkspaceDrawerUiState(drawerUiKey)?.expandedPaths),
  )
  // Collapsed folders drop out, so background refreshes only list what is open.
  const listedDirectoryPaths = useMemo(
    () => [ROOT_DIRECTORY_PATH, ...expandedDirectoryPaths(directoryExpansion)],
    [directoryExpansion],
  )
  const combineDirectoryListings = useCallback(
    (results: UseQueryResult<ProjectExplorerFileNode[]>[]) => {
      const listings: DirectoryListingMap = {}
      const nodes: NodeMap = {}
      results.forEach((result, index) => {
        const path = listedDirectoryPaths[index]
        if (path === undefined) return
        listings[path] = {
          loaded: result.data !== undefined,
          loading: result.isLoading,
          error: result.error ? stringifyError(result.error) : undefined,
          children: result.data?.map((node) => node.path) ?? EMPTY_CHILDREN,
        }
        for (const node of result.data ?? []) nodes[node.path] = node
      })
      return { listingsByPath: listings, nodesByPath: nodes }
    },
    [listedDirectoryPaths],
  )
  const { listingsByPath, nodesByPath } = useQueries({
    queries: listedDirectoryPaths.map((path) =>
      projectExplorerDirectoryQueryOptions({ directory: props.directory, path }),
    ),
    combine: combineDirectoryListings,
  })
  const searchQuery = props.searchValue?.trim() ?? ""
  const searchFiles = searchQuery.length >= NOTEBOOK_FILE_SEARCH_MIN_QUERY_LENGTH
  // The index loads once the user starts filtering; a cached index still answers instantly.
  const fileSearch = useNotebookFileSearch({
    directory: props.directory,
    query: searchQuery,
    enabled: searchQuery.length > 0,
  })
  const refreshSearch = fileSearch.refresh

  // Only a requested refresh spins the header icon; background refreshes stay silent.
  const [refreshingTree, setRefreshingTree] = useState(false)
  const refreshTree = useCallback(() => {
    setRefreshingTree(true)
    void invalidateProjectExplorerListings(queryClient, props.directory).finally(() =>
      setRefreshingTree(false),
    )
  }, [props.directory, queryClient])

  useEffect(() => {
    setDirectoryExpansion(
      restoreDirectoryExpansion(readWorkspaceDrawerUiState(drawerUiKey)?.expandedPaths),
    )
  }, [drawerUiKey, props.directory])

  useEffect(() => {
    if (!props.selectedPath) return
    const selectionKey = `${drawerUiKey}:${normalizeExplorerPath(props.selectedPath)}`
    if (revealedAncestorsRef.current?.key !== selectionKey) {
      revealedAncestorsRef.current = { key: selectionKey, paths: new Set() }
    }
    const revealed = revealedAncestorsRef.current.paths
    const ancestors = ancestorDirectoryPaths(props.selectedPath)
    if (ancestors.length === 0) return
    const directoryNodes = Object.values(nodesByPath).filter((node) => node.type === "directory")
    // Each ancestor opens once per selection, so a folder the user collapses afterwards stays closed.
    const actualAncestors = ancestors
      .map(
        (ancestor) =>
          directoryNodes.find((node) => normalizeExplorerPath(node.path) === ancestor)?.path,
      )
      .filter((path): path is string => path !== undefined && !revealed.has(path))
    if (actualAncestors.length === 0) return
    for (const path of actualAncestors) revealed.add(path)
    setDirectoryExpansion((expansion) => {
      const closed = actualAncestors.filter((path) => !expansion[path])
      if (closed.length === 0) return expansion
      const next = { ...expansion }
      for (const path of closed) next[path] = true
      writeWorkspaceDrawerUiState(drawerUiKey, { expandedPaths: expandedDirectoryPaths(next) })
      return next
    })
  }, [drawerUiKey, nodesByPath, props.selectedPath])

  useEffect(() => {
    if (!props.selectedPath || !selectedRowRef.current) return
    const revealKey = `${drawerUiKey}:${normalizeExplorerPath(props.selectedPath)}:${searchQuery}`
    if (revealedSelectionRef.current !== revealKey) {
      cancelPendingRestore()
      selectedRowRef.current.scrollIntoView({ block: "nearest" })
      revealedSelectionRef.current = revealKey
      return
    }
    const scrollElement = treeContainerRef.current
    if (!scrollElement) return
    const row = selectedRowRef.current.getBoundingClientRect()
    const viewport = scrollElement.getBoundingClientRect()
    if (row.top < viewport.top || row.bottom > viewport.bottom) {
      selectedRowRef.current.scrollIntoView({ block: "nearest" })
    }
  }, [
    cancelPendingRestore,
    listingsByPath,
    drawerUiKey,
    fileSearch.matches,
    nodesByPath,
    props.selectedPath,
    searchFiles,
    searchQuery,
    treeContainerRef,
  ])

  useEffect(() => {
    if (
      props.refreshRequest === undefined ||
      previousRefreshRequestRef.current === props.refreshRequest
    ) {
      return
    }
    previousRefreshRequestRef.current = props.refreshRequest
    if (searchFiles) {
      void refreshSearch().catch((error) => toast.error(stringifyError(error)))
    }
    refreshTree()
  }, [props.refreshRequest, refreshSearch, refreshTree, searchFiles])

  const toggleDirectory = (path: string) => {
    setDirectoryExpansion((expansion) => {
      const next = { ...expansion, [path]: !expansion[path] }
      writeWorkspaceDrawerUiState(drawerUiKey, { expandedPaths: expandedDirectoryPaths(next) })
      return next
    })
  }

  const openFile = async (node: ProjectExplorerFileNode) => {
    try {
      const metadata = await readWorkspaceFileRawMetadata({
        directory: props.directory,
        path: node.path,
      })
      const opened = await executePrimary({
        path: node.path,
        absolutePath: node.absolute,
        name: node.name,
        available: true,
        canOpenInBuddy: true,
        canOpenDefaultApp: platform.openPath !== undefined,
        canReveal: platform.revealPath !== undefined,
        mimeType: metadata.mimeType,
        sizeBytes: metadata.sizeBytes,
      })
      if (opened) {
        props.onSelectFile?.()
        return
      }
      props.onFileOpenBlocked?.()
    } catch (error) {
      props.onFileOpenBlocked?.()
      if (error instanceof WorkspaceFileMissingError) {
        void notifyNotebookFilesChanged(queryClient, props.directory)
      }
      toast.error(stringifyError(error))
    }
  }

  function nodeMatchesSearch(
    node: ProjectExplorerFileNode,
    normalizedSearch: string,
    visitedDirectories: Set<string>,
  ): boolean {
    if (!normalizedSearch || node.name.toLocaleLowerCase().includes(normalizedSearch)) {
      return true
    }
    if (node.type !== "directory" || visitedDirectories.has(node.path)) return false

    visitedDirectories.add(node.path)
    const childListing = listingsByPath[node.path]
    return sortedNodes(childListing?.children ?? EMPTY_CHILDREN, nodesByPath).some((child) =>
      nodeMatchesSearch(child, normalizedSearch, visitedDirectories),
    )
  }

  function renderDirectory(path: string, depth: number): ReactNode {
    const listing = listingsByPath[path]
    const normalizedSearch = props.searchValue?.trim().toLocaleLowerCase() ?? ""
    const children = sortedNodes(listing?.children ?? EMPTY_CHILDREN, nodesByPath).filter((node) =>
      nodeMatchesSearch(node, normalizedSearch, new Set()),
    )

    return children.map((node) => {
      if (node.type === "directory") {
        const childListing = listingsByPath[node.path] ?? UNLISTED_DIRECTORY
        const visiblyExpanded =
          directoryExpansion[node.path] === true || normalizedSearch.length > 0
        return (
          <div key={node.path}>
            <button
              type="button"
              className="flex h-7 w-full items-center gap-1.5 rounded-lg px-2 text-left text-xs text-text-weak transition-colors hover:bg-surface-raised-base/80 hover:text-text-base"
              style={{ paddingLeft: depth * TREE_DEPTH_INDENT_PX + TREE_ROW_BASE_PADDING_PX }}
              onClick={() => toggleDirectory(node.path)}
            >
              {visiblyExpanded ? (
                <ChevronDownIcon className="size-3 shrink-0" aria-hidden />
              ) : (
                <ChevronRightIcon className="size-3 shrink-0" aria-hidden />
              )}
              {showNodeIcons ? <FileNodeIcon node={node} /> : null}
              <span className={cn("min-w-0 flex-1 truncate", node.ignored && "opacity-60")}>
                {projectFileExplorerNodeLabel({
                  name: node.name,
                  nodeType: node.type,
                  variant,
                })}
              </span>
              {childListing.loading ? <Loader2Icon className="size-3 animate-spin" /> : null}
            </button>
            {childListing.error ? (
              <p className="px-2 py-1 text-xs text-icon-critical-base">{childListing.error}</p>
            ) : null}
            {visiblyExpanded && childListing.loaded ? renderDirectory(node.path, depth + 1) : null}
          </div>
        )
      }

      return (
        <button
          key={node.path}
          ref={
            props.selectedPath &&
            normalizeExplorerPath(props.selectedPath) === normalizeExplorerPath(node.path)
              ? selectedRowRef
              : undefined
          }
          type="button"
          aria-current={
            props.selectedPath &&
            normalizeExplorerPath(props.selectedPath) === normalizeExplorerPath(node.path)
              ? "page"
              : undefined
          }
          className={cn(
            "flex h-7 w-full items-center gap-1.5 rounded-lg px-2 text-left text-xs text-text-weak transition-colors hover:bg-surface-raised-base/80 hover:text-text-base",
            props.selectedPath &&
              normalizeExplorerPath(props.selectedPath) === normalizeExplorerPath(node.path) &&
              "bg-surface-raised-base text-text-base",
          )}
          style={{
            paddingLeft:
              depth * TREE_DEPTH_INDENT_PX + TREE_ROW_BASE_PADDING_PX + TREE_FILE_ICON_OFFSET_PX,
          }}
          onClick={() => void openFile(node)}
        >
          {showNodeIcons ? <FileNodeIcon node={node} /> : null}
          <span className={cn("min-w-0 flex-1 truncate", node.ignored && "opacity-60")}>
            {projectFileExplorerNodeLabel({
              name: node.name,
              nodeType: node.type,
              variant,
            })}
          </span>
        </button>
      )
    })
  }

  const rootListing = listingsByPath[ROOT_DIRECTORY_PATH]
  const searchedPaths = useMemo(() => {
    if (!searchFiles) return []
    // Rows in the current listings join the index matches, so whatever the tree shows (including
    // hidden or git-ignored files the index skips) can also be found by name. Nodes from earlier
    // listings are skipped so deleted files drop out, as are rows kept from a folder whose
    // listing now fails, which is usually a deleted folder.
    const loadedFilePaths = Object.values(listingsByPath)
      .flatMap((listing) => (listing.error ? EMPTY_CHILDREN : listing.children))
      .flatMap((path) => {
        const node = nodesByPath[path]
        return node?.type === "file" ? [node.path] : []
      })
    const scoredSearchPaths = new Map<string, { path: string; score: number }>()
    for (const path of [...fileSearch.matches, ...loadedFilePaths]) {
      const key = normalizeExplorerPath(path)
      if (scoredSearchPaths.has(key)) continue
      const score = scoreNotebookSearchText({
        query: searchQuery,
        title: fileNameFromPath(path),
        keywords: path,
      })
      if (score !== undefined) scoredSearchPaths.set(key, { path, score })
    }
    return [...scoredSearchPaths.values()]
      .toSorted((left, right) => left.score - right.score || left.path.localeCompare(right.path))
      .slice(0, NOTEBOOK_FILE_SEARCH_RESULT_LIMIT)
      .map((match) => match.path)
  }, [fileSearch.matches, listingsByPath, nodesByPath, searchFiles, searchQuery])
  return (
    <section
      data-component="project-file-explorer-panel"
      data-mode={props.mode ?? "full"}
      data-variant={variant}
      className={cn("flex h-full min-h-0 flex-col bg-background-base", props.className)}
    >
      {props.showHeader !== false ? (
        <header className="flex items-center justify-between border-b border-border-weaker-base px-3 py-2.5">
          <div className="min-w-0">
            <h2 className="text-xs font-semibold text-text-base">
              {language.t("projectExplorer.explorer")}
            </h2>
            <p className="truncate text-xs text-text-weak">{language.t("projectExplorer.files")}</p>
          </div>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Refresh files"
            title="Refresh files"
            onClick={() => {
              if (searchFiles) {
                void refreshSearch().catch((error) => toast.error(stringifyError(error)))
              }
              refreshTree()
            }}
          >
            <RefreshCwIcon className={cn("size-4", refreshingTree && "animate-spin")} />
          </Button>
        </header>
      ) : null}
      <div
        ref={treeContainerRef}
        onScroll={onTreeScroll}
        className="scrollbar-hover min-h-0 flex-1 overflow-y-auto p-1.5"
      >
        {!searchFiles && rootListing?.error ? (
          <p className="p-2 text-xs text-icon-critical-base">{rootListing.error}</p>
        ) : null}
        {searchFiles ? (
          <>
            {fileSearch.searching ? (
              <p className="p-2 text-xs text-text-weaker">Searching files…</p>
            ) : fileSearch.error ? (
              <p className="p-2 text-xs text-icon-critical-base">File search failed. Try again.</p>
            ) : null}
            {fileSearch.partial ? (
              <p className="p-2 text-xs text-text-weaker">Showing matches from a partial scan.</p>
            ) : null}
            {searchedPaths.length > 0 ? (
              searchedPaths.map((path) => {
                const node = nodesByPath[path] ?? {
                  name: fileNameFromPath(path),
                  path,
                  absolute: absoluteWorkspaceFilePath({ directory: props.directory, path }),
                  type: "file" as const,
                  ignored: false,
                }
                return (
                  <button
                    key={path}
                    ref={
                      props.selectedPath &&
                      normalizeExplorerPath(props.selectedPath) === normalizeExplorerPath(path)
                        ? selectedRowRef
                        : undefined
                    }
                    type="button"
                    aria-current={
                      props.selectedPath &&
                      normalizeExplorerPath(props.selectedPath) === normalizeExplorerPath(path)
                        ? "page"
                        : undefined
                    }
                    className={cn(
                      "flex h-9 w-full items-center gap-1.5 rounded-lg px-2 text-left text-xs text-text-weak transition-colors hover:bg-surface-raised-base/80 hover:text-text-base",
                      props.selectedPath &&
                        normalizeExplorerPath(props.selectedPath) === normalizeExplorerPath(path) &&
                        "bg-surface-raised-base text-text-base",
                    )}
                    onClick={() => void openFile(node)}
                  >
                    {showNodeIcons ? <FileNodeIcon node={node} /> : null}
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">
                        {projectFileExplorerNodeLabel({
                          name: node.name,
                          nodeType: node.type,
                          variant,
                        })}
                      </span>
                      <span className="truncate text-[10px] text-text-weaker">{path}</span>
                    </span>
                  </button>
                )
              })
            ) : !fileSearch.searching && !fileSearch.error ? (
              <p className="p-2 text-xs text-text-weaker">No matching files.</p>
            ) : null}
          </>
        ) : (
          renderDirectory(ROOT_DIRECTORY_PATH, 0)
        )}
      </div>
    </section>
  )
}
