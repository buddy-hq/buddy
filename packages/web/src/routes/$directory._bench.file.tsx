import { createFileRoute, useLocation } from "@tanstack/react-router"
import { AlertCircleIcon, Loader2Icon } from "lucide-react"
import { useMemo, useState } from "react"
import { BenchMediaPreview } from "@/components/bench/bench-media-preview"
import { BenchStaticContextProvider } from "@/components/bench/bench-static-context-provider"
import { BenchSurfaceViewer } from "@/components/bench/bench-viewer-shell"
import { SourceFileBenchView } from "@/components/bench/source-file-bench-view"
import { useRegisterBenchContextProvider } from "@/components/bench/bench-route-context"
import {
  routeString,
  urlRef,
  workspaceFileRef,
  workspaceFileTarget,
} from "@/components/bench/bench-context-utils"
import { DirectoryChatReadingPage } from "@/components/directory-chat/directory-chat-reading-page"
import { DirectoryInvalidNotebook } from "@/components/directory-chat/directory-invalid-notebook"
import {
  WorkspaceFileActionsMenu,
  WorkspaceFileLargeWarning,
} from "@/components/files/workspace-file-actions"
import { decodeDirectory } from "@/lib/directory-token"
import { buildProjectFileRawUrl } from "@/lib/project-file-raw-url"
import { resolveAssetUrl } from "@/lib/resource-url"
import {
  canOpenWorkspaceFileOnBench,
  classifyWorkspaceMedia,
  isWorkspaceFileOverSoftLimit,
  readWorkspaceFileRawMetadata,
} from "@/lib/workspace-file-media"
import { fileNameFromPath, workspaceFileInstanceKey } from "@/lib/workspace-file-paths"
import { isSupportedReadingResourcePath } from "@/state/resources-query"
import { consumeWorkspaceFileLargeOpenApproval } from "@/state/workspace-file-open-dialog-store"

type ProjectFileBenchSearch = {
  path?: string
}

export const Route = createFileRoute("/$directory/_bench/file")({
  validateSearch: (search: Record<string, unknown>): ProjectFileBenchSearch => ({
    path: typeof search.path === "string" ? search.path : undefined,
  }),
  loaderDeps: ({ search }) => ({ path: search.path }),
  loader: async ({ deps, params }) => {
    if (!deps.path) throw new Error("Missing file path.")
    return readWorkspaceFileRawMetadata({
      directory: decodeDirectory(params.directory),
      path: deps.path,
    })
  },
  pendingComponent: ProjectFileBenchPending,
  errorComponent: ProjectFileBenchError,
  component: ProjectFileBenchRoute,
})

function ProjectFileBenchPending() {
  return (
    <BenchStaticContextProvider
      status="loading"
      metadata={["surface_status: loading"]}
      content="File Bench is visible and loading the requested file."
      hints={["Try bench_read_context again after the file finishes loading."]}
    >
      <BenchSurfaceViewer title="Loading file">
        <div className="flex h-full items-center justify-center text-sm text-text-weak">
          <Loader2Icon className="mr-2 size-4 animate-spin" aria-hidden />
          Loading file
        </div>
      </BenchSurfaceViewer>
    </BenchStaticContextProvider>
  )
}

function ProjectFileBenchError() {
  return (
    <BenchStaticContextProvider
      status="error"
      metadata={["surface_status: error"]}
      content="File Bench is visible, but the requested file could not be loaded."
      hints={["Check that the workspace file path exists and is readable."]}
    >
      <BenchSurfaceViewer title="File unavailable">
        <div className="flex h-full items-center justify-center p-6 text-sm text-icon-critical-base">
          <AlertCircleIcon className="mr-2 size-4" aria-hidden />
          File could not be loaded.
        </div>
      </BenchSurfaceViewer>
    </BenchStaticContextProvider>
  )
}

function ProjectFileBenchRoute() {
  const params = Route.useParams()
  const search = Route.useSearch()
  const metadata = Route.useLoaderData()

  try {
    const directory = decodeDirectory(params.directory)
    if (!search.path) return <ProjectFileBenchError />
    if (isSupportedReadingResourcePath(search.path)) {
      return <DirectoryChatReadingPage directory={directory} resourcePath={search.path} />
    }
    return (
      <ProjectFileBenchView
        key={workspaceFileInstanceKey({ directory, path: search.path })}
        directory={directory}
        path={search.path}
        metadata={metadata}
      />
    )
  } catch {
    return <DirectoryInvalidNotebook />
  }
}

function ProjectFileBenchView(props: {
  directory: string
  path: string
  metadata: { mimeType: string | undefined; sizeBytes: number | undefined }
}) {
  const [approved, setApproved] = useState(() =>
    consumeWorkspaceFileLargeOpenApproval(props.directory, props.path),
  )
  const classification = classifyWorkspaceMedia({ path: props.path, ...props.metadata })
  const overSoftLimit = isWorkspaceFileOverSoftLimit({ path: props.path, ...props.metadata })

  if (overSoftLimit && !approved && typeof props.metadata.sizeBytes === "number") {
    return (
      <BenchStaticContextProvider
        status="ready"
        metadata={[
          "surface_status: warning",
          `size_bytes: ${props.metadata.sizeBytes}`,
          "large_file_approved: false",
        ]}
        content={`A large-file warning is visible for ${props.path}. The file has not been opened yet.`}
        hints={["The user can choose Open anyway or use an external file action."]}
      >
        <WorkspaceFileLargeWarning
          directory={props.directory}
          path={props.path}
          sizeBytes={props.metadata.sizeBytes}
          onOpenAnyway={() => setApproved(true)}
        />
      </BenchStaticContextProvider>
    )
  }

  if (
    classification.renderMode === "image" ||
    classification.renderMode === "audio" ||
    classification.renderMode === "video"
  ) {
    return <ProjectFileMediaView {...props} renderMode={classification.renderMode} />
  }

  if (canOpenWorkspaceFileOnBench({ path: props.path, ...props.metadata })) {
    return <SourceFileBenchView directory={props.directory} path={props.path} />
  }

  return <ProjectFileUnsupportedView {...props} mediaKind={classification.mediaKind} />
}

function ProjectFileMediaView(props: {
  directory: string
  path: string
  metadata: { mimeType: string | undefined; sizeBytes: number | undefined }
  renderMode: "image" | "audio" | "video"
}) {
  const location = useLocation()
  const rawUrl = resolveAssetUrl(
    buildProjectFileRawUrl({ directory: props.directory, path: props.path }),
  )
  const title = fileNameFromPath(props.path) || props.path
  const contextProvider = useMemo(
    () => ({
      read: () => ({
        status: "open" as const,
        target: workspaceFileTarget({
          directory: props.directory,
          title,
          path: props.path,
          route: routeString({ pathname: location.pathname, searchStr: location.searchStr }),
          status: "ready",
        }),
        metadata: [
          `mime_type: ${props.metadata.mimeType ?? "unknown"}`,
          `size_bytes: ${props.metadata.sizeBytes ?? "unknown"}`,
          `render_mode: ${props.renderMode}`,
        ],
        content: `Media preview is open on Bench: ${props.path}. Binary bytes are not inlined in Bench context.`,
        refs: [
          workspaceFileRef({ path: props.path, note: "File currently visible on Bench." }),
          ...urlRef({ url: rawUrl, note: "Raw file URL." }),
        ],
        hints: ["Use file, image, or media-capable tools to inspect the file bytes."],
      }),
    }),
    [location.pathname, location.searchStr, props, rawUrl, title],
  )
  useRegisterBenchContextProvider(contextProvider)

  return (
    <BenchSurfaceViewer
      title={title}
      subtitle={props.path}
      toolbar={<WorkspaceFileActionsMenu directory={props.directory} path={props.path} />}
    >
      <BenchMediaPreview
        title={props.path}
        src={rawUrl}
        renderMode={props.renderMode}
        displayPath={props.path}
      />
    </BenchSurfaceViewer>
  )
}

function ProjectFileUnsupportedView(props: {
  directory: string
  path: string
  metadata: { mimeType: string | undefined; sizeBytes: number | undefined }
  mediaKind: string
}) {
  const title = fileNameFromPath(props.path) || props.path
  return (
    <BenchStaticContextProvider
      status="error"
      metadata={[
        "surface_status: unsupported",
        `media_kind: ${props.mediaKind}`,
        `mime_type: ${props.metadata.mimeType ?? "unknown"}`,
      ]}
      content={`Buddy cannot preview or edit ${props.path}. External file actions are available.`}
      hints={["Use the file actions menu to open, reveal, or copy the path."]}
    >
      <BenchSurfaceViewer
        title={title}
        subtitle={props.path}
        toolbar={<WorkspaceFileActionsMenu directory={props.directory} path={props.path} />}
      >
        <div className="flex h-full items-center justify-center p-6 text-center text-sm text-text-weak">
          This file cannot be opened in Buddy.
        </div>
      </BenchSurfaceViewer>
    </BenchStaticContextProvider>
  )
}
