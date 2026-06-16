import { createFileRoute, useLocation } from "@tanstack/react-router"
import { AlertCircleIcon, ClipboardCopyIcon, Loader2Icon, RefreshCwIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "@buddy/ui"
import {
  artifactRef,
  artifactTarget,
  routeString,
  urlRef,
} from "@/components/bench/bench-context-utils"
import { useRegisterBenchContextProvider } from "@/components/bench/bench-route-context"
import { BenchStaticContextProvider } from "@/components/bench/bench-static-context-provider"
import {
  BenchSurfaceViewer,
  type BenchViewerAction,
} from "@/components/bench/bench-viewer-shell"
import { suppressBenchAutoOpen } from "@/lib/bench-auto-open-state"
import {
  BENCH_AUTO_OPEN_POLICY_FULLSCREEN_HTML_WIDGET,
  htmlWidgetAutoOpenKey,
} from "@/components/bench/bench-open-policy"
import { DirectoryInvalidNotebook } from "@/components/directory-chat/directory-invalid-notebook"
import { HtmlWidgetFrame } from "@/components/chat/tools/render/html-widget"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"
import {
  formatHtmlWidgetViewport,
  htmlWidgetOutputFromArtifact,
  readHtmlWidgetSource,
} from "@/lib/html-widgets"
import { stringifyError } from "@/lib/api-client"
import { decodeDirectory } from "@/lib/directory-token"

export const Route = createFileRoute("/$directory/_bench/artifacts/html-widget/$artifactID")({
  loader: async ({ params }) => {
    const directory = decodeDirectory(params.directory)
    return requireBuddyData(
      await getBuddyClient(directory).htmlWidget.read({
        directory,
        artifactID: params.artifactID,
      }),
    )
  },
  pendingComponent: HtmlWidgetBenchPending,
  errorComponent: HtmlWidgetBenchError,
  component: HtmlWidgetBenchRoute,
})

function HtmlWidgetBenchPending() {
  return (
    <BenchStaticContextProvider
      status="loading"
      metadata={["surface_status: loading"]}
      content="HTML widget is visible on Bench and loading."
      hints={["Try bench_read_context again after the widget finishes loading."]}
    >
      <BenchSurfaceViewer title="Loading widget">
        <div className="flex h-full items-center justify-center text-sm text-text-weak">
          <Loader2Icon className="mr-2 size-4 animate-spin" aria-hidden />
          Loading widget
        </div>
      </BenchSurfaceViewer>
    </BenchStaticContextProvider>
  )
}

function HtmlWidgetBenchError() {
  return (
    <BenchStaticContextProvider
      status="error"
      metadata={["surface_status: error"]}
      content="HTML widget is visible on Bench, but it could not be loaded."
      hints={["Check that the HTML widget artifact exists."]}
    >
      <BenchSurfaceViewer title="Widget unavailable">
        <div className="flex h-full items-center justify-center p-6 text-sm text-icon-critical-base">
          <AlertCircleIcon className="mr-2 size-4" aria-hidden />
          Widget could not be loaded.
        </div>
      </BenchSurfaceViewer>
    </BenchStaticContextProvider>
  )
}

function HtmlWidgetBenchRoute() {
  const params = Route.useParams()
  const artifact = Route.useLoaderData()

  try {
    const directory = decodeDirectory(params.directory)
    return <HtmlWidgetBenchView directory={directory} artifact={artifact} />
  } catch {
    return <DirectoryInvalidNotebook />
  }
}

function HtmlWidgetBenchView(props: {
  directory: string
  artifact: ReturnType<typeof Route.useLoaderData>
}) {
  const location = useLocation()
  const [frameKey, setFrameKey] = useState(0)
  const [copying, setCopying] = useState(false)
  const widget = htmlWidgetOutputFromArtifact({
    directory: props.directory,
    artifact: props.artifact,
  })
  const contextProvider = useMemo(
    () => ({
      read: async () => {
        let source: string | undefined
        try {
          source = await readHtmlWidgetSource({
            directory: props.directory,
            artifactID: props.artifact.artifactID,
          })
        } catch {
          source = undefined
        }

        return {
          status: "open" as const,
          target: artifactTarget({
            artifactKind: "html-widget",
            directory: props.directory,
            title: widget.title,
            artifactID: widget.artifactID,
            route: routeString({
              pathname: location.pathname,
              searchStr: location.searchStr,
            }),
            status: "ready",
          }),
          metadata: [
            `viewport: ${formatHtmlWidgetViewport(widget.viewport)}`,
            `source_hash: ${widget.sourceHash}`,
            `source_path: ${widget.sourcePath ?? "none"}`,
            `warnings: ${widget.warnings.length}`,
            `runtime_url: ${widget.runtimeUrl}`,
            `source_url: ${widget.sourceUrl}`,
          ],
          content: [
            `HTML widget: ${widget.title}`,
            widget.description ? `Description: ${widget.description}` : undefined,
            widget.warnings.length > 0
              ? `Warnings:\n${widget.warnings.map((warning) => `- ${warning.code}: ${warning.message}`).join("\n")}`
              : "Warnings: none",
            source
              ? `Source HTML:\n\`\`\`html\n${source}\n\`\`\``
              : "Source HTML is not available in the current Bench snapshot.",
          ]
            .filter((line): line is string => line !== undefined)
            .join("\n\n"),
          refs: [
            artifactRef({
              artifactID: widget.artifactID,
              note: "HTML widget artifact on Bench.",
            }),
            ...urlRef({
              url: widget.runtimeUrl,
              note: "Widget runtime URL.",
            }),
            ...urlRef({
              url: widget.sourceUrl,
              note: "Widget source URL.",
            }),
          ],
          hints: [
            "Live iframe DOM state is unavailable unless a future frontend DOM snapshot provider is added.",
          ],
        }
      },
    }),
    [location.pathname, location.searchStr, props.artifact.artifactID, props.directory, widget],
  )
  useRegisterBenchContextProvider(contextProvider)

  useEffect(() => {
    const key = htmlWidgetAutoOpenKey(props.artifact.artifactID)
    return () => {
      suppressBenchAutoOpen(
        props.directory,
        BENCH_AUTO_OPEN_POLICY_FULLSCREEN_HTML_WIDGET,
        key,
      )
    }
  }, [props.artifact.artifactID, props.directory])

  const copySource = useCallback(async () => {
    setCopying(true)
    try {
      const source = await readHtmlWidgetSource({
        directory: props.directory,
        artifactID: props.artifact.artifactID,
      })
      await navigator.clipboard.writeText(source)
      toast("Widget source copied")
    } catch (error) {
      toast(stringifyError(error))
    } finally {
      setCopying(false)
    }
  }, [props.artifact.artifactID, props.directory])

  const actions = useMemo<BenchViewerAction[]>(
    () => [
      {
        label: "Reload widget",
        dataAction: "html-widget-reload",
        icon: <RefreshCwIcon className="size-4" aria-hidden />,
        onClick: () => setFrameKey((current) => current + 1),
      },
      {
        label: "Copy source",
        dataAction: "html-widget-copy-source",
        disabled: copying,
        icon: copying ? (
          <Loader2Icon className="size-4 animate-spin" aria-hidden />
        ) : (
          <ClipboardCopyIcon className="size-4" aria-hidden />
        ),
        onClick: () => {
          void copySource()
        },
      },
    ],
    [copySource, copying],
  )

  return (
    <BenchSurfaceViewer
      title={widget.title}
      subtitle={formatHtmlWidgetViewport(widget.viewport)}
      actions={actions}
      surfaceClassName="bg-background-base"
    >
      <HtmlWidgetFrame widget={widget} mode="bench" reloadKey={frameKey} />
    </BenchSurfaceViewer>
  )
}
