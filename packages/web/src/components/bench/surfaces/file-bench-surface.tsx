import { useQuery } from "@tanstack/react-query"
import { AlertCircleIcon } from "@/icons/app-icons"
import { useMemo, useState } from "react"
import { BenchFileMissingSurface } from "@/components/bench/bench-file-missing"
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
import { WorkspaceFileLargeWarning } from "@/components/files/workspace-file-actions"
import { buildProjectFileRawUrl } from "@/lib/project-file-raw-url"
import { resolveAssetUrl } from "@/lib/resource-url"
import { isSvgMedia } from "@/lib/svg-media"
import {
  WorkspaceFileMissingError,
  canOpenWorkspaceFileOnBench,
  classifyWorkspaceMedia,
  isWorkspaceFileOverSoftLimit,
} from "@/lib/workspace-file-media"
import { fileNameFromPath, workspaceFileInstanceKey } from "@/lib/workspace-file-paths"
import { isSupportedReadingResourcePath } from "@/state/resources-query"
import { workspaceFileMetadataQueryOptions } from "@/state/bench-surface-query"
import { benchSurfaceUiKey } from "@/state/bench-surface-ui-state"
import { consumeWorkspaceFileLargeOpenApproval } from "@/state/workspace-file-open-dialog-store"
import { BENCH_WORKSPACE_ROOT_NOTEBOOK, type BenchTarget } from "@/lib/bench-navigation"

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
  // Reading resources render through DirectoryChatReadingPage, which checks its own source file,
  // so a request here would be issued and discarded on every epub or PDF open.
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
        target={Object.assign(
          {
            type: "workspace-file" as const,
            root: BENCH_WORKSPACE_ROOT_NOTEBOOK,
            path: props.path,
            viewer: "file" as const,
          },
          props.fragment ? { fragment: props.fragment } : undefined,
        )}
      />
    )
  }
  const missingOnDisk = metadataQuery.error instanceof WorkspaceFileMissingError
  if (metadataQuery.isPending) return <ProjectFileBenchPending />
  if (!metadataQuery.data) {
    return missingOnDisk ? <BenchFileMissingSurface path={props.path} /> : <ProjectFileBenchError />
  }

  return (
    <ProjectFileBenchView
      key={workspaceFileInstanceKey({ directory: props.directory, path: props.path })}
      directory={props.directory}
      path={props.path}
      metadata={metadataQuery.data}
      missingOnDisk={missingOnDisk}
    />
  )
}

function ProjectFileBenchView(props: {
  directory: string
  path: string
  metadata: { mimeType: string | undefined; sizeBytes: number | undefined }
  missingOnDisk: boolean
}) {
  // A file that has been open under the limit stays open as it grows, so a metadata refresh after
  // an agent edit never swaps an editor, and its unsaved changes, for the large-file warning.
  const [approved, setApproved] = useState(
    () =>
      consumeWorkspaceFileLargeOpenApproval(props.directory, props.path) ||
      !isWorkspaceFileOverSoftLimit({ path: props.path, ...props.metadata }),
  )
  const classification = classifyWorkspaceMedia({ path: props.path, ...props.metadata })
  const overSoftLimit = isWorkspaceFileOverSoftLimit({ path: props.path, ...props.metadata })
  if (!overSoftLimit && !approved) setApproved(true)

  if (overSoftLimit && !approved && props.metadata.sizeBytes !== undefined) {
    // A failed refresh keeps the last metadata, so a deleted file would otherwise stay behind
    // the warning.
    if (props.missingOnDisk) return <BenchFileMissingSurface path={props.path} />
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
          path={props.path}
          sizeBytes={props.metadata.sizeBytes}
          onOpenAnyway={() => setApproved(true)}
        />
      </BenchStaticContextProvider>
    )
  }

  const mediaRenderMode =
    classification.renderMode === "image" ||
    classification.renderMode === "audio" ||
    classification.renderMode === "video"
      ? classification.renderMode
      : undefined

  if (!mediaRenderMode && canOpenWorkspaceFileOnBench({ path: props.path, ...props.metadata })) {
    return <SourceFileBenchView directory={props.directory} path={props.path} />
  }

  if (props.missingOnDisk) return <BenchFileMissingSurface path={props.path} />

  if (mediaRenderMode) {
    return (
      <ProjectFileMediaView
        directory={props.directory}
        path={props.path}
        metadata={props.metadata}
        renderMode={mediaRenderMode}
      />
    )
  }

  return (
    <ProjectFileUnsupportedView
      path={props.path}
      metadata={props.metadata}
      mediaKind={classification.mediaKind}
    />
  )
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
    () => ({
      type: "workspace-file",
      root: BENCH_WORKSPACE_ROOT_NOTEBOOK,
      path: props.path,
      viewer: "file",
    }),
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

  return svg ? (
    <SvgBenchView
      title={title}
      subtitle={props.path}
      src={rawUrl}
      viewportKey={benchSurfaceUiKey({
        directory: props.directory,
        target: contextTarget,
      })}
    />
  ) : (
    <BenchSurfaceViewer title={title} subtitle={props.path} hideHeader>
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
      <BenchSurfaceViewer title={title}>
        <div className="flex h-full items-center justify-center p-6 text-center text-sm text-text-weak">
          This file cannot be opened in Buddy.
        </div>
      </BenchSurfaceViewer>
    </BenchStaticContextProvider>
  )
}
