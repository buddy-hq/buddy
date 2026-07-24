import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
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
import { readWorkspaceFileRawMetadata } from "@/lib/workspace-file-media"
import { listProjectExplorerDirectory, type ProjectExplorerFileNode } from "@/state/chat-actions"

const ROOT_DIRECTORY_PATH = ""
const EMPTY_CHILDREN: string[] = []
const TREE_DEPTH_INDENT_PX = 12
const TREE_ROW_BASE_PADDING_PX = 8
const TREE_FILE_ICON_OFFSET_PX = 16

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
}

type ExplorerDirectoryState = {
  expanded: boolean
  loaded: boolean
  loading: boolean
  error?: string
  children: string[]
}

type DirectoryStateMap = Record<string, ExplorerDirectoryState>
type NodeMap = Record<string, ProjectExplorerFileNode>

const ROOT_DIRECTORY_STATE: ExplorerDirectoryState = {
  expanded: true,
  loaded: false,
  loading: false,
  children: EMPTY_CHILDREN,
}

function expandedDirectoryPaths(state: DirectoryStateMap): string[] {
  return Object.entries(state)
    .filter(([path, directoryState]) => path !== ROOT_DIRECTORY_PATH && directoryState.expanded)
    .map(([path]) => path)
}

function restoreExpandedDirectoryState(expandedPaths: string[] | undefined): DirectoryStateMap {
  const state: DirectoryStateMap = { [ROOT_DIRECTORY_PATH]: ROOT_DIRECTORY_STATE }
  for (const path of expandedPaths ?? []) {
    state[path] = { ...ROOT_DIRECTORY_STATE, expanded: true }
  }
  return state
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

export function ProjectFileExplorerPanel(props: ProjectFileExplorerPanelProps) {
  const drawerUiKey = workspaceDrawerUiKey({
    directory: props.directory,
    drawer: WORKSPACE_DRAWER_UI_EXPLORER,
  })
  const { containerRef: treeContainerRef, onScroll: onTreeScroll } =
    useDurableScrollTop(drawerUiKey)
  const previousRefreshRequestRef = useRef(props.refreshRequest)
  const platform = usePlatform()
  const { executePrimary } = useWorkspaceFileOpen(props.directory, props.onOpenResource, {
    benchMode: props.benchMode,
  })
  // The drawer unmounts on every chat switch, so expansion is seeded from durable state and the
  // listings are reloaded rather than cached here.
  const [directoriesByPath, setDirectoriesByPath] = useState<DirectoryStateMap>(() =>
    restoreExpandedDirectoryState(readWorkspaceDrawerUiState(drawerUiKey)?.expandedPaths),
  )
  const [nodesByPath, setNodesByPath] = useState<NodeMap>({})

  const loadDirectory = useCallback(
    async (path: string, force = false) => {
      const current = directoriesByPath[path]
      if (!force && (current?.loading || current?.loaded)) return

      setDirectoriesByPath((state) => ({
        ...state,
        [path]: {
          ...(state[path] ?? ROOT_DIRECTORY_STATE),
          loading: true,
          error: undefined,
        },
      }))

      try {
        const listed = await listProjectExplorerDirectory({ directory: props.directory, path })
        setNodesByPath((state) => ({
          ...state,
          ...Object.fromEntries(listed.map((node) => [node.path, node])),
        }))
        setDirectoriesByPath((state) => ({
          ...state,
          [path]: {
            ...(state[path] ?? ROOT_DIRECTORY_STATE),
            loaded: true,
            loading: false,
            error: undefined,
            children: listed.map((node) => node.path),
          },
        }))
      } catch (error) {
        setDirectoriesByPath((state) => ({
          ...state,
          [path]: {
            ...(state[path] ?? ROOT_DIRECTORY_STATE),
            loading: false,
            error: stringifyError(error),
          },
        }))
      }
    },
    [directoriesByPath, props.directory],
  )

  useEffect(() => {
    setDirectoriesByPath(
      restoreExpandedDirectoryState(readWorkspaceDrawerUiState(drawerUiKey)?.expandedPaths),
    )
    setNodesByPath({})
  }, [drawerUiKey, props.directory])

  useEffect(() => {
    void loadDirectory(ROOT_DIRECTORY_PATH)
  }, [loadDirectory])

  // Restored expansion carries no listings, so every expanded directory loads its own children.
  // Without this the tree renders open but empty after a chat switch.
  useEffect(() => {
    for (const [path, directoryState] of Object.entries(directoriesByPath)) {
      if (path === ROOT_DIRECTORY_PATH) continue
      if (!directoryState.expanded || directoryState.loaded || directoryState.loading) continue
      void loadDirectory(path)
    }
  }, [directoriesByPath, loadDirectory])

  useEffect(() => {
    if (
      props.refreshRequest === undefined ||
      previousRefreshRequestRef.current === props.refreshRequest
    ) {
      return
    }
    previousRefreshRequestRef.current = props.refreshRequest
    void loadDirectory(ROOT_DIRECTORY_PATH, true)
  }, [loadDirectory, props.refreshRequest])

  const toggleDirectory = async (path: string) => {
    const current = directoriesByPath[path]
    const expanded = !(current?.expanded ?? false)
    setDirectoriesByPath((state) => {
      const next = {
        ...state,
        [path]: {
          ...(state[path] ?? ROOT_DIRECTORY_STATE),
          expanded,
        },
      }
      writeWorkspaceDrawerUiState(drawerUiKey, { expandedPaths: expandedDirectoryPaths(next) })
      return next
    })
    if (expanded && !current?.loaded) await loadDirectory(path)
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
    const childState = directoriesByPath[node.path]
    return sortedNodes(childState?.children ?? EMPTY_CHILDREN, nodesByPath).some((child) =>
      nodeMatchesSearch(child, normalizedSearch, visitedDirectories),
    )
  }

  function renderDirectory(path: string, depth: number): ReactNode {
    const directoryState = directoriesByPath[path]
    const normalizedSearch = props.searchValue?.trim().toLocaleLowerCase() ?? ""
    const children = sortedNodes(directoryState?.children ?? EMPTY_CHILDREN, nodesByPath).filter(
      (node) => nodeMatchesSearch(node, normalizedSearch, new Set()),
    )

    return children.map((node) => {
      if (node.type === "directory") {
        const childState = directoriesByPath[node.path] ?? {
          ...ROOT_DIRECTORY_STATE,
          expanded: false,
        }
        const visiblyExpanded = childState.expanded || normalizedSearch.length > 0
        return (
          <div key={node.path}>
            <button
              type="button"
              className="flex h-7 w-full items-center gap-1.5 rounded-lg px-2 text-left text-xs text-text-weak transition-colors hover:bg-surface-raised-base/80 hover:text-text-base"
              style={{ paddingLeft: depth * TREE_DEPTH_INDENT_PX + TREE_ROW_BASE_PADDING_PX }}
              onClick={() => void toggleDirectory(node.path)}
            >
              {visiblyExpanded ? (
                <ChevronDownIcon className="size-3 shrink-0" aria-hidden />
              ) : (
                <ChevronRightIcon className="size-3 shrink-0" aria-hidden />
              )}
              <FileNodeIcon node={node} />
              <span className={cn("min-w-0 flex-1 truncate", node.ignored && "opacity-60")}>
                {node.name}
              </span>
              {childState.loading ? <Loader2Icon className="size-3 animate-spin" /> : null}
            </button>
            {childState.error ? (
              <p className="px-2 py-1 text-xs text-icon-critical-base">{childState.error}</p>
            ) : null}
            {visiblyExpanded && childState.loaded ? renderDirectory(node.path, depth + 1) : null}
          </div>
        )
      }

      return (
        <button
          key={node.path}
          type="button"
          className="flex h-7 w-full items-center gap-1.5 rounded-lg px-2 text-left text-xs text-text-weak transition-colors hover:bg-surface-raised-base/80 hover:text-text-base"
          style={{
            paddingLeft:
              depth * TREE_DEPTH_INDENT_PX + TREE_ROW_BASE_PADDING_PX + TREE_FILE_ICON_OFFSET_PX,
          }}
          onClick={() => void openFile(node)}
        >
          <FileNodeIcon node={node} />
          <span className={cn("min-w-0 flex-1 truncate", node.ignored && "opacity-60")}>
            {node.name}
          </span>
        </button>
      )
    })
  }

  const rootState = directoriesByPath[ROOT_DIRECTORY_PATH]
  return (
    <section
      data-component="project-file-explorer-panel"
      data-mode={props.mode ?? "full"}
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
            onClick={() => void loadDirectory(ROOT_DIRECTORY_PATH, true)}
          >
            <RefreshCwIcon className={cn("size-4", rootState?.loading && "animate-spin")} />
          </Button>
        </header>
      ) : null}
      <div
        ref={treeContainerRef}
        onScroll={onTreeScroll}
        className="scrollbar-hover min-h-0 flex-1 overflow-y-auto p-1.5"
      >
        {rootState?.error ? (
          <p className="p-2 text-xs text-icon-critical-base">{rootState.error}</p>
        ) : null}
        {renderDirectory(ROOT_DIRECTORY_PATH, 0)}
      </div>
    </section>
  )
}
