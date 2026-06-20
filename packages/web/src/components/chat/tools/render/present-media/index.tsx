import { useCallback, useMemo, useState } from "react"
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Table,
  TableBody,
  TableCell,
  TableRow,
  cn,
  toast,
} from "@buddy/ui"
import {
  BookOpenIcon,
  CopyIcon,
  EllipsisIcon,
  ExternalLinkIcon,
  FileTextIcon,
  FolderOpenIcon,
  Loader2Icon,
  Music2Icon,
  RefreshCwIcon,
  VideoIcon,
} from "lucide-react"
import { ToolRow, ToolRowIcon, ToolRowAction } from "../../tool-row"
import { TextShimmer } from "../../text-shimmer"
import { ToolErrorPanel } from "../../tool-error-panel"
import { FileTypeIcon } from "@/components/files/file-type-icon"
import {
  MAX_INLINE_PRESENTED_MEDIA_BYTES,
  buildPresentedMediaFileActionInput,
  isPresentedMediaOutsideNotebook,
  presentedMediaItemFromInlineItem,
  type MediaPresentationOutput,
  type PresentedMediaItem as PresentMediaItem,
} from "@/lib/presented-media"
import { resolveAssetUrl } from "@/lib/resource-url"
import { usePlatform } from "@/context/platform"
import { useWorkspaceFileOpen, type WorkspaceFileActionInput } from "@/lib/use-workspace-file-open"
import { BENCH_MODE_REQUEST_POLICY, useOpenBench } from "@/lib/bench-navigation"
import {
  WORKSPACE_FILE_OPEN_TARGET_DEFAULT_APP,
  WORKSPACE_FILE_OPEN_TARGET_FILE_BENCH,
  WORKSPACE_FILE_OPEN_TARGET_MARKDOWN_BENCH,
  WORKSPACE_FILE_OPEN_TARGET_READING,
  WORKSPACE_FILE_OPEN_TARGET_REVEAL,
  type WorkspaceFileOpenTarget,
} from "@/lib/workspace-file-open"
import { normalizeRelativePath } from "@/lib/workspace-file-paths"
import { addResource, rebuildResource } from "@/state/resource-actions"
import { usePresentedMediaPlaybackStore } from "@/state/presented-media-playback-store"
import {
  invalidateResourcesQueries,
  resourcesQueryOptions,
  type ResourceListItem,
} from "@/state/resources-query"
import { ToolImageGallery } from "../image-gallery"
import { MultiViewShell } from "../../multi-view-shell"
import { PresentedMediaPlayer } from "./media-player"
import type { PresentMediaResolvedItem } from "./types"
import type { ToolPartProps } from "../../registry"
import {
  objectBenchTarget,
  readInlinePresentation,
  type BuddyPresentationDescriptor,
} from "../buddy-object-result"
import { useHydratedInlinePresentation } from "../use-hydrated-inline-presentation"
import { objectMediaAvailabilityQueryOptions } from "@/state/workspace-objects-query"
import type { ObjectMediaPresentationAvailabilityResponse } from "@buddy/sdk/types"

// ---------------------------------------------------------------------------
// Data hooks
// ---------------------------------------------------------------------------

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

function resolvePresentedMediaStreamUrl(item: PresentMediaResolvedItem): string | null {
  if (!item.rawUrl) return null
  return resolveAssetUrl(item.rawUrl)
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

function presentedMediaAvailabilityQuery(
  directory: string,
  objectID: string,
  itemID: string,
) {
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
) {
  const availabilityQueries = useQueries({
    queries:
      directory && objectID
        ? (items ?? []).map((item) =>
            presentedMediaAvailabilityQuery(directory, objectID, item.id),
          )
        : [],
  })

  return (items ?? []).map((item, index) =>
    mergeResolvedPresentedMediaItem(item, availabilityQueries[index]?.data),
  )
}

function MediaFileIcon(props: { item: PresentMediaResolvedItem; className?: string }) {
  return (
    <div className={props.className ?? "h-8 w-[26.6px] shrink-0"}>
      <FileTypeIcon
        fileName={props.item.fileName}
        mediaKind={props.item.mediaKind}
        className="h-full w-full object-contain"
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Clickable file row with right-click context menu
// ---------------------------------------------------------------------------

function fileOpenTargetLabel(target: WorkspaceFileOpenTarget, revealLabel: string) {
  if (target === WORKSPACE_FILE_OPEN_TARGET_READING) return "Open file"
  if (target === WORKSPACE_FILE_OPEN_TARGET_MARKDOWN_BENCH) return "Open file"
  if (target === WORKSPACE_FILE_OPEN_TARGET_FILE_BENCH) return "Open file"
  if (target === WORKSPACE_FILE_OPEN_TARGET_DEFAULT_APP) return "Open in default app"
  if (target === WORKSPACE_FILE_OPEN_TARGET_REVEAL) return revealLabel
  return "Copy path"
}

function FileOpenTargetIcon(props: { target: WorkspaceFileOpenTarget }) {
  if (props.target === WORKSPACE_FILE_OPEN_TARGET_READING) return <BookOpenIcon aria-hidden />
  if (props.target === WORKSPACE_FILE_OPEN_TARGET_MARKDOWN_BENCH) {
    return <FileTextIcon aria-hidden />
  }
  if (props.target === WORKSPACE_FILE_OPEN_TARGET_FILE_BENCH) {
    return <FolderOpenIcon aria-hidden />
  }
  if (props.target === WORKSPACE_FILE_OPEN_TARGET_DEFAULT_APP) {
    return <ExternalLinkIcon aria-hidden />
  }
  if (props.target === WORKSPACE_FILE_OPEN_TARGET_REVEAL) return <FolderOpenIcon aria-hidden />
  return <CopyIcon aria-hidden />
}

function resourceProcessLabel(resource: ResourceListItem | undefined) {
  if (!resource) return "Process for Buddy"
  if (resource.status === "preparing") return "Processing..."
  if (resource.status === "stale") return "Reprocess for Buddy"
  if (resource.status === "error" || resource.status === "unprocessed") {
    return "Process for Buddy"
  }
  return undefined
}

function fileRowStatusLabel(input: {
  item: PresentMediaResolvedItem
  isMissing: boolean
  primaryTarget: WorkspaceFileOpenTarget | undefined
  revealLabel: string
}) {
  if (input.isMissing) return "File unavailable"
  if (!input.primaryTarget) return "No open action available"
  const targetLabel = fileOpenTargetLabel(input.primaryTarget, input.revealLabel)
  if (
    input.primaryTarget === WORKSPACE_FILE_OPEN_TARGET_DEFAULT_APP &&
    isPresentedMediaOutsideNotebook(input.item)
  ) {
    return `Outside notebook · ${targetLabel}`
  }
  return targetLabel
}

function MediaFileRow(props: {
  directory: string
  item: PresentMediaResolvedItem
  onOpenResource: ToolPartProps["onOpenResource"]
  resource?: ResourceListItem
  resourceProcessingReady: boolean
  onProcessResource?: (resource: ResourceListItem | undefined, path: string) => Promise<void>
}) {
  const platform = usePlatform()
  const [processing, setProcessing] = useState(false)
  const onProcessResource = props.onProcessResource
  const { resolvePlan, executeTarget, executePrimary } = useWorkspaceFileOpen(
    props.directory,
    props.onOpenResource,
  )
  const actionInput = useMemo<WorkspaceFileActionInput>(
    () => ({
      ...buildPresentedMediaFileActionInput({
        item: {
          ...props.item,
          availability: props.item.resolvedAvailability,
        },
        canOpenDefaultApp: !!platform.openPath,
        canReveal: !!platform.revealPath,
      }),
      ...(props.resource?.objectID ? { objectID: props.resource.objectID } : {}),
      ...(props.resource?.status ? { resourceStatus: props.resource.status } : {}),
    }),
    [platform.openPath, platform.revealPath, props.item, props.resource],
  )
  const plan = resolvePlan(actionInput)
  const primaryTarget = plan.primaryTarget
  const isMissing = props.item.resolvedAvailability.status === "missing"
  const revealLabel = platform.os === "macos" ? "Reveal in Finder" : "Reveal in File Explorer"
  const processLabel =
    props.resourceProcessingReady && props.item.mediaKind === "pdf" && props.item.workspacePath
      ? resourceProcessLabel(props.resource)
      : undefined

  const runTarget = useCallback(
    (target: WorkspaceFileOpenTarget) => {
      void executeTarget(actionInput, target).catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : String(error))
      })
    },
    [actionInput, executeTarget],
  )

  const processResource = useCallback(() => {
    if (!props.item.workspacePath || !onProcessResource || processing) return
    setProcessing(true)
    void onProcessResource(props.resource, props.item.workspacePath)
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : String(error))
      })
      .finally(() => setProcessing(false))
  }, [onProcessResource, processing, props.item.workspacePath, props.resource])

  return (
    <TableRow
      onClick={() => {
        if (!primaryTarget) return
        void executePrimary(actionInput).catch((error: unknown) => {
          toast.error(error instanceof Error ? error.message : String(error))
        })
      }}
      className={cn(
        "border-none transition-colors hover:bg-surface-base",
        primaryTarget ? "cursor-pointer" : "cursor-default",
        isMissing && "opacity-50",
      )}
    >
      <TableCell className="w-10 px-2 py-1.5">
        <MediaFileIcon item={props.item} />
      </TableCell>
      <TableCell className="min-w-0 max-w-xs px-2 py-1.5">
        <p className="truncate text-sm font-medium text-text-base">{props.item.fileName}</p>
        <p className="mt-0.5 truncate text-[11px] text-text-weak">
          {fileRowStatusLabel({
            item: props.item,
            isMissing,
            primaryTarget,
            revealLabel,
          })}
        </p>
      </TableCell>
      {processLabel ? (
        <TableCell className="w-36 px-2 py-1.5 text-right">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={processing || props.resource?.status === "preparing"}
            onClick={(event) => {
              event.stopPropagation()
              processResource()
            }}
          >
            {processing || props.resource?.status === "preparing" ? (
              <Loader2Icon className="animate-spin" aria-hidden />
            ) : (
              <RefreshCwIcon aria-hidden />
            )}
            {processLabel}
          </Button>
        </TableCell>
      ) : null}
      <TableCell className="w-10 px-2 py-1.5 text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`File actions for ${props.item.fileName}`}
              onClick={(event) => event.stopPropagation()}
            >
              <EllipsisIcon aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {plan.targets.map((target) => (
              <DropdownMenuItem key={target} onSelect={() => runTarget(target)}>
                <FileOpenTargetIcon target={target} />
                {fileOpenTargetLabel(target, revealLabel)}
              </DropdownMenuItem>
            ))}
            {processLabel ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={processing || props.resource?.status === "preparing"}
                  onSelect={processResource}
                >
                  {processing || props.resource?.status === "preparing" ? (
                    <Loader2Icon className="animate-spin" aria-hidden />
                  ) : (
                    <RefreshCwIcon aria-hidden />
                  )}
                  {processLabel}
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  )
}

// ---------------------------------------------------------------------------
// Image gallery — main+strip layout with zoom dialog
// ---------------------------------------------------------------------------

type MediaInteractionProps = {
  directory: string
  onOpenResource: ToolPartProps["onOpenResource"]
  onProcessResource: (resource: ResourceListItem | undefined, path: string) => Promise<void>
  resourceProcessingReady: boolean
  resourceByPath: Map<string, ResourceListItem>
}

function MediaImageGallery(
  props: MediaInteractionProps & { objectID: string; items: PresentMediaResolvedItem[] },
) {
  const openBenchRoute = useOpenBench()
  const previewable = props.items.filter(
    (i) =>
      i.mediaKind === "image" &&
      i.resolvedAvailability.status === "available" &&
      (typeof i.sizeBytes !== "number" || i.sizeBytes <= MAX_INLINE_PRESENTED_MEDIA_BYTES),
  )
  const fallbackFiles = props.items.filter(
    (i) => !previewable.some((candidate) => candidate.id === i.id),
  )

  const fallback =
    fallbackFiles.length > 0 ? (
      <Table>
        <TableBody>
          {fallbackFiles.map((item) => (
            <MediaFileRow
              key={`image-file-${item.id}`}
              directory={props.directory}
              item={item}
              onOpenResource={props.onOpenResource}
              onProcessResource={props.onProcessResource}
              resourceProcessingReady={props.resourceProcessingReady}
              resource={
                item.workspacePath
                  ? props.resourceByPath.get(normalizeRelativePath(item.workspacePath))
                  : undefined
              }
            />
          ))}
        </TableBody>
      </Table>
    ) : undefined

  return (
    <ToolImageGallery
      dialogDescription="Media gallery preview"
      fallback={fallback}
      items={previewable.map((item) => ({
        id: item.id,
        src: resolvePresentedMediaStreamUrl(item),
        alt: item.fileName,
        title: item.fileName,
        benchTarget: objectBenchTarget({
          kind: "media-presentation",
          objectID: props.objectID,
          viewID: "gallery",
          itemID: item.id,
        }),
      }))}
      onOpenItem={(item) => {
        if (!item.benchTarget) return
        void openBenchRoute({
          directory: props.directory,
          target: item.benchTarget,
          mode: BENCH_MODE_REQUEST_POLICY,
          autoOpen: null,
        })
      }}
    />
  )
}

function MediaPlayerFallback(props: MediaInteractionProps & { item: PresentMediaResolvedItem }) {
  return (
    <Table>
      <TableBody>
        <MediaFileRow
          directory={props.directory}
          item={props.item}
          onOpenResource={props.onOpenResource}
          onProcessResource={props.onProcessResource}
          resourceProcessingReady={props.resourceProcessingReady}
          resource={
            props.item.workspacePath
              ? props.resourceByPath.get(normalizeRelativePath(props.item.workspacePath))
              : undefined
          }
        />
      </TableBody>
    </Table>
  )
}

function MediaPlayerCollection(
  props: MediaInteractionProps & {
    objectID: string
    items: PresentMediaResolvedItem[]
  },
) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const pausePlayback = usePresentedMediaPlaybackStore((state) => state.pausePlayback)
  const playingKey = usePresentedMediaPlaybackStore((state) => state.playingKey)

  const selectItem = useCallback(
    (index: number) => {
      setSelectedIndex(index)
      const item = props.items[index]
      if (!item) return
      const selectedPlaybackKey = `${props.objectID}:${item.id}`
      if (
        playingKey &&
        playingKey.startsWith(`${props.objectID}:`) &&
        playingKey !== selectedPlaybackKey
      ) {
        pausePlayback(playingKey)
      }
    },
    [pausePlayback, playingKey, props.items, props.objectID],
  )

  const playerForItem = (item: PresentMediaResolvedItem, index: number, compact?: boolean) => (
    <PresentedMediaPlayer
      item={item}
      playbackKey={`${props.objectID}:${item.id}`}
      compact={compact}
      shouldLoad={props.items.length === 1 || index === selectedIndex}
      fallback={<MediaPlayerFallback {...props} item={item} />}
    />
  )

  if (props.items.length === 1) {
    const item = props.items[0]
    return item ? playerForItem(item, 0) : null
  }

  return (
    <MultiViewShell
      contentClassName="min-h-64"
      onItemSelect={selectItem}
      items={props.items.map((item, index) => ({
        key: item.id,
        thumbnail: (
          <div className="flex size-full items-center justify-center bg-surface-raised-base">
            {item.mediaKind === "video" ? (
              <VideoIcon className="size-5 text-text-weak" aria-hidden />
            ) : (
              <Music2Icon className="size-5 text-text-weak" aria-hidden />
            )}
          </div>
        ),
        children: <div className="w-full">{playerForItem(item, index, true)}</div>,
      }))}
    />
  )
}

function PresentedMediaContent(props: {
  directory: string
  objectID: string
  items: PresentMediaResolvedItem[]
  onOpenResource: ToolPartProps["onOpenResource"]
}) {
  const queryClient = useQueryClient()
  const images = props.items.filter((i) => i.mediaKind === "image")
  const videos = props.items.filter((i) => i.mediaKind === "video")
  const audios = props.items.filter((i) => i.mediaKind === "audio")
  const files = props.items.filter(
    (i) => i.mediaKind !== "image" && i.mediaKind !== "audio" && i.mediaKind !== "video",
  )
  const hasWorkspacePdf = files.some((item) => item.mediaKind === "pdf" && item.workspacePath)
  const resourcesQuery = useQuery({
    ...resourcesQueryOptions(props.directory),
    enabled: hasWorkspacePdf,
  })
  const resourceByPath = useMemo(
    () =>
      new Map(
        (resourcesQuery.data?.items ?? []).map((resource) => [
          normalizeRelativePath(resource.path),
          resource,
        ]),
      ),
    [resourcesQuery.data?.items],
  )
  const resourceProcessingReady = !hasWorkspacePdf || resourcesQuery.isSuccess
  const onProcessResource = useCallback(
    async (resource: ResourceListItem | undefined, path: string) => {
      if (!resourceProcessingReady) return
      if (resource?.objectID) {
        await rebuildResource(props.directory, { resourceKey: resource.objectID })
      } else {
        await addResource(props.directory, { sourcePath: path })
      }
      await invalidateResourcesQueries(queryClient, props.directory)
    },
    [props.directory, queryClient, resourceProcessingReady],
  )
  const interactionProps: MediaInteractionProps = {
    directory: props.directory,
    onOpenResource: props.onOpenResource,
    onProcessResource,
    resourceProcessingReady,
    resourceByPath,
  }

  return (
    <div className="flex flex-col gap-4">
      {images.length > 0 ? (
        <MediaImageGallery {...interactionProps} objectID={props.objectID} items={images} />
      ) : null}
      {videos.length > 0 ? (
        <MediaPlayerCollection {...interactionProps} objectID={props.objectID} items={videos} />
      ) : null}
      {audios.length > 0 ? (
        <MediaPlayerCollection {...interactionProps} objectID={props.objectID} items={audios} />
      ) : null}
      {files.length > 0 ? (
        <div className="w-full max-w-full overflow-hidden">
          <Table>
            <TableBody>
              {files.map((item) => (
                <MediaFileRow
                  key={`file-${item.id}`}
                  directory={props.directory}
                  item={item}
                  onOpenResource={props.onOpenResource}
                  onProcessResource={onProcessResource}
                  resourceProcessingReady={resourceProcessingReady}
                  resource={
                    item.workspacePath
                      ? resourceByPath.get(normalizeRelativePath(item.workspacePath))
                      : undefined
                  }
                />
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

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

  // Running / error / no-media: show tool row
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
