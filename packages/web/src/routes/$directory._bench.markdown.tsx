import { createFileRoute } from "@tanstack/react-router"
import { isMarkdownBenchPath } from "@buddy/workspace-file-policy"
import { AlertCircleIcon, Loader2Icon } from "lucide-react"
import { useEffect, useState } from "react"
import { BenchViewerShell } from "@/components/bench/bench-viewer-shell"
import { BenchStaticContextProvider } from "@/components/bench/bench-static-context-provider"
import { MarkdownBenchPage } from "@/components/bench/markdown-bench-page"
import { DirectoryInvalidNotebook } from "@/components/directory-chat/directory-invalid-notebook"
import { decodeDirectory } from "@/lib/directory-token"
import { workspaceFileInstanceKey } from "@/lib/workspace-file-paths"
import {
  readProjectExplorerEditableFile,
  type ProjectExplorerEditableFileState,
} from "@/state/chat-actions"
import {
  LARGE_TEXT_FILE_LIMIT_BYTES,
  readWorkspaceFileRawMetadata,
} from "@/lib/workspace-file-media"
import { WorkspaceFileLargeWarning } from "@/components/files/workspace-file-actions"
import { consumeWorkspaceFileLargeOpenApproval } from "@/state/workspace-file-open-dialog-store"

const AGENTS_MD_PATH = "AGENTS.md"
const AGENTS_MD_PLACEHOLDER = "Set rules and customize how Buddy responds in this notebook."

type MarkdownBenchSearch = {
  path?: string
}

type MarkdownBenchLoaderData =
  | {
      status: "ready"
      initialFile: ProjectExplorerEditableFileState
      sizeBytes: number | undefined
    }
  | {
      status: "requires-approval"
      sizeBytes: number
    }

export const Route = createFileRoute("/$directory/_bench/markdown")({
  validateSearch: (search: Record<string, unknown>): MarkdownBenchSearch => ({
    path: typeof search.path === "string" ? search.path : undefined,
  }),
  loaderDeps: ({ search }) => ({
    path: search.path,
  }),
  loader: async ({ deps, params }) => {
    if (!deps.path) {
      throw new Error("Missing Markdown path.")
    }
    if (!isMarkdownBenchPath(deps.path)) {
      throw new Error("Only Markdown and MDX files can open on the Markdown Bench.")
    }
    const directory = decodeDirectory(params.directory)
    const metadata = await readWorkspaceFileRawMetadata({
      directory,
      path: deps.path,
    })
    if (
      typeof metadata.sizeBytes === "number" &&
      metadata.sizeBytes > LARGE_TEXT_FILE_LIMIT_BYTES &&
      !consumeWorkspaceFileLargeOpenApproval(directory, deps.path)
    ) {
      return {
        status: "requires-approval",
        sizeBytes: metadata.sizeBytes,
      } satisfies MarkdownBenchLoaderData
    }

    const initialFile = await readProjectExplorerEditableFile({
      directory,
      path: deps.path,
    })
    return {
      status: "ready",
      initialFile,
      sizeBytes: metadata.sizeBytes,
    } satisfies MarkdownBenchLoaderData
  },
  pendingComponent: MarkdownBenchPending,
  errorComponent: MarkdownBenchError,
  component: MarkdownBenchRoute,
})

function MarkdownBenchPending() {
  return (
    <BenchStaticContextProvider
      status="loading"
      metadata={["surface_status: loading"]}
      content="Markdown Bench is visible and loading the requested file."
      hints={["Try bench_read_context again after Markdown finishes loading."]}
    >
      <BenchViewerShell title="Loading Markdown">
        <div className="flex h-full items-center justify-center text-sm text-text-weak">
          <Loader2Icon className="mr-2 size-4 animate-spin" aria-hidden />
          Loading Markdown
        </div>
      </BenchViewerShell>
    </BenchStaticContextProvider>
  )
}

function MarkdownBenchError() {
  return (
    <BenchStaticContextProvider
      status="error"
      metadata={["surface_status: error"]}
      content="Markdown Bench is visible, but the requested Markdown file could not be loaded."
      hints={["Check that the Markdown path exists and is a .md or .mdx file."]}
    >
      <BenchViewerShell title="Markdown unavailable">
        <div className="flex h-full items-center justify-center p-6 text-sm text-icon-critical-base">
          <AlertCircleIcon className="mr-2 size-4" aria-hidden />
          Markdown could not be loaded.
        </div>
      </BenchViewerShell>
    </BenchStaticContextProvider>
  )
}

function MarkdownBenchRoute() {
  const params = Route.useParams()
  const search = Route.useSearch()
  const loaderData = Route.useLoaderData()

  try {
    const directory = decodeDirectory(params.directory)
    if (!search.path) {
      return <MarkdownBenchError />
    }
    return (
      <LargeMarkdownBenchGate
        key={workspaceFileInstanceKey({ directory, path: search.path })}
        directory={directory}
        path={search.path}
        loaderData={loaderData}
      />
    )
  } catch {
    return <DirectoryInvalidNotebook />
  }
}

function LargeMarkdownBenchGate(props: {
  directory: string
  path: string
  loaderData: MarkdownBenchLoaderData
}) {
  const [approved, setApproved] = useState(false)

  if (props.loaderData.status === "ready") {
    return (
      <MarkdownBenchPage
        directory={props.directory}
        path={props.path}
        initialFile={props.loaderData.initialFile}
        placeholder={props.path === AGENTS_MD_PATH ? AGENTS_MD_PLACEHOLDER : undefined}
      />
    )
  }

  if (!approved) {
    return (
      <BenchStaticContextProvider
        status="ready"
        metadata={[
          "surface_status: warning",
          `size_bytes: ${props.loaderData.sizeBytes}`,
          "large_file_approved: false",
        ]}
        content={`A large-file warning is visible for ${props.path}. The Markdown file has not been opened yet.`}
        hints={["The user can choose Open anyway or use an external file action."]}
      >
        <WorkspaceFileLargeWarning
          directory={props.directory}
          path={props.path}
          sizeBytes={props.loaderData.sizeBytes}
          onOpenAnyway={() => setApproved(true)}
        />
      </BenchStaticContextProvider>
    )
  }

  return <ApprovedMarkdownBenchLoader directory={props.directory} path={props.path} />
}

type ApprovedMarkdownBenchLoaderState =
  | { status: "loading" }
  | { status: "ready"; initialFile: ProjectExplorerEditableFileState }
  | { status: "error" }

function ApprovedMarkdownBenchLoader(props: { directory: string; path: string }) {
  const [state, setState] = useState<ApprovedMarkdownBenchLoaderState>({ status: "loading" })

  useEffect(() => {
    let cancelled = false
    setState({ status: "loading" })
    void readProjectExplorerEditableFile({
      directory: props.directory,
      path: props.path,
    }).then(
      (initialFile) => {
        if (!cancelled) setState({ status: "ready", initialFile })
      },
      () => {
        if (!cancelled) setState({ status: "error" })
      },
    )

    return () => {
      cancelled = true
    }
  }, [props.directory, props.path])

  if (state.status === "loading") return <MarkdownBenchPending />
  if (state.status === "error") return <MarkdownBenchError />

  return (
    <MarkdownBenchPage
      directory={props.directory}
      path={props.path}
      initialFile={state.initialFile}
      placeholder={props.path === AGENTS_MD_PATH ? AGENTS_MD_PLACEHOLDER : undefined}
    />
  )
}
