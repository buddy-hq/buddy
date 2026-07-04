import { useQueries } from "@tanstack/react-query"
import { ToolRow, ToolRowAction, ToolRowIcon } from "../../tool-row"
import { TextShimmer } from "../../text-shimmer"
import { ToolErrorPanel } from "../../tool-error-panel"
import {
  presentedMediaItemFromInlineItem,
  type MediaPresentationOutput,
  type PresentedMediaItem as PresentMediaItem,
} from "@/lib/presented-media"
import { PresentedMediaContent, type PresentMediaResolvedItem } from "@/components/media"
import type { ToolPartProps } from "../../registry"
import { readInlinePresentation, type BuddyPresentationDescriptor } from "../buddy-object-result"
import { useHydratedInlinePresentation } from "../use-hydrated-inline-presentation"
import { objectMediaAvailabilityQueryOptions } from "@/state/workspace-objects-query"
import type { ObjectMediaPresentationAvailabilityResponse } from "@buddy/sdk/types"

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
    />
  )
}

export function renderPresentMediaTool(props: ToolPartProps) {
  const output = props.state.output || (props.state.error ?? "")
  const showOutput = output.trim().length > 0
  const presentation =
    props.state.status === "completed"
      ? readInlinePresentation(props.state.metadata, "media-gallery")
      : undefined
  const running = props.state.status === "pending" || props.state.status === "running"

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
