import { createFileRoute, useLocation } from "@tanstack/react-router"
import { AlertCircleIcon, Loader2Icon } from "lucide-react"
import { useMemo } from "react"
import {
  artifactRef,
  artifactTarget,
  routeString,
} from "@/components/bench/bench-context-utils"
import { useRegisterBenchContextProvider } from "@/components/bench/bench-route-context"
import { BenchStaticContextProvider } from "@/components/bench/bench-static-context-provider"
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
    <BenchStaticContextProvider
      status="loading"
      metadata={["surface_status: loading"]}
      content="Mermaid diagram is visible on Bench and loading."
      hints={["Try bench_read_context again after the diagram finishes loading."]}
    >
      <BenchViewerShell title="Loading diagram">
        <div className="flex h-full items-center justify-center text-sm text-text-weak">
          <Loader2Icon className="mr-2 size-4 animate-spin" aria-hidden />
          Loading diagram
        </div>
      </BenchViewerShell>
    </BenchStaticContextProvider>
  )
}

function BenchArtifactError() {
  return (
    <BenchStaticContextProvider
      status="error"
      metadata={["surface_status: error"]}
      content="Mermaid diagram is visible on Bench, but it could not be loaded."
      hints={["Check that the Mermaid artifact exists."]}
    >
      <BenchViewerShell title="Diagram unavailable">
        <div className="flex h-full items-center justify-center p-6 text-sm text-icon-critical-base">
          <AlertCircleIcon className="mr-2 size-4" aria-hidden />
          Diagram could not be loaded.
        </div>
      </BenchViewerShell>
    </BenchStaticContextProvider>
  )
}

function MermaidBenchRoute() {
  const params = Route.useParams()
  const artifact = Route.useLoaderData()

  try {
    const directory = decodeDirectory(params.directory)
    return (
      <MermaidBenchView
        directory={directory}
        artifact={artifact}
      />
    )
  } catch {
    return <DirectoryInvalidNotebook />
  }
}

function MermaidBenchView(props: {
  directory: string
  artifact: ReturnType<typeof Route.useLoaderData>
}) {
  const location = useLocation()
  const renderStatus = props.artifact.render?.status ?? "missing"
  const contextProvider = useMemo(
    () => ({
      read: () => ({
        status: "open" as const,
        target: artifactTarget({
          artifactKind: "mermaid",
          directory: props.directory,
          title: props.artifact.title,
          artifactID: props.artifact.artifactID,
          route: routeString({
            pathname: location.pathname,
            searchStr: location.searchStr,
          }),
          status: "ready",
        }),
        metadata: [
          `diagram_type: ${props.artifact.diagramType}`,
          `alt: ${props.artifact.alt}`,
          `source_hash: ${props.artifact.sourceHash}`,
          `render_status: ${renderStatus}`,
          `auto_repair_status: ${props.artifact.autoRepair.status}`,
          `preflight_repairs: ${props.artifact.preflightRepairs.length}`,
        ],
        content: [
          `Mermaid diagram: ${props.artifact.title}`,
          props.artifact.description ? `Description: ${props.artifact.description}` : undefined,
          props.artifact.caption ? `Caption: ${props.artifact.caption}` : undefined,
          props.artifact.render?.status === "failed"
            ? `Render error: ${props.artifact.render.errorMessage}`
            : undefined,
          "Source:",
          "```mermaid",
          props.artifact.source,
          "```",
        ]
          .filter((line): line is string => line !== undefined)
          .join("\n"),
        refs: [
          artifactRef({
            artifactID: props.artifact.artifactID,
            note: "Mermaid artifact on Bench.",
          }),
        ],
        hints: ["Mermaid source is the canonical inspectable content."],
      }),
    }),
    [location.pathname, location.searchStr, props.artifact, props.directory, renderStatus],
  )
  useRegisterBenchContextProvider(contextProvider)

  return (
      <MermaidDiagram
        directory={props.directory}
        source={props.artifact.source}
        artifactID={props.artifact.artifactID}
        alt={props.artifact.alt}
        renderPriority={0}
        showRawSourceOnError
        hideFullscreenAction
        disableRevealAnimation
        viewportMode="bench"
        className="h-full min-h-0"
        renderWrapper={(diagramElement, actions) => (
          <BenchViewerShell
            title={props.artifact.alt}
            subtitle={props.artifact.diagramType}
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
}
