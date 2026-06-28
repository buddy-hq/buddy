import { language } from "@/context/language"
import { resolveAssetUrl } from "@/lib/resource-url"
import type { ToolPartProps } from "../registry"
import type { MessagePart } from "@/state/chat-types"
import { parseToolState } from "../parse-tool-state"
import { getToolInfo } from "../tool-info"
import { ToolImageGallery, type ToolImageGalleryItem } from "./image-gallery"
import { BENCH_MODE_REQUEST_POLICY, useOpenBench } from "@/lib/bench-navigation"
import {
  metadataWithInlinePresentation,
  objectBenchTarget,
  readBuddyObjectResult,
  readInlinePresentation,
  type BuddyPresentationDescriptor,
} from "./buddy-object-result"
import { useHydratedInlinePresentation } from "./use-hydrated-inline-presentation"
import { InlineAssetBoundary } from "../../inline-asset-boundary"

type RenderFigureToolOutput = {
  kind: "figure" | "freeform-figure"
  objectID: string
  revisionID: string | null
  viewID: string
  url: string | null
  alt: string
  caption: string | null
}

export function parseRenderFigureOutput(
  state: ToolPartProps["state"],
): RenderFigureToolOutput | undefined {
  const result = readBuddyObjectResult(state.metadata)
  const presentation = result?.presentations.find(
    (entry) =>
      entry.surface === "inline" &&
      (entry.ref.kind === "figure" || entry.ref.kind === "freeform-figure") &&
      entry.data?.renderer === "figure",
  )
  if (!presentation || presentation.data?.renderer !== "figure") return undefined

  const summary = result?.objects.find(
    (object) =>
      object.kind === presentation.ref.kind && object.objectID === presentation.ref.objectID,
  )
  const kind = presentation.ref.kind
  if (kind !== "figure" && kind !== "freeform-figure") return undefined

  return {
    kind,
    objectID: presentation.ref.objectID,
    revisionID: presentation.ref.revisionID,
    viewID: presentation.viewID,
    url: presentation.data.svgUrl,
    alt: presentation.data.alt ?? summary?.title ?? "Figure",
    caption: presentation.data.caption,
  }
}

function figureGalleryItem(input: {
  id: string
  state: ToolPartProps["state"]
  fallbackTitle: string
  allowUnavailablePlaceholder?: boolean
}): ToolImageGalleryItem | undefined {
  const running = input.state.status === "pending" || input.state.status === "running"
  if (running) {
    return {
      id: input.id,
      src: null,
      alt: input.fallbackTitle,
      title: input.fallbackTitle,
    }
  }

  const renderFigure =
    input.state.status === "completed" ? parseRenderFigureOutput(input.state) : undefined
  if (!renderFigure) {
    if (input.allowUnavailablePlaceholder) {
      return {
        id: input.id,
        src: null,
        alt: input.fallbackTitle,
        title: input.fallbackTitle,
      }
    }
    return undefined
  }

  return {
    id: input.id,
    src: renderFigure.url ? resolveAssetUrl(renderFigure.url) : null,
    alt: renderFigure.alt,
    title: renderFigure.alt,
    caption: renderFigure.caption ?? renderFigure.alt,
    benchTarget: objectBenchTarget({
      kind: renderFigure.kind,
      objectID: renderFigure.objectID,
      viewID: renderFigure.viewID,
      revisionID: renderFigure.revisionID,
    }),
  }
}

function FigureGallery(props: { directory?: string; items: ToolImageGalleryItem[] }) {
  const openBenchRoute = useOpenBench()
  if (props.items.length === 0) {
    return (
      <div className="w-full rounded-xl border border-border-base/40 bg-surface-weak/30 p-4 text-center text-xs text-text-weak">
        {language.t("chatTools.info.figure")}
      </div>
    )
  }

  return (
    <InlineAssetBoundary
      className="w-full"
      fallback={
        <div className="h-[24rem] w-full rounded-xl border border-border-base/40 bg-surface-weak/30 p-4">
          <div className="h-full w-full animate-pulse rounded-lg bg-surface-weak/70" />
        </div>
      }
    >
      <ToolImageGallery
        dialogDescription="Figure preview"
        contentClassName="h-[24rem]"
        items={props.items}
        onOpenItem={
          props.directory
            ? (item) => {
                if (!item.benchTarget || !props.directory) return
                void openBenchRoute({
                  directory: props.directory,
                  target: item.benchTarget,
                  mode: BENCH_MODE_REQUEST_POLICY,
                  autoOpen: null,
                })
              }
            : undefined
        }
      />
    </InlineAssetBoundary>
  )
}

export function renderRenderFigureTool({ part, state, info, directory }: ToolPartProps) {
  const presentation =
    state.status === "completed" ? readInlinePresentation(state.metadata, "figure") : undefined
  if (presentation) {
    return (
      <HydratedFigureTool
        part={part}
        state={state}
        info={info}
        directory={directory}
        presentation={presentation}
      />
    )
  }
  const item = figureGalleryItem({
    id: part.id,
    state,
    fallbackTitle: info.title,
  })

  return <FigureGallery directory={directory} items={item ? [item] : []} />
}

function HydratedFigureTool(props: {
  part: ToolPartProps["part"]
  state: ToolPartProps["state"]
  info: ToolPartProps["info"]
  directory: string | undefined
  presentation: BuddyPresentationDescriptor
}) {
  const hydrated = useHydratedInlinePresentation({
    directory: props.directory,
    presentation: props.presentation,
  })
  const state = {
    ...props.state,
    metadata: metadataWithInlinePresentation(props.state.metadata, hydrated.presentation),
  }
  const item = figureGalleryItem({
    id: props.part.id,
    state,
    fallbackTitle: props.info.title,
    allowUnavailablePlaceholder: hydrated.isPending || hydrated.error !== null,
  })
  return <FigureGallery directory={props.directory} items={item ? [item] : []} />
}

export function GroupedFigureToolCard({
  parts,
  directory,
}: {
  parts: MessagePart[]
  directory?: string
}) {
  const items = parts
    .map((part) => {
      const state = parseToolState(part)
      const toolName =
        part.type === "tool" && typeof part.tool === "string" ? part.tool : "render_figure"
      return figureGalleryItem({
        id: part.id,
        state,
        fallbackTitle: getToolInfo(toolName, state).title,
        allowUnavailablePlaceholder: true,
      })
    })
    .filter((item): item is ToolImageGalleryItem => item !== undefined)

  return <FigureGallery directory={directory} items={items} />
}
