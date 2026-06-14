import { createFileRoute } from "@tanstack/react-router"
import { AlertCircleIcon, Loader2Icon } from "lucide-react"
import { BenchViewerShell } from "@/components/bench/bench-viewer-shell"
import { DirectoryInvalidNotebook } from "@/components/directory-chat/directory-invalid-notebook"
import { MermaidDiagram } from "@/components/chat/tools/render/mermaid/mermaid-diagram"
import { readMermaidArtifact } from "@/components/chat/tools/render/mermaid/lib/persisted-renders"
import { decodeDirectory } from "@/lib/directory-token"

export const Route = createFileRoute("/$directory/_bench/artifacts/mermaid/$artifactID")({
  loader: async ({ params }) => {
    const directory = decodeDirectory(params.directory)
    return readMermaidArtifact(directory, params.artifactID)
  },
  pendingComponent: BenchArtifactPending,
  errorComponent: BenchArtifactError,
  component: MermaidBenchRoute,
})

function BenchArtifactPending() {
  return (
    <BenchViewerShell title="Loading diagram">
      <div className="flex h-full items-center justify-center text-sm text-text-weak">
        <Loader2Icon className="mr-2 size-4 animate-spin" aria-hidden />
        Loading diagram
      </div>
    </BenchViewerShell>
  )
}

function BenchArtifactError() {
  return (
    <BenchViewerShell title="Diagram unavailable">
      <div className="flex h-full items-center justify-center p-6 text-sm text-icon-critical-base">
        <AlertCircleIcon className="mr-2 size-4" aria-hidden />
        Diagram could not be loaded.
      </div>
    </BenchViewerShell>
  )
}

function MermaidBenchRoute() {
  const params = Route.useParams()
  const artifact = Route.useLoaderData()

  try {
    const directory = decodeDirectory(params.directory)
    return (
      <MermaidDiagram
        directory={directory}
        source={artifact.source}
        artifactID={artifact.artifactID}
        alt={artifact.alt}
        renderPriority={0}
        showRawSourceOnError
        hideFullscreenAction
        disableRevealAnimation
        viewportMode="bench"
        className="h-full min-h-0"
        renderWrapper={(diagramElement, actions) => (
          <BenchViewerShell
            title={artifact.alt}
            subtitle={artifact.diagramType}
            toolbar={actions}
            contentClassName="overflow-hidden"
          >
            <div className="h-full overflow-hidden bg-[linear-gradient(rgba(0,0,0,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.025)_1px,transparent_1px)] bg-[size:40px_40px] dark:bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)]">
              {diagramElement}
            </div>
          </BenchViewerShell>
        )}
      />
    )
  } catch {
    return <DirectoryInvalidNotebook />
  }
}
