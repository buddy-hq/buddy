import { createFileRoute } from "@tanstack/react-router"
import {
  AlertCircleIcon,
  ClipboardCopyIcon,
  Loader2Icon,
} from "lucide-react"
import { useMemo } from "react"
import { toast } from "@buddy/ui"
import {
  BenchSurfaceViewer,
  type BenchViewerAction,
} from "@/components/bench/bench-viewer-shell"
import { BenchMediaPreview } from "@/components/bench/bench-media-preview"
import { DirectoryInvalidNotebook } from "@/components/directory-chat/directory-invalid-notebook"
import { stringifyError } from "@/lib/api-client"
import { resolveAssetUrl } from "@/lib/resource-url"
import { buildProjectFileRawUrl } from "@/lib/project-file-raw-url"
import { decodeDirectory } from "@/lib/directory-token"
import { classifyWorkspaceMedia, readWorkspaceFileRawMetadata } from "@/lib/workspace-file-media"
import { fileNameFromPath } from "@/lib/workspace-file-paths"

type ProjectFileBenchSearch = {
  path?: string
}

export const Route = createFileRoute("/$directory/_bench/file")({
  validateSearch: (search: Record<string, unknown>): ProjectFileBenchSearch => ({
    path: typeof search.path === "string" ? search.path : undefined,
  }),
  loaderDeps: ({ search }) => ({
    path: search.path,
  }),
  loader: async ({ deps, params }) => {
    if (!deps.path) {
      throw new Error("Missing file path.")
    }
    const directory = decodeDirectory(params.directory)
    return readWorkspaceFileRawMetadata({ directory, path: deps.path })
  },
  pendingComponent: ProjectFileBenchPending,
  errorComponent: ProjectFileBenchError,
  component: ProjectFileBenchRoute,
})

function ProjectFileBenchPending() {
  return (
    <BenchSurfaceViewer title="Loading file">
      <div className="flex h-full items-center justify-center text-sm text-text-weak">
        <Loader2Icon className="mr-2 size-4 animate-spin" aria-hidden />
        Loading file
      </div>
    </BenchSurfaceViewer>
  )
}

function ProjectFileBenchError() {
  return (
    <BenchSurfaceViewer title="File unavailable">
      <div className="flex h-full items-center justify-center p-6 text-sm text-icon-critical-base">
        <AlertCircleIcon className="mr-2 size-4" aria-hidden />
        File could not be loaded.
      </div>
    </BenchSurfaceViewer>
  )
}

function ProjectFileBenchRoute() {
  const params = Route.useParams()
  const search = Route.useSearch()
  const metadata = Route.useLoaderData()

  try {
    const directory = decodeDirectory(params.directory)
    if (!search.path) {
      return <ProjectFileBenchError />
    }
    return <ProjectFileBenchView directory={directory} path={search.path} metadata={metadata} />
  } catch {
    return <DirectoryInvalidNotebook />
  }
}

function ProjectFileBenchView(props: {
  directory: string
  path: string
  metadata: {
    mimeType: string | undefined
    sizeBytes: number | undefined
  }
}) {
  const rawUrl = resolveAssetUrl(
    buildProjectFileRawUrl({ directory: props.directory, path: props.path }),
  )
  const classification = classifyWorkspaceMedia({
    path: props.path,
    mimeType: props.metadata.mimeType,
    sizeBytes: props.metadata.sizeBytes,
  })
  const title = fileNameFromPath(props.path) || props.path
  const actions = useMemo<BenchViewerAction[]>(
    () => [
      {
        label: "Copy path",
        dataAction: "project-file-copy-path",
        icon: <ClipboardCopyIcon className="size-4" aria-hidden />,
        onClick: () => {
          void navigator.clipboard.writeText(props.path).then(
            () => toast("Path copied"),
            (error: unknown) => toast(stringifyError(error)),
          )
        },
      },
    ],
    [props.path],
  )

  return (
    <BenchSurfaceViewer title={title} subtitle={props.path} actions={actions}>
      <BenchMediaPreview
        title={props.path}
        src={rawUrl}
        renderMode={classification.renderMode}
        displayPath={props.path}
      />
    </BenchSurfaceViewer>
  )
}
