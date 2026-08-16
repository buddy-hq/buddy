import { useCallback, useState } from "react"
import { toast } from "@buddy/ui"
import {
  AppWindowIcon,
  ClipboardCopyIcon,
  ExternalLinkIcon,
  Loader2Icon,
  RefreshCwIcon,
} from "@/icons/app-icons"
import { ToolErrorPanel } from "../../tool-error-panel"
import { TextShimmer } from "../../text-shimmer"
import { ToolRow, ToolRowAction, ToolRowIcon } from "../../tool-row"
import {
  HTML_WIDGET_FALLBACK_VIEWPORT_PRESET,
  readHtmlWidgetSource,
  resolveHtmlWidgetViewport,
  type HtmlWidgetPresentation,
} from "@/lib/html-widgets"
import { stringifyError } from "@/lib/api-client"
import { BENCH_MODE_REQUEST_POLICY, useOpenBench } from "@/lib/bench-navigation"
import type { ToolPartProps } from "../../registry"
import type { TJsonObject } from "../../types"
import {
  presentationBenchTarget,
  readBuddyObjectResult,
  readInlinePresentation,
  type BuddyPresentationDescriptor,
} from "../buddy-object-result"
import { useHydratedInlinePresentation } from "../use-hydrated-inline-presentation"
import {
  HtmlWidgetFrame,
  HtmlWidgetFramePlaceholder,
  Media,
  type MediaAction,
} from "@/components/media"

function HtmlWidgetCard(props: {
  widget: HtmlWidgetPresentation
  presentation?: BuddyPresentationDescriptor
  directory?: string
  status?: ToolPartProps["state"]["status"]
  hideStatus?: boolean
}) {
  const openBenchRoute = useOpenBench()
  const [copying, setCopying] = useState(false)
  const [frameKey, setFrameKey] = useState(0)

  const copySource = useCallback(async () => {
    if (!props.directory) return

    setCopying(true)
    try {
      const source = await readHtmlWidgetSource({
        directory: props.directory,
        objectID: props.widget.objectID,
      })
      await navigator.clipboard.writeText(source)
      toast("Widget source copied")
    } catch (error) {
      toast(stringifyError(error))
    } finally {
      setCopying(false)
    }
  }, [props.directory, props.widget.objectID])

  const actions: MediaAction[] = [
    {
      id: "reload-widget",
      label: "Reload widget",
      icon: RefreshCwIcon,
      onSelect: () => setFrameKey((current) => current + 1),
    },
    ...(props.directory
      ? [
          {
            id: "copy-source",
            label: "Copy source",
            icon: copying ? Loader2Icon : ClipboardCopyIcon,
            disabled: copying,
            loading: copying,
            onSelect: () => void copySource(),
          },
          {
            id: "open-bench",
            label: "Open on Bench",
            icon: ExternalLinkIcon,
            onSelect: () => {
              if (!props.directory || !props.presentation) return
              void openBenchRoute({
                directory: props.directory,
                target: presentationBenchTarget(props.presentation),
                mode: BENCH_MODE_REQUEST_POLICY,
                autoOpen: null,
              })
            },
          },
        ]
      : []),
  ]

  return (
    <Media
      item={{
        kind: "html",
        state: {
          status: "ready",
          data: {
            widget: props.widget,
            reloadKey: frameKey,
          },
        },
      }}
      fit="content"
      actions={actions}
    />
  )
}

function readHtmlWidgetPresentation(
  metadata: TJsonObject,
  presentation: BuddyPresentationDescriptor,
):
  | {
      widget: HtmlWidgetPresentation
      presentation: BuddyPresentationDescriptor
    }
  | undefined {
  const result = readBuddyObjectResult(metadata)
  if (!result || !presentation || presentation.data?.renderer !== "html-widget") {
    return undefined
  }

  const viewport = resolveHtmlWidgetViewport(presentation.data.viewportPreset)
  if (!viewport) return undefined

  const summary = result.objects.find(
    (object) =>
      object.kind === presentation.ref.kind && object.objectID === presentation.ref.objectID,
  )

  return {
    presentation,
    widget: {
      objectID: presentation.ref.objectID,
      kind: "html-widget",
      title: summary?.title ?? "HTML widget",
      sourceRoot: presentation.data.sourceRoot,
      entryPath: presentation.data.entryPath,
      sourceVersion: presentation.data.sourceVersion,
      viewport,
      runtimeUrl: presentation.data.runtimeUrl,
    },
  }
}

function CompletedHtmlWidgetTool(props: {
  toolProps: ToolPartProps
  presentation: BuddyPresentationDescriptor
}) {
  const hydrated = useHydratedInlinePresentation({
    directory: props.toolProps.directory,
    presentation: props.presentation,
    alwaysHydrate: true,
  })
  const renderedWidget = readHtmlWidgetPresentation(
    props.toolProps.state.metadata,
    hydrated.presentation,
  )

  if (!renderedWidget) {
    // Hold the widget's box while its descriptor loads. Collapsing to a status
    // row and expanding to the frame afterwards moves the whole transcript below
    // it, twice.
    //
    // `isPending` is true only while `presentation.data` is still null, which is
    // exactly when the preset is unknown — so this reserves the fallback box
    // rather than the real one. That leaves a bounded aspect correction instead
    // of the full collapse-and-expand.
    if (hydrated.isPending) {
      const viewport = resolveHtmlWidgetViewport(HTML_WIDGET_FALLBACK_VIEWPORT_PRESET)

      // Same outer shape as the resolved card below: the frame only, no status
      // row. A status row that disappears on hydration is its own shift.
      return <HtmlWidgetFramePlaceholder viewport={viewport} />
    }

    return (
      <div className="flex flex-col gap-1.5">
        <ToolRow>
          <ToolRowIcon>
            {props.toolProps.icon?.("size-3.5") ?? <AppWindowIcon className="size-3.5" />}
          </ToolRowIcon>
          <ToolRowAction>{props.toolProps.info.title}</ToolRowAction>
        </ToolRow>
        {hydrated.error ? <ToolErrorPanel error="HTML widget is unavailable." /> : null}
      </div>
    )
  }

  return (
    <HtmlWidgetCard
      widget={renderedWidget.widget}
      presentation={renderedWidget.presentation}
      directory={props.toolProps.directory}
      status={props.toolProps.state.status}
      hideStatus
    />
  )
}

export function renderPresentHtmlWidgetTool(props: ToolPartProps) {
  const output = props.state.output || (props.state.error ?? "")
  const showOutput = output.trim().length > 0
  const running = props.state.status === "pending" || props.state.status === "running"
  const presentation =
    props.state.status === "completed"
      ? readInlinePresentation(props.state.metadata, "html-widget")
      : undefined

  if (running || !presentation) {
    return (
      <div className="flex flex-col gap-1.5">
        <ToolRow>
          <ToolRowIcon>
            {props.icon?.("size-3.5") ?? <AppWindowIcon className="size-3.5" />}
          </ToolRowIcon>
          <ToolRowAction>
            <TextShimmer text={props.info.title} active={running} />
          </ToolRowAction>
        </ToolRow>
        {props.state.status === "error" && showOutput ? <ToolErrorPanel error={output} /> : null}
      </div>
    )
  }

  return <CompletedHtmlWidgetTool toolProps={props} presentation={presentation} />
}

export { HtmlWidgetCard, HtmlWidgetFrame }
