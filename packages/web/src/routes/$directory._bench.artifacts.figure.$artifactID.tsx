import { createFileRoute, useLocation } from "@tanstack/react-router"
import { AlertCircleIcon, Loader2Icon } from "lucide-react"
import { useMemo } from "react"
import {
  artifactRef,
  artifactTarget,
  routeString,
  urlRef,
} from "@/components/bench/bench-context-utils"
import { useRegisterBenchContextProvider } from "@/components/bench/bench-route-context"
import { BenchStaticContextProvider } from "@/components/bench/bench-static-context-provider"
import { BenchZoomableViewer } from "@/components/bench/bench-viewer-shell"
import { DirectoryInvalidNotebook } from "@/components/directory-chat/directory-invalid-notebook"
import { SvgArtifactBenchView } from "@/components/bench/svg-artifact-bench-view"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"
import { decodeDirectory } from "@/lib/directory-token"

export const Route = createFileRoute("/$directory/_bench/artifacts/figure/$artifactID")({
  loader: async ({ params }) => {
    const directory = decodeDirectory(params.directory)
    return requireBuddyData(
      await getBuddyClient(directory).figure.read({
        directory,
        artifactID: params.artifactID,
      }),
    )
  },
  pendingComponent: FigureBenchPending,
  errorComponent: FigureBenchError,
  component: FigureBenchRoute,
})

function FigureBenchPending() {
  return (
    <BenchStaticContextProvider
      status="loading"
      metadata={["surface_status: loading"]}
      content="Figure is visible on Bench and loading."
      hints={["Try bench_read_context again after the figure finishes loading."]}
    >
      <BenchZoomableViewer title="Loading figure">
        <div className="flex items-center justify-center rounded-xl border border-border-base bg-surface-base p-8 text-sm text-text-weak">
          <Loader2Icon className="mr-2 size-4 animate-spin" aria-hidden />
          Loading figure
        </div>
      </BenchZoomableViewer>
    </BenchStaticContextProvider>
  )
}

function FigureBenchError() {
  return (
    <BenchStaticContextProvider
      status="error"
      metadata={["surface_status: error"]}
      content="Figure is visible on Bench, but it could not be loaded."
      hints={["Check that the figure artifact exists."]}
    >
      <BenchZoomableViewer title="Figure unavailable">
        <div className="flex items-center justify-center rounded-xl border border-border-critical-base/40 bg-surface-critical-base/10 p-8 text-sm text-icon-critical-base">
          <AlertCircleIcon className="mr-2 size-4" aria-hidden />
          Figure could not be loaded.
        </div>
      </BenchZoomableViewer>
    </BenchStaticContextProvider>
  )
}

function FigureBenchRoute() {
  const params = Route.useParams()
  const figure = Route.useLoaderData()

  try {
    const directory = decodeDirectory(params.directory)
    return <FigureBenchView directory={directory} figure={figure} />
  } catch {
    return <DirectoryInvalidNotebook />
  }
}

function FigureBenchView(props: {
  directory: string
  figure: ReturnType<typeof Route.useLoaderData>
}) {
  const location = useLocation()
  const subtitle =
    props.figure.description ?? props.figure.summary.caption ?? props.figure.summary.alt
  const contextProvider = useMemo(
    () => ({
      read: () => ({
        status: "open" as const,
        target: artifactTarget({
          artifactKind: "figure",
          directory: props.directory,
          title: props.figure.title,
          artifactID: props.figure.artifactID,
          route: routeString({
            pathname: location.pathname,
            searchStr: location.searchStr,
          }),
          status: "ready",
        }),
        metadata: [
          `mime_type: ${props.figure.summary.mime}`,
          `alt: ${props.figure.summary.alt}`,
          `caption: ${props.figure.summary.caption ?? "none"}`,
          `raw_url: ${props.figure.rawUrl}`,
          `source_hash: ${props.figure.sourceHash}`,
          `repair_attempts: ${props.figure.summary.repairAttempts}`,
        ],
        content: [
          `Figure: ${props.figure.title}`,
          props.figure.description ? `Description: ${props.figure.description}` : undefined,
          `Alt: ${props.figure.summary.alt}`,
          props.figure.summary.caption ? `Caption: ${props.figure.summary.caption}` : undefined,
        ]
          .filter((line): line is string => line !== undefined)
          .join("\n"),
        refs: [
          artifactRef({
            artifactID: props.figure.artifactID,
            note: "Figure artifact on Bench.",
          }),
          ...urlRef({
            url: props.figure.rawUrl,
            note: "Raw SVG URL.",
          }),
        ],
        hints: ["Use the raw SVG URL or artifact read path when exact visual source is needed."],
      }),
    }),
    [location.pathname, location.searchStr, props.directory, props.figure],
  )
  useRegisterBenchContextProvider(contextProvider)

  return (
    <SvgArtifactBenchView
      title={props.figure.title}
      subtitle={subtitle}
      rawUrl={props.figure.rawUrl}
    />
  )
}
