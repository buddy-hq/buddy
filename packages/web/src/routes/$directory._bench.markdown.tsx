import { createFileRoute } from "@tanstack/react-router"
import { AlertCircleIcon, Loader2Icon } from "lucide-react"
import { BenchViewerShell } from "@/components/bench/bench-viewer-shell"
import { MarkdownBenchPage } from "@/components/bench/markdown-bench-page"
import { DirectoryInvalidNotebook } from "@/components/directory-chat/directory-invalid-notebook"
import { decodeDirectory } from "@/lib/directory-token"
import { fileExtensionFromPath } from "@/lib/workspace-file-paths"
import { readProjectExplorerEditableFile } from "@/state/chat-actions"

type MarkdownBenchSearch = {
  path?: string
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
    if (fileExtensionFromPath(deps.path) !== "md") {
      throw new Error("Only Markdown files can open on the Markdown Bench.")
    }
    const directory = decodeDirectory(params.directory)
    return readProjectExplorerEditableFile({
      directory,
      path: deps.path,
    })
  },
  pendingComponent: MarkdownBenchPending,
  errorComponent: MarkdownBenchError,
  component: MarkdownBenchRoute,
})

function MarkdownBenchPending() {
  return (
    <BenchViewerShell title="Loading Markdown">
      <div className="flex h-full items-center justify-center text-sm text-text-weak">
        <Loader2Icon className="mr-2 size-4 animate-spin" aria-hidden />
        Loading Markdown
      </div>
    </BenchViewerShell>
  )
}

function MarkdownBenchError() {
  return (
    <BenchViewerShell title="Markdown unavailable">
      <div className="flex h-full items-center justify-center p-6 text-sm text-icon-critical-base">
        <AlertCircleIcon className="mr-2 size-4" aria-hidden />
        Markdown could not be loaded.
      </div>
    </BenchViewerShell>
  )
}

function MarkdownBenchRoute() {
  const params = Route.useParams()
  const search = Route.useSearch()
  const initialFile = Route.useLoaderData()

  try {
    const directory = decodeDirectory(params.directory)
    if (!search.path) {
      return <MarkdownBenchError />
    }
    return <MarkdownBenchPage directory={directory} path={search.path} initialFile={initialFile} />
  } catch {
    return <DirectoryInvalidNotebook />
  }
}
