import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Badge, Button, PanelRightCloseIcon, PanelRightOpenIcon, cn } from "@buddy/ui"
import {
  AlertCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  FileArchiveIcon,
  FileCodeIcon,
  FileIcon,
  FileImageIcon,
  FolderIcon,
  Loader2Icon,
  RefreshCwIcon,
  XIcon,
} from "lucide-react"
import {
  VersionedTextFileEditor,
  type VersionedTextFileEditorHandle,
} from "@/components/editors/versioned-text-file-editor"
import { FoliateReader, type FoliateReaderSource } from "@/components/readers/foliate-reader"
import { language } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { apiFetch } from "@/lib/api-client"
import {
  buildProjectFileRawUrl,
  CONTENT_LENGTH_HEADER,
  CONTENT_TYPE_HEADER,
} from "@/lib/project-file-raw-url"
import {
  fileExtensionFromPath as fileExtension,
  fileNameFromPath as fileName,
  normalizeRelativePath,
} from "@/lib/workspace-file-paths"
import {
  listProjectExplorerDirectory,
  readProjectExplorerEditableFile,
  readProjectExplorerFile,
  saveProjectExplorerEditableFile,
  ProjectExplorerFileVersionConflictError,
  type ProjectExplorerFileContent,
  type ProjectExplorerFileNode,
} from "@/state/chat-actions"

const ROOT_DIRECTORY_PATH = ""
const LARGE_TEXT_FILE_LIMIT_BYTES = 1_000_000
const EMPTY_CHILDREN: string[] = []
const EMPTY_TABS: string[] = []
const IMAGE_MIME_PREFIX = "image/"
const FILE_TREE_COLUMN_WIDTH_CLASS = "w-[19rem]"
const IMAGE_FILE_EXTENSIONS = new Set([
  "avif",
  "bmp",
  "gif",
  "ico",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "webp",
])
const FOLIATE_READER_EXTENSIONS = new Set([
  "azw",
  "azw3",
  "cbz",
  "epub",
  "fb2",
  "fbz",
  "mobi",
  "pdf",
])

const EXTENSION_TO_MONACO_LANGUAGE: Record<string, string> = {
  txt: "plaintext",
  ts: "typescript",
  tsx: "typescriptreact",
  js: "javascript",
  jsx: "javascriptreact",
  py: "python",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  php: "php",
  rb: "ruby",
  swift: "swift",
  cs: "csharp",
  fs: "fsharp",
  c: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  yaml: "yaml",
  yml: "yaml",
  json: "json",
  md: "markdown",
  html: "html",
  htm: "html",
  css: "css",
  sql: "sql",
  lua: "lua",
  dart: "dart",
  tf: "hcl",
  clj: "clojure",
  hs: "haskell",
  xml: "xml",
}

type ProjectFileExplorerPanelProps = {
  directory: string
  className?: string
}

type ProjectExplorerDirectoryState = {
  expanded: boolean
  loaded: boolean
  loading: boolean
  error?: string
  children: string[]
}

type ProjectExplorerFileViewState = {
  loading: boolean
  error?: string
  tooLarge?: boolean
  content?: ProjectExplorerFileContent
}

type ProjectExplorerReaderViewState = {
  loading: boolean
  error?: string
  blob?: Blob
}

type ExplorerDirectoryStateMap = Record<string, ProjectExplorerDirectoryState>
type ExplorerNodeMap = Record<string, ProjectExplorerFileNode>
type ExplorerFileViewStateMap = Record<string, ProjectExplorerFileViewState>
type ExplorerReaderViewStateMap = Record<string, ProjectExplorerReaderViewState>

function monacoLanguageForPath(filepath: string) {
  return EXTENSION_TO_MONACO_LANGUAGE[fileExtension(filepath)] ?? "plaintext"
}

function formatLabelForPath(filepath: string) {
  const extension = fileExtension(filepath)
  if (!extension) return "FILE"
  return extension.toUpperCase()
}

function isFoliateReaderPath(filepath: string) {
  return FOLIATE_READER_EXTENSIONS.has(fileExtension(filepath))
}

function isImagePath(filepath: string) {
  return IMAGE_FILE_EXTENSIONS.has(fileExtension(filepath))
}

function isEditableTextFileContent(content: ProjectExplorerFileContent | undefined) {
  if (!content) return false
  if (content.type !== "text") return false
  if (content.encoding === "base64") return false
  return content.content.length <= LARGE_TEXT_FILE_LIMIT_BYTES
}

function isImageMimeType(mimeType: string | undefined) {
  return mimeType?.startsWith(IMAGE_MIME_PREFIX) ?? false
}

function shouldOpenFileInDefaultAppBySize(input: {
  path: string
  size: number | undefined
  mimeType: string | undefined
}) {
  if (typeof input.size !== "number") return false
  if (input.size <= LARGE_TEXT_FILE_LIMIT_BYTES) return false
  if (isImageMimeType(input.mimeType) || isImagePath(input.path)) return false
  return true
}

async function readProjectFileRawMetadata(input: { directory: string; path: string }): Promise<{
  size: number | undefined
  mimeType: string | undefined
}> {
  const request = buildProjectFileRawUrl(input.directory, input.path)
  const response = await apiFetch(request.endpoint, {
    directory: request.directory,
    method: "HEAD",
  })
  if (!response.ok) {
    const errorText = await response.text().catch(() => "")
    const message = errorText.trim() || `Request failed (${response.status})`
    throw new Error(message)
  }

  const sizeHeader = response.headers.get(CONTENT_LENGTH_HEADER)
  const parsedSize = sizeHeader ? Number.parseInt(sizeHeader, 10) : Number.NaN
  return {
    size: Number.isFinite(parsedSize) && parsedSize >= 0 ? parsedSize : undefined,
    mimeType: response.headers.get(CONTENT_TYPE_HEADER) ?? undefined,
  }
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError"
}

function fileIconForNode(node: ProjectExplorerFileNode) {
  if (node.type === "directory") return <FolderIcon className="size-4 text-text-weak" />
  if (isImagePath(node.path)) {
    return <FileImageIcon className="size-4 text-text-weak" />
  }
  const extension = fileExtension(node.path)
  if (
    [
      "ts",
      "tsx",
      "js",
      "jsx",
      "json",
      "py",
      "go",
      "rs",
      "java",
      "css",
      "html",
      "md",
      "sql",
      "yaml",
      "yml",
    ].includes(extension)
  ) {
    return <FileCodeIcon className="size-4 text-text-weak" />
  }
  if (["zip", "tar", "gz", "bz2", "rar", "7z"].includes(extension)) {
    return <FileArchiveIcon className="size-4 text-text-weak" />
  }
  return <FileIcon className="size-4 text-text-weak" />
}

function buildDefaultDirectoryState(): ExplorerDirectoryStateMap {
  return {
    [ROOT_DIRECTORY_PATH]: {
      expanded: true,
      loaded: false,
      loading: false,
      children: EMPTY_CHILDREN,
    },
  }
}

function sortedNodes(paths: string[], nodesByPath: ExplorerNodeMap) {
  return paths
    .map((path) => nodesByPath[path])
    .filter((node): node is ProjectExplorerFileNode => Boolean(node))
    .toSorted((left, right) => {
      if (left.type !== right.type) {
        return left.type === "directory" ? -1 : 1
      }
      return left.name.localeCompare(right.name)
    })
}

export function ProjectFileExplorerPanel(props: ProjectFileExplorerPanelProps) {
  const platform = usePlatform()
  const editorRefs = useRef<Record<string, VersionedTextFileEditorHandle | null>>({})
  const fileViewByPathRef = useRef<ExplorerFileViewStateMap>({})
  const readerViewByPathRef = useRef<ExplorerReaderViewStateMap>({})
  const readerLoadAbortControllersRef = useRef<Record<string, AbortController>>({})
  const [directoriesByPath, setDirectoriesByPath] = useState<ExplorerDirectoryStateMap>(
    buildDefaultDirectoryState,
  )
  const [nodesByPath, setNodesByPath] = useState<ExplorerNodeMap>({})
  const [openTabs, setOpenTabs] = useState<string[]>(EMPTY_TABS)
  const [activePath, setActivePath] = useState<string | undefined>(undefined)
  const [fileViewByPath, setFileViewByPath] = useState<ExplorerFileViewStateMap>({})
  const [readerViewByPath, setReaderViewByPath] = useState<ExplorerReaderViewStateMap>({})
  const [openPathError, setOpenPathError] = useState<string | undefined>(undefined)
  const [treeOpen, setTreeOpen] = useState(true)

  useEffect(() => {
    for (const controller of Object.values(readerLoadAbortControllersRef.current)) {
      controller.abort()
    }
    readerLoadAbortControllersRef.current = {}
    editorRefs.current = {}
    setDirectoriesByPath(buildDefaultDirectoryState())
    setNodesByPath({})
    setOpenTabs(EMPTY_TABS)
    setActivePath(undefined)
    setFileViewByPath({})
    setReaderViewByPath({})
    setOpenPathError(undefined)
    setTreeOpen(true)
  }, [props.directory])

  useEffect(() => {
    setOpenPathError(undefined)
  }, [activePath])

  useEffect(() => {
    fileViewByPathRef.current = fileViewByPath
  }, [fileViewByPath])

  useEffect(() => {
    readerViewByPathRef.current = readerViewByPath
  }, [readerViewByPath])

  const loadDirectory = useCallback(
    async (path: string, input?: { force?: boolean }) => {
      const normalizedPath = normalizeRelativePath(path)

      setDirectoriesByPath((current) => {
        const existing = current[normalizedPath] ?? {
          expanded: normalizedPath === ROOT_DIRECTORY_PATH,
          loaded: false,
          loading: false,
          children: EMPTY_CHILDREN,
        }
        if (existing.loading) return current
        if (!input?.force && existing.loaded) return current
        return {
          ...current,
          [normalizedPath]: {
            ...existing,
            loading: true,
            error: undefined,
          },
        }
      })

      try {
        const listed = await listProjectExplorerDirectory({
          directory: props.directory,
          path: normalizedPath,
        })

        setNodesByPath((current) => {
          const next = { ...current }
          for (const node of listed) {
            next[node.path] = node
          }
          return next
        })

        setDirectoriesByPath((current) => {
          const next = { ...current }
          const existing = next[normalizedPath] ?? {
            expanded: normalizedPath === ROOT_DIRECTORY_PATH,
            loaded: false,
            loading: false,
            children: EMPTY_CHILDREN,
          }

          const children = listed.map((node) => node.path)
          next[normalizedPath] = {
            ...existing,
            loading: false,
            loaded: true,
            error: undefined,
            children,
          }

          for (const child of listed) {
            if (child.type !== "directory") continue
            const previous = next[child.path]
            next[child.path] = {
              expanded: previous?.expanded ?? false,
              loaded: previous?.loaded ?? false,
              loading: false,
              error: previous?.error,
              children: previous?.children ?? EMPTY_CHILDREN,
            }
          }
          return next
        })
      } catch (error) {
        setDirectoriesByPath((current) => {
          const existing = current[normalizedPath] ?? {
            expanded: normalizedPath === ROOT_DIRECTORY_PATH,
            loaded: false,
            loading: false,
            children: EMPTY_CHILDREN,
          }
          return {
            ...current,
            [normalizedPath]: {
              ...existing,
              loading: false,
              loaded: false,
              error: error instanceof Error ? error.message : String(error),
            },
          }
        })
      }
    },
    [props.directory],
  )

  useEffect(() => {
    for (const [path, state] of Object.entries(directoriesByPath)) {
      if (!state.expanded) continue
      if (state.loaded) continue
      if (state.loading) continue
      void loadDirectory(path)
    }
  }, [directoriesByPath, loadDirectory])

  const loadFile = useCallback(
    async (path: string, input?: { force?: boolean }) => {
      const normalizedPath = normalizeRelativePath(path)
      const existing = fileViewByPathRef.current[normalizedPath]
      if (existing?.loading) return
      if (!input?.force && (existing?.content || existing?.tooLarge) && !existing.error) {
        return
      }

      setFileViewByPath((current) => {
        const nextExisting = current[normalizedPath]
        return {
          ...current,
          [normalizedPath]: {
            loading: true,
            error: undefined,
            tooLarge: false,
            content: nextExisting?.content,
          },
        }
      })

      try {
        const metadata = await readProjectFileRawMetadata({
          directory: props.directory,
          path: normalizedPath,
        })
        if (shouldOpenFileInDefaultAppBySize({ ...metadata, path: normalizedPath })) {
          setFileViewByPath((current) => {
            const existing = current[normalizedPath]
            if (!existing) return current
            return {
              ...current,
              [normalizedPath]: {
                loading: false,
                error: undefined,
                tooLarge: true,
              },
            }
          })
          return
        }

        const content = await readProjectExplorerFile({
          directory: props.directory,
          path: normalizedPath,
        })
        setFileViewByPath((current) => {
          const existing = current[normalizedPath]
          if (!existing) return current
          return {
            ...current,
            [normalizedPath]: {
              loading: false,
              error: undefined,
              tooLarge: false,
              content,
            },
          }
        })
      } catch (error) {
        setFileViewByPath((current) => {
          const existing = current[normalizedPath]
          if (!existing) return current
          return {
            ...current,
            [normalizedPath]: {
              loading: false,
              error: error instanceof Error ? error.message : String(error),
              tooLarge: false,
              content: existing.content,
            },
          }
        })
      }
    },
    [props.directory],
  )

  const loadReaderFile = useCallback(
    async (path: string, input?: { force?: boolean }) => {
      const normalizedPath = normalizeRelativePath(path)
      const existing = readerViewByPathRef.current[normalizedPath]
      if (existing?.loading) return
      if (!input?.force && existing?.blob && !existing.error) return

      readerLoadAbortControllersRef.current[normalizedPath]?.abort()
      const controller = new AbortController()
      readerLoadAbortControllersRef.current[normalizedPath] = controller

      setReaderViewByPath((current) => {
        const nextExisting = current[normalizedPath]
        return {
          ...current,
          [normalizedPath]: {
            loading: true,
            error: undefined,
            blob: nextExisting?.blob,
          },
        }
      })

      try {
        const request = buildProjectFileRawUrl(props.directory, normalizedPath)
        const response = await apiFetch(request.endpoint, {
          directory: request.directory,
          signal: controller.signal,
        })
        if (!response.ok) {
          const errorText = await response.text().catch(() => "")
          const message = errorText.trim() || `Request failed (${response.status})`
          throw new Error(message)
        }

        const blob = await response.blob()
        setReaderViewByPath((current) => {
          const existing = current[normalizedPath]
          if (!existing) return current
          return {
            ...current,
            [normalizedPath]: {
              loading: false,
              error: undefined,
              blob,
            },
          }
        })
      } catch (error) {
        if (isAbortError(error)) {
          return
        }
        setReaderViewByPath((current) => {
          const existing = current[normalizedPath]
          if (!existing) return current
          return {
            ...current,
            [normalizedPath]: {
              loading: false,
              error: error instanceof Error ? error.message : String(error),
              blob: existing.blob,
            },
          }
        })
      } finally {
        if (readerLoadAbortControllersRef.current[normalizedPath] === controller) {
          delete readerLoadAbortControllersRef.current[normalizedPath]
        }
      }
    },
    [props.directory],
  )

  const toggleDirectory = useCallback((path: string) => {
    const normalizedPath = normalizeRelativePath(path)
    setDirectoriesByPath((current) => {
      const existing = current[normalizedPath] ?? {
        expanded: false,
        loaded: false,
        loading: false,
        children: EMPTY_CHILDREN,
      }

      return {
        ...current,
        [normalizedPath]: {
          ...existing,
          expanded: !existing.expanded,
        },
      }
    })
  }, [])

  const openFile = useCallback(
    (path: string) => {
      const normalizedPath = normalizeRelativePath(path)
      setOpenTabs((current) => {
        if (current.includes(normalizedPath)) return current
        return [...current, normalizedPath]
      })
      setActivePath(normalizedPath)
      if (isFoliateReaderPath(normalizedPath)) {
        void loadReaderFile(normalizedPath)
        return
      }
      void loadFile(normalizedPath)
    },
    [loadFile, loadReaderFile],
  )

  const closeFileTab = useCallback(async (path: string) => {
    const normalizedPath = normalizeRelativePath(path)
    readerLoadAbortControllersRef.current[normalizedPath]?.abort()
    delete readerLoadAbortControllersRef.current[normalizedPath]
    const handle = editorRefs.current[normalizedPath]
    if (handle) {
      const flushed = await handle.flushPendingSave()
      if (!flushed) {
        setActivePath(normalizedPath)
        return
      }
    }

    delete editorRefs.current[normalizedPath]
    setFileViewByPath((current) => {
      if (!(normalizedPath in current)) return current
      const next = { ...current }
      delete next[normalizedPath]
      return next
    })
    setReaderViewByPath((current) => {
      if (!(normalizedPath in current)) return current
      const next = { ...current }
      delete next[normalizedPath]
      return next
    })
    setOpenTabs((current) => {
      const remaining = current.filter((entry) => entry !== normalizedPath)
      setActivePath((currentActive) => {
        if (currentActive !== normalizedPath) return currentActive
        return remaining.length > 0 ? remaining[remaining.length - 1] : undefined
      })
      return remaining
    })
  }, [])

  const activeNode = activePath ? nodesByPath[activePath] : undefined
  const activeViewState = activePath ? fileViewByPath[activePath] : undefined
  const activeReaderViewState = activePath ? readerViewByPath[activePath] : undefined
  const activeContent = activeViewState?.content
  const activeFileName = activePath ? fileName(activePath) : ""
  const openTabCount = openTabs.length
  const activeReaderSource = useMemo<FoliateReaderSource | null>(() => {
    if (!activePath) return null
    const blob = activeReaderViewState?.blob
    if (!blob) return null
    return {
      kind: "blob",
      blob,
      name: activeFileName,
    }
  }, [activeFileName, activePath, activeReaderViewState?.blob])

  const viewerMode = useMemo(() => {
    if (!activePath) return "empty" as const
    if (isFoliateReaderPath(activePath)) {
      if (!activeReaderViewState || activeReaderViewState.loading) return "loading" as const
      if (activeReaderViewState.error) return "error" as const
      if (activeReaderViewState.blob) return "reader" as const
      return "empty" as const
    }
    if (!activeViewState || activeViewState.loading) return "loading" as const
    if (activeViewState.error) return "error" as const
    if (activeViewState.tooLarge) return "large" as const
    if (!activeContent) return "empty" as const

    if (activeContent.type === "binary") return "unsupported" as const
    if (activeContent.encoding === "base64") {
      if (activeContent.mimeType?.startsWith(IMAGE_MIME_PREFIX)) return "image" as const
      return "unsupported" as const
    }
    if (activeContent.content.length > LARGE_TEXT_FILE_LIMIT_BYTES) return "large" as const
    return "text" as const
  }, [activeContent, activePath, activeReaderViewState, activeViewState])

  const activeFormatLabel = activePath ? formatLabelForPath(activePath) : undefined
  const activeModeLabel =
    viewerMode === "text"
      ? language.t("projectExplorer.editableInApp")
      : viewerMode === "reader"
        ? language.t("projectExplorer.readerPreview")
        : viewerMode === "image"
          ? language.t("projectExplorer.imagePreview")
          : viewerMode === "large" || viewerMode === "unsupported"
            ? language.t("projectExplorer.defaultApp")
            : undefined

  const openInDefaultApp = useCallback(async () => {
    if (!activeNode?.absolute) return
    if (!platform.openPath) {
      setOpenPathError(language.t("projectExplorer.openInDefaultAppUnavailable"))
      return
    }

    try {
      setOpenPathError(undefined)
      await platform.openPath(activeNode.absolute)
    } catch (error) {
      setOpenPathError(error instanceof Error ? error.message : String(error))
    }
  }, [activeNode?.absolute, platform])

  const refreshExpandedDirectories = useCallback(async () => {
    const expandedPaths = Object.entries(directoriesByPath)
      .filter(([, state]) => state.expanded)
      .map(([path]) => path)
      .toSorted((left, right) => left.length - right.length)

    await Promise.allSettled(expandedPaths.map((path) => loadDirectory(path, { force: true })))
  }, [directoriesByPath, loadDirectory])

  function renderDirectory(path: string, depth: number): ReactNode {
    const directoryState = directoriesByPath[path]
    const children = sortedNodes(directoryState?.children ?? EMPTY_CHILDREN, nodesByPath)

    return (
      <div key={`directory:${path || ROOT_DIRECTORY_PATH}`}>
        {children.map((node) => {
          if (node.type === "directory") {
            const nodeState = directoriesByPath[node.path] ?? {
              expanded: false,
              loaded: false,
              loading: false,
              children: EMPTY_CHILDREN,
            }
            return (
              <div key={node.path}>
                <button
                  type="button"
                  className="flex h-7 w-full items-center gap-1.5 rounded-lg px-2 text-left text-[12px] text-text-weak transition-[background-color,color,box-shadow] duration-150 hover:bg-surface-raised-base/80 hover:text-text-base"
                  style={{ paddingLeft: `${depth * 12 + 8}px` }}
                  onClick={() => toggleDirectory(node.path)}
                >
                  {nodeState.expanded ? (
                    <ChevronDownIcon className="size-3 text-text-weak" />
                  ) : (
                    <ChevronRightIcon className="size-3 text-text-weak" />
                  )}
                  {fileIconForNode(node)}
                  <span
                    className={`min-w-0 flex-1 truncate ${node.ignored ? "text-text-weak/70" : "text-text-base"}`}
                  >
                    {node.name}
                  </span>
                  {nodeState.loading ? (
                    <Loader2Icon className="size-3 animate-spin text-text-weak" />
                  ) : null}
                </button>
                {nodeState.expanded ? (
                  <div>
                    {nodeState.error ? (
                      <div
                        className="px-2 py-1 text-[11px] text-icon-critical-base"
                        style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}
                      >
                        {nodeState.error}
                      </div>
                    ) : null}
                    {nodeState.loaded ? renderDirectory(node.path, depth + 1) : null}
                  </div>
                ) : null}
              </div>
            )
          }

          const isActive = node.path === activePath
          return (
            <button
              key={node.path}
              type="button"
              className={cn(
                "flex h-7 w-full items-center gap-1.5 rounded-lg px-2 text-left text-[12px] transition-[background-color,color,box-shadow] duration-150",
                isActive
                  ? "bg-surface-raised-base text-text-base shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--border-base)_70%,transparent)]"
                  : "text-text-weak hover:bg-surface-raised-base/80 hover:text-text-base",
              )}
              style={{ paddingLeft: `${depth * 12 + 24}px` }}
              onClick={() => openFile(node.path)}
            >
              {fileIconForNode(node)}
              <span className="min-w-0 flex-1 truncate">{node.name}</span>
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <section
      data-component="project-file-explorer-panel"
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden bg-background-base/95",
        props.className,
      )}
    >
      <div className="flex items-start justify-between gap-3 border-b border-border-weaker-base bg-background-base/95 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-text-base">
              {language.t("projectExplorer.title")}
            </p>
            {openTabCount > 0 ? <Badge variant="secondary">{openTabCount}</Badge> : null}
          </div>
          <p className="mt-1 truncate text-[11px] text-text-weak">{props.directory}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon-sm"
            title={
              treeOpen
                ? language.t("projectExplorer.hideTree")
                : language.t("projectExplorer.showTree")
            }
            onClick={() => setTreeOpen((current) => !current)}
          >
            {treeOpen ? (
              <PanelRightCloseIcon className="size-4" />
            ) : (
              <PanelRightOpenIcon className="size-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              void refreshExpandedDirectories()
            }}
            disabled={directoriesByPath[ROOT_DIRECTORY_PATH]?.loading === true}
            title={language.t("projectExplorer.refresh")}
          >
            <RefreshCwIcon className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex min-h-0 flex-1 flex-col">
          <div className="border-b border-border-weaker-base bg-background-base/75 px-3 py-2">
            <div className="flex min-h-9 items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {openTabs.length === 0 ? (
                <span className="px-1 text-xs text-text-weak">
                  {language.t("projectExplorer.noOpenFiles")}
                </span>
              ) : (
                openTabs.map((tabPath) => {
                  const tabLabel = fileName(tabPath)
                  const active = tabPath === activePath
                  return (
                    <div
                      key={tabPath}
                      className={cn(
                        "group flex items-center rounded-full border transition-colors",
                        active
                          ? "border-border-base bg-surface-raised-base text-text-base shadow-sm"
                          : "border-border-weaker-base bg-background-base/60 text-text-weak hover:border-border-base hover:text-text-base",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => openFile(tabPath)}
                        className="max-w-64 truncate px-3 py-1.5 text-xs"
                        title={tabPath}
                      >
                        {tabLabel}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void closeFileTab(tabPath)
                        }}
                        className="mr-1 flex size-6 items-center justify-center rounded-full text-text-weak transition-colors hover:bg-surface-base-hover hover:text-text-base"
                        aria-label={language.t("projectExplorer.closeTab")}
                      >
                        <XIcon className="size-3.5" />
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {activePath ? (
            <div className="border-b border-border-weaker-base bg-[linear-gradient(180deg,color-mix(in_oklab,var(--background-base)_92%,transparent)_0%,color-mix(in_oklab,var(--surface-raised-base)_78%,transparent)_100%)] px-4 py-3">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-text-base">
                      {activeFileName}
                    </p>
                    {activeFormatLabel ? (
                      <Badge variant="secondary">{activeFormatLabel}</Badge>
                    ) : null}
                    {activeModeLabel ? <Badge variant="outline">{activeModeLabel}</Badge> : null}
                  </div>
                  <p className="mt-1 truncate text-[11px] text-text-weak">{activePath}</p>
                </div>
              </div>
              {openPathError ? (
                <p className="mt-2 text-xs text-icon-critical-base">{openPathError}</p>
              ) : null}
            </div>
          ) : null}

          <div className="min-h-0 flex-1 bg-background-base/55">
            {openTabs.map((tabPath) => {
              const tabContent = fileViewByPath[tabPath]?.content
              if (!isEditableTextFileContent(tabContent)) return null
              const hidden = tabPath !== activePath
              return (
                <div key={tabPath} className={hidden ? "hidden h-full" : "h-full"}>
                  <VersionedTextFileEditor
                    ref={(instance) => {
                      if (instance) {
                        editorRefs.current[tabPath] = instance
                        return
                      }
                      delete editorRefs.current[tabPath]
                    }}
                    active={tabPath === activePath}
                    fallbackPath={tabPath}
                    languageId={monacoLanguageForPath(tabPath)}
                    reloadBehavior="once"
                    statusIndicator="pill"
                    errorPresentation="inline"
                    className="h-full min-h-0"
                    load={async () => {
                      const loaded = await readProjectExplorerEditableFile({
                        directory: props.directory,
                        path: tabPath,
                      })
                      return {
                        path: loaded.path,
                        exists: true,
                        content: loaded.content,
                        version: loaded.version,
                      }
                    }}
                    save={async (input) => {
                      const saved = await saveProjectExplorerEditableFile({
                        directory: props.directory,
                        path: tabPath,
                        content: input.content,
                        expectedVersion: input.expectedVersion,
                      })
                      setFileViewByPath((current) => {
                        const existing = current[tabPath]
                        if (!existing?.content || existing.content.type !== "text") return current
                        return {
                          ...current,
                          [tabPath]: {
                            ...existing,
                            error: undefined,
                            content: {
                              ...existing.content,
                              content: saved.content,
                              diff: undefined,
                              patch: undefined,
                            },
                          },
                        }
                      })
                      return saved
                    }}
                    isVersionConflictError={(error) =>
                      error instanceof ProjectExplorerFileVersionConflictError
                    }
                  />
                </div>
              )
            })}

            {viewerMode === "empty" ? (
              <div className="flex h-full items-center justify-center px-6">
                <div className="max-w-md rounded-2xl border border-border-weaker-base bg-background-base/90 px-5 py-5 text-sm shadow-sm">
                  <p className="font-medium text-text-base">
                    {language.t("projectExplorer.title")}
                  </p>
                  <p className="mt-2 text-text-weak">{language.t("projectExplorer.selectFile")}</p>
                </div>
              </div>
            ) : null}

            {viewerMode === "loading" ? (
              <div className="flex h-full items-center justify-center gap-2 px-6 text-sm text-text-weak">
                <Loader2Icon className="size-4 animate-spin" />
                {language.t("projectExplorer.loadingFile")}
              </div>
            ) : null}

            {viewerMode === "error" ? (
              <div className="flex h-full items-center justify-center px-6">
                <div className="max-w-xl rounded-2xl border border-border-critical-base/40 bg-surface-critical-base/10 px-4 py-3 text-sm text-icon-critical-base">
                  {activeReaderViewState?.error ??
                    activeViewState?.error ??
                    language.t("projectExplorer.readFailed")}
                </div>
              </div>
            ) : null}

            {viewerMode === "image" && activeContent ? (
              <div className="flex h-full items-center justify-center overflow-auto bg-background-base p-5">
                <img
                  src={`data:${activeContent.mimeType ?? "application/octet-stream"};base64,${activeContent.content}`}
                  alt={activePath ?? ""}
                  className="max-h-full max-w-full rounded-xl border border-border-weaker-base bg-white shadow-sm"
                />
              </div>
            ) : null}

            {viewerMode === "reader" && activeReaderSource ? (
              <FoliateReader
                key={activePath}
                source={activeReaderSource}
                className="h-full min-h-0"
              />
            ) : null}

            {viewerMode === "large" || viewerMode === "unsupported" ? (
              <div className="flex h-full items-center justify-center px-6">
                <div className="max-w-xl rounded-2xl border border-border-weaker-base bg-background-base px-5 py-5 text-sm text-text-weak shadow-sm">
                  <div className="mb-2 flex items-center gap-2 text-text-base">
                    <AlertCircleIcon className="size-4" />
                    <span>{language.t("projectExplorer.unavailableInApp")}</span>
                  </div>
                  <p className="mb-4">
                    {viewerMode === "large"
                      ? language.t("projectExplorer.largeFileMessage")
                      : language.t("projectExplorer.unsupportedFileMessage")}
                  </p>
                  <Button size="sm" onClick={() => void openInDefaultApp()}>
                    <ExternalLinkIcon className="size-4" />
                    {language.t("projectExplorer.openInDefaultApp")}
                  </Button>
                  {openPathError ? (
                    <p className="mt-2 text-xs text-icon-critical-base">{openPathError}</p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {treeOpen ? (
          <aside
            className={cn(
              "shrink-0 border-l border-border-weaker-base bg-[linear-gradient(180deg,color-mix(in_oklab,var(--background-base)_96%,transparent)_0%,color-mix(in_oklab,var(--surface-raised-base)_82%,transparent)_100%)]",
              FILE_TREE_COLUMN_WIDTH_CLASS,
            )}
          >
            <div className="flex h-full min-h-0 flex-col">
              <div className="border-b border-border-weaker-base px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-weak">
                  {language.t("projectExplorer.explorer")}
                </p>
                <p className="mt-1 text-[11px] text-text-weak">
                  {language.t("projectExplorer.files")}
                </p>
              </div>
              <div className="min-h-0 overflow-y-auto px-2 py-2">
                {directoriesByPath[ROOT_DIRECTORY_PATH]?.loading &&
                !directoriesByPath[ROOT_DIRECTORY_PATH]?.loaded ? (
                  <div className="px-2 py-2 text-xs text-text-weak">
                    {language.t("projectExplorer.loading")}
                  </div>
                ) : null}
                {directoriesByPath[ROOT_DIRECTORY_PATH]?.error ? (
                  <div className="px-2 py-2 text-xs text-icon-critical-base">
                    {directoriesByPath[ROOT_DIRECTORY_PATH]?.error}
                  </div>
                ) : null}
                {renderDirectory(ROOT_DIRECTORY_PATH, 0)}
              </div>
            </div>
          </aside>
        ) : (
          <div className="flex w-12 shrink-0 items-start justify-center border-l border-border-weaker-base bg-background-base/90 px-1 pt-3">
            <Button
              variant="ghost"
              size="icon-sm"
              title={language.t("projectExplorer.showTree")}
              onClick={() => setTreeOpen(true)}
            >
              <PanelRightOpenIcon className="size-4" />
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}
