import { useQuery } from "@tanstack/react-query"
import { AlertCircleIcon } from "@/icons/app-icons"
import { useState } from "react"
import { BenchViewerShell } from "@/components/bench/bench-viewer-shell"
import { BenchStaticContextProvider } from "@/components/bench/bench-static-context-provider"
import { BenchSurfacePending } from "@/components/bench/bench-surface-pending"
import { MarkdownBenchPage } from "@/components/bench/markdown-bench-page"
import { DirectoryInvalidNotebook } from "@/components/directory-chat/directory-invalid-notebook"
import { workspaceFileInstanceKey } from "@/lib/workspace-file-paths"
import {
  markdownBenchApprovedFileQueryOptions,
  markdownBenchFileQueryOptions,
  type MarkdownBenchFileData,
} from "@/state/bench-surface-query"
import { WorkspaceFileLargeWarning } from "@/components/files/workspace-file-actions"
import { consumeWorkspaceFileLargeOpenApproval } from "@/state/workspace-file-open-dialog-store"

const AGENTS_MD_PATH = "AGENTS.md"
const AGENTS_MD_PLACEHOLDER = "Set rules and customize how Buddy responds in this notebook."

function MarkdownBenchPending() {
  return (
    <BenchStaticContextProvider
      status="loading"
      metadata={["surface_status: loading"]}
      content="Markdown Bench is visible and loading the requested file."
      hints={["Try bench_read_context again after Markdown finishes loading."]}
    >
      <BenchSurfacePending />
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

export function MarkdownBenchSurface(props: {
  directory: string
  path: string
  fragment?: string
}) {
  const fileQuery = useQuery(
    markdownBenchFileQueryOptions({ directory: props.directory, path: props.path }),
  )

  if (!props.directory) return <DirectoryInvalidNotebook />
  if (!props.path) return <MarkdownBenchError />
  if (fileQuery.isPending) return <MarkdownBenchPending />
  if (fileQuery.isError || !fileQuery.data) return <MarkdownBenchError />

  return (
    <LargeMarkdownBenchGate
      key={workspaceFileInstanceKey({ directory: props.directory, path: props.path })}
      directory={props.directory}
      fragment={props.fragment}
      path={props.path}
      fileData={fileQuery.data}
    />
  )
}

function LargeMarkdownBenchGate(props: {
  directory: string
  fragment: string | undefined
  path: string
  fileData: MarkdownBenchFileData
}) {
  // Approval is a per-open user decision, so it is consumed here rather than inside the cached
  // query: the query only reports that the file is over the limit.
  const [approved, setApproved] = useState(() =>
    consumeWorkspaceFileLargeOpenApproval(props.directory, props.path),
  )

  if (props.fileData.status === "ready") {
    return (
      <MarkdownBenchPage
        directory={props.directory}
        fragment={props.fragment}
        path={props.path}
        initialFile={props.fileData.initialFile}
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
          `size_bytes: ${props.fileData.sizeBytes}`,
          "large_file_approved: false",
        ]}
        content={`A large-file warning is visible for ${props.path}. The Markdown file has not been opened yet.`}
        hints={["The user can choose Open anyway or use an external file action."]}
      >
        <WorkspaceFileLargeWarning
          directory={props.directory}
          path={props.path}
          sizeBytes={props.fileData.sizeBytes}
          onOpenAnyway={() => setApproved(true)}
        />
      </BenchStaticContextProvider>
    )
  }

  return (
    <ApprovedMarkdownBenchLoader
      directory={props.directory}
      fragment={props.fragment}
      path={props.path}
    />
  )
}

function ApprovedMarkdownBenchLoader(props: {
  directory: string
  fragment: string | undefined
  path: string
}) {
  const approvedFileQuery = useQuery(
    markdownBenchApprovedFileQueryOptions({ directory: props.directory, path: props.path }),
  )

  if (approvedFileQuery.isPending) return <MarkdownBenchPending />
  if (approvedFileQuery.isError || !approvedFileQuery.data) return <MarkdownBenchError />

  return (
    <MarkdownBenchPage
      directory={props.directory}
      fragment={props.fragment}
      path={props.path}
      initialFile={approvedFileQuery.data}
      placeholder={props.path === AGENTS_MD_PATH ? AGENTS_MD_PLACEHOLDER : undefined}
    />
  )
}
