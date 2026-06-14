import { createFileRoute } from "@tanstack/react-router"
import { AlertCircleIcon, Loader2Icon } from "lucide-react"
import { BenchZoomableViewer } from "@/components/bench/bench-viewer-shell"
import { DirectoryInvalidNotebook } from "@/components/directory-chat/directory-invalid-notebook"
import { SvgArtifactBenchView } from "@/components/bench/svg-artifact-bench-view"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"
import { decodeDirectory } from "@/lib/directory-token"

export const Route = createFileRoute("/$directory/_bench/artifacts/freeform-figure/$artifactID")({
  loader: async ({ params }) => {
    const directory = decodeDirectory(params.directory)
    return requireBuddyData(
      await getBuddyClient(directory).freeformFigure.read({
        directory,
        artifactID: params.artifactID,
      }),
    )
  },
  pendingComponent: FreeformFigureBenchPending,
  errorComponent: FreeformFigureBenchError,
  component: FreeformFigureBenchRoute,
})

function FreeformFigureBenchPending() {
  return (
    <BenchZoomableViewer title="Loading figure">
      <div className="flex items-center justify-center rounded-xl border border-border-base bg-surface-base p-8 text-sm text-text-weak">
        <Loader2Icon className="mr-2 size-4 animate-spin" aria-hidden />
        Loading figure
      </div>
    </BenchZoomableViewer>
  )
}

function FreeformFigureBenchError() {
  return (
    <BenchZoomableViewer title="Figure unavailable">
      <div className="flex items-center justify-center rounded-xl border border-border-critical-base/40 bg-surface-critical-base/10 p-8 text-sm text-icon-critical-base">
        <AlertCircleIcon className="mr-2 size-4" aria-hidden />
        Figure could not be loaded.
      </div>
    </BenchZoomableViewer>
  )
}

function FreeformFigureBenchRoute() {
  const params = Route.useParams()
  const figure = Route.useLoaderData()

  try {
    decodeDirectory(params.directory)
    return (
      <SvgArtifactBenchView
        title={figure.title}
        subtitle={figure.description ?? figure.summary.caption ?? figure.summary.alt}
        rawUrl={figure.rawUrl}
      />
    )
  } catch {
    return <DirectoryInvalidNotebook />
  }
}
