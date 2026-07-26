import { useQuery } from "@tanstack/react-query"
import { AlertCircleIcon } from "@/icons/app-icons"
import { useMemo, useState } from "react"
import { BenchMediaPreview } from "@/components/bench/bench-media-preview"
import { BenchStaticContextProvider } from "@/components/bench/bench-static-context-provider"
import { BenchSurfacePending } from "@/components/bench/bench-surface-pending"
import { BenchSurfaceViewer } from "@/components/bench/bench-viewer-shell"
import { SourceFileBenchView } from "@/components/bench/source-file-bench-view"
import { SvgBenchView } from "@/components/bench/svg-bench-view"
import { useRegisterBenchContextProvider } from "@/components/bench/bench-route-context"
import { urlRef, workspaceFileRef } from "@/components/bench/bench-context-utils"
import { DirectoryChatReadingPage } from "@/components/directory-chat/directory-chat-reading-page"
import { DirectoryInvalidNotebook } from "@/components/directory-chat/directory-invalid-notebook"
import {
  WorkspaceFileActionsMenu,
  WorkspaceFileLargeWarning,
} from "@/components/files/workspace-file-actions"
import { buildProjectFileRawUrl } from "@/lib/project-file-raw-url"
import { resolveAssetUrl } from "@/lib/resource-url"
import { isSvgMedia } from "@/lib/svg-media"
import {
  canOpenWorkspaceFileOnBench,
  classifyWorkspaceMedia,
  isWorkspaceFileOverSoftLimit,
} from "@/lib/workspace-file-media"
import { fileNameFromPath, workspaceFileInstanceKey } from "@/lib/workspace-file-paths"
import { isSupportedReadingResourcePath } from "@/state/resources-query"
import { workspaceFileMetadataQueryOptions } from "@/state/bench-surface-query"
import { benchSurfaceUiKey } from "@/state/bench-surface-ui-state"
import { consumeWorkspaceFileLargeOpenApproval } from "@/state/workspace-file-open-dialog-store"
import type { BenchTarget } from "@/lib/bench-navigation"

function ProjectFileBenchPending() {
  return (
    <BenchStaticContextProvider
      status="loading"
      metadata={["surface_status: loading"]}
      content="File Bench is visible and loading the requested file."
      hints={["Try bench_read_context again after the file finishes loading."]}
    >
      <BenchSurfacePending />
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

export function FileBenchSurface(props: { directory: string; path: string; fragment?: string }) {
  // Reading resources render through DirectoryChatReadingPage and never consult the metadata, so
  // the request would be issued and discarded on every epub or PDF open.
  const isReadingResource = isSupportedReadingResourcePath(props.path)
  const metadataQuery = useQuery({
    ...workspaceFileMetadataQueryOptions({ directory: props.directory, path: props.path }),
    enabled: Boolean(props.path) && !isReadingResource,
  })

  if (!props.directory) return <DirectoryInvalidNotebook />
  if (!props.path) return <ProjectFileBenchError />
  if (isReadingResource) {
    return (
      <DirectoryChatReadingPage
        directory={props.directory}
        resourcePath={props.path}
        target={{
          type: "workspace-file",
          path: props.path,
          viewer: "file",
          ...(props.fragment ? { fragment: props.fragment } : {}),
        }}
      />
    )
  }
  if (metadataQuery.isPending) return <ProjectFileBenchPending />
  if (metadataQuery.isError || !metadataQuery.data) return <ProjectFileBenchError />

  return (
    <ProjectFileBenchView
      key={workspaceFileInstanceKey({ directory: props.directory, path: props.path })}
      directory={props.directory}
      path={props.path}
      metadata={metadataQuery.data}
    />
  )
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
  const rawUrl = resolveAssetUrl(
    buildProjectFileRawUrl({ directory: props.directory, path: props.path }),
  )
  const title = fileNameFromPath(props.path) || props.path
  const svg = isSvgMedia({
    fileName: props.path,
    mimeType: props.metadata.mimeType,
  })
  const contextTarget = useMemo<BenchTarget>(
    () => ({ type: "workspace-file", path: props.path, viewer: "file" }),
    [props.path],
  )
  const contextProvider = useMemo(
    () => ({
      read: () => ({
        targetStatus: "ready" as const,
        title,
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
    [
      props.metadata.mimeType,
      props.metadata.sizeBytes,
      props.path,
      props.renderMode,
      rawUrl,
      title,
    ],
  )
  useRegisterBenchContextProvider({ target: contextTarget, provider: contextProvider })

  const toolbar = <WorkspaceFileActionsMenu directory={props.directory} path={props.path} />

  return svg ? (
    <SvgBenchView
      title={title}
      subtitle={props.path}
      src={rawUrl}
      toolbar={toolbar}
      viewportKey={benchSurfaceUiKey({
        directory: props.directory,
        target: contextTarget,
      })}
    />
  ) : (
    <BenchSurfaceViewer
      title={title}
      subtitle={props.path}
      toolbar={toolbar}
      controlsPlacement="dock"
      hideHeader
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
