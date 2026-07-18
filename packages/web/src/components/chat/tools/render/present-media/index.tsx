import { useQueries } from "@tanstack/react-query"
import { ToolRow, ToolRowAction, ToolRowIcon } from "../../tool-row"
import { TextShimmer } from "../../text-shimmer"
import { ToolErrorPanel } from "../../tool-error-panel"
import {
  presentedMediaItemFromInlineItem,
  type MediaPresentationOutput,
  type PresentedMediaItem as PresentMediaItem,
} from "@/lib/presented-media"
import {
  PresentedMediaContent,
  ToolImageGallery,
  type PresentMediaResolvedItem,
  type ToolImageGalleryItem,
} from "@/components/media"
import type { ToolPartProps } from "../../registry"
import { readInlinePresentation, type BuddyPresentationDescriptor } from "../buddy-object-result"
import { useHydratedInlinePresentation } from "../use-hydrated-inline-presentation"
import { objectMediaAvailabilityQueryOptions } from "@/state/workspace-objects-query"
import type { ObjectMediaPresentationAvailabilityResponse } from "@buddy/sdk/types"
import type { MessagePart } from "@/state/chat-types"
import { parseToolState } from "../../parse-tool-state"
import { getToolInfoForPart } from "../../tool-info"
import { resolveAssetUrl } from "@/lib/resource-url"
import { BENCH_MODE_REQUEST_POLICY, useOpenBench, type BenchTarget } from "@/lib/bench-navigation"
import { stageMediaImageEdit } from "@/components/prompt/stage-media-image-edit"

function parseMediaPresentationOutput(
  presentation: BuddyPresentationDescriptor,
): MediaPresentationOutput | undefined {
  if (!presentation || presentation.data?.renderer !== "media-gallery") return undefined

  const items: PresentMediaItem[] = []
  for (const item of presentation.data.items) {
    const parsed = presentedMediaItemFromInlineItem(item)
    if (!parsed) return undefined
    items.push(parsed)
  }

  return {
    objectID: presentation.ref.objectID,
    kind: "media-presentation",
    layout: presentation.data.layout,
    items,
  }
}

function mergeResolvedPresentedMediaItem(
  item: PresentMediaItem,
  availability: ObjectMediaPresentationAvailabilityResponse | undefined,
): PresentMediaResolvedItem {
  return {
    ...item,
    availability: availability ?? item.availability,
    resolvedAvailability: availability ?? item.availability,
    availabilityChecked: availability !== undefined,
  }
}

function presentedMediaAvailabilityQuery(directory: string, objectID: string, itemID: string) {
  const options = objectMediaAvailabilityQueryOptions({
    directory,
    objectID,
    itemID,
  })

  return {
    queryKey: options.queryKey,
    queryFn: options.queryFn,
    staleTime: options.staleTime,
    retry: false,
    refetchOnWindowFocus: false,
  }
}

function usePresentedMediaAvailability(
  directory: string | undefined,
  objectID: string | undefined,
  items: PresentMediaItem[] | undefined,
): PresentMediaResolvedItem[] {
  const availabilityQueries = useQueries({
    queries:
      directory && objectID
        ? (items ?? []).map((item) => presentedMediaAvailabilityQuery(directory, objectID, item.id))
        : [],
  })

  return (items ?? []).map((item, index) =>
    mergeResolvedPresentedMediaItem(item, availabilityQueries[index]?.data),
  )
}

function groupedImagePlaceholder(part: MessagePart): ToolImageGalleryItem {
  const state = parseToolState(part)
  const title = getToolInfoForPart(part, state)?.title ?? "Image"
  return {
    id: part.id,
    src: null,
    alt: title,
    title,
  }
}

type GroupedImageSource =
  | { type: "placeholder"; item: ToolImageGalleryItem }
  | {
      type: "presented"
      partID: string
      ref: BuddyPresentationDescriptor["ref"]
      viewID: string
      item: PresentMediaItem
    }

function groupedImageSources(part: MessagePart): GroupedImageSource[] {
  const state = parseToolState(part)
  const presentation =
    state.status === "completed"
      ? readInlinePresentation(state.metadata, "media-gallery")
      : undefined
  if (!presentation || presentation.data?.renderer !== "media-gallery") {
    return [{ type: "placeholder", item: groupedImagePlaceholder(part) }]
  }

  const items = presentation.data.items.flatMap((item) => {
    const parsed = presentedMediaItemFromInlineItem(item)
    if (!parsed || parsed.mediaKind !== "image") return []

    return [
      {
        type: "presented" as const,
        partID: part.id,
        ref: presentation.ref,
        viewID: presentation.viewID,
        item: parsed,
      },
    ]
  })

  return items.length > 0
    ? items
    : [{ type: "placeholder", item: groupedImagePlaceholder(part) }]
}

function useGroupedImageItems(
  parts: readonly MessagePart[],
  directory: string | undefined,
): ToolImageGalleryItem[] {
  const sources = parts.flatMap(groupedImageSources)
  const presentedSources = sources.filter(
    (source): source is Extract<GroupedImageSource, { type: "presented" }> =>
      source.type === "presented",
  )
  const availabilityQueries = useQueries({
    queries: directory
      ? presentedSources.map((source) =>
          presentedMediaAvailabilityQuery(directory, source.ref.objectID, source.item.id),
        )
      : [],
  })
  let presentedIndex = 0

  return sources.map((source) => {
    if (source.type === "placeholder") return source.item

    const availability = availabilityQueries[presentedIndex]?.data
    presentedIndex += 1
    const item = mergeResolvedPresentedMediaItem(source.item, availability)
    const available = item.resolvedAvailability.status === "available"
    const benchTarget: BenchTarget = {
      type: "object",
      ref: {
        ...source.ref,
        itemID: item.id,
      },
      viewID: source.viewID,
    }

    return {
      id: `${source.partID}:${item.id}`,
      src: available && item.rawUrl ? resolveAssetUrl(item.rawUrl) : null,
      alt: item.fileName,
      title: item.fileName,
      localPath: available ? item.absolutePath : undefined,
      benchTarget,
    }
  })
}

function ImagegenGallery(props: {
  items: ToolImageGalleryItem[]
  directory?: string
  sessionID?: string
  canEditImages?: boolean
}) {
  const openBenchRoute = useOpenBench()
  const onEditItem =
    props.canEditImages && props.directory && props.sessionID
      ? async (item: ToolImageGalleryItem) => {
          const target = item.benchTarget
          if (
            target?.type !== "object" ||
            target.ref.kind !== "media-presentation" ||
            !target.ref.itemID ||
            !item.localPath ||
            !props.directory ||
            !props.sessionID
          ) {
            throw new Error("The image is unavailable for editing.")
          }
          await stageMediaImageEdit({
            directory: props.directory,
            sessionID: props.sessionID,
            objectID: target.ref.objectID,
            itemID: target.ref.itemID,
            fileName: item.title,
            localPath: item.localPath,
          })
        }
      : undefined

  return (
    <ToolImageGallery
      dialogDescription="Generated image preview"
      items={props.items}
      onEditItem={onEditItem}
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
  )
}

export function GroupedImagegenToolCard(props: {
  parts: MessagePart[]
  directory?: string
  canEditImages?: boolean
}) {
  const sessionID = props.parts[0]?.sessionID
  const items = useGroupedImageItems(props.parts, props.directory)
  return (
    <ImagegenGallery
      directory={props.directory}
      sessionID={sessionID}
      canEditImages={props.canEditImages}
      items={items}
    />
  )
}

function CompletedPresentMediaTool(props: {
  toolProps: ToolPartProps
  presentation: BuddyPresentationDescriptor
  directory: string
}) {
  const hydrated = useHydratedInlinePresentation({
    directory: props.directory,
    presentation: props.presentation,
  })
  const media = parseMediaPresentationOutput(hydrated.presentation)
  const resolvedItems = usePresentedMediaAvailability(
    props.directory,
    media?.objectID,
    media?.items,
  )

  if (!media) {
    return (
      <div className="flex flex-col gap-1.5">
        <ToolRow>
          <ToolRowIcon>{props.toolProps.icon?.("size-3.5")}</ToolRowIcon>
          <ToolRowAction>
            <TextShimmer text={props.toolProps.info.title} active={hydrated.isPending} />
          </ToolRowAction>
        </ToolRow>
        {hydrated.error ? <ToolErrorPanel error="Media presentation is unavailable." /> : null}
      </div>
    )
  }

  return (
    <PresentedMediaContent
      directory={props.directory}
      objectID={media.objectID}
      items={resolvedItems}
      onOpenResource={props.toolProps.onOpenResource}
      onEditImage={
        props.toolProps.canEditImages
          ? async (item) => {
              await stageMediaImageEdit({
                directory: props.directory,
                sessionID: props.toolProps.part.sessionID,
                objectID: media.objectID,
                itemID: item.id,
                fileName: item.fileName,
                localPath: item.absolutePath,
              })
            }
          : undefined
      }
    />
  )
}

function renderMediaTool(props: ToolPartProps, imageGeneration: boolean) {
  const output = props.state.output || (props.state.error ?? "")
  const showOutput = output.trim().length > 0
  const presentation =
    props.state.status === "completed"
      ? readInlinePresentation(props.state.metadata, "media-gallery")
      : undefined
  const running = props.state.status === "pending" || props.state.status === "running"

  if (imageGeneration && running) {
    return (
      <ImagegenGallery
        directory={props.directory}
        items={[
          {
            id: props.part.id,
            src: null,
            alt: props.info.title,
            title: props.info.title,
          },
        ]}
      />
    )
  }

  if (running || !presentation || !props.directory) {
    return (
      <div className="flex flex-col gap-1.5">
        <ToolRow>
          <ToolRowIcon>{props.icon?.("size-3.5")}</ToolRowIcon>
          <ToolRowAction>
            <TextShimmer text={props.info.title} active={running} />
          </ToolRowAction>
        </ToolRow>
        {props.state.status === "error" && showOutput ? <ToolErrorPanel error={output} /> : null}
      </div>
    )
  }

  return (
    <CompletedPresentMediaTool
      toolProps={props}
      presentation={presentation}
      directory={props.directory}
    />
  )
}

export function renderImageGenerationTool(props: ToolPartProps) {
  return renderMediaTool(props, true)
}

export function renderPresentMediaTool(props: ToolPartProps) {
  return renderMediaTool(props, false)
}
