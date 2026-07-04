import { useCallback, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "@buddy/ui"
import {
  BookOpenIcon,
  CopyIcon,
  EllipsisIcon,
  ExternalLinkIcon,
  FileTextIcon,
  FolderOpenIcon,
  Loader2Icon,
  RefreshCwIcon,
  type LucideIcon,
} from "lucide-react"
import { usePlatform } from "@/context/platform"
import {
  MAX_INLINE_PRESENTED_MEDIA_BYTES,
  buildPresentedMediaFileActionInput,
  isPresentedMediaOutsideNotebook,
} from "@/lib/presented-media"
import { resolveAssetUrl } from "@/lib/resource-url"
import { BENCH_MODE_REQUEST_POLICY, useOpenBench, type BenchTarget } from "@/lib/bench-navigation"
import {
  useWorkspaceFileOpen,
  type WorkspaceFileActionInput,
  type WorkspaceResourceOpener,
} from "@/lib/use-workspace-file-open"
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
import { Media } from "./media"
import { ToolImageGallery } from "./media-gallery"
import { MediaThumbnail } from "./media-thumbnail"
import { MultiViewShell } from "./multi-view-shell"
import type { PresentMediaResolvedItem } from "./presented-media-types"
import type {
  AudioMediaItem,
  FileMediaData,
  FileMediaItem,
  MediaAction,
  VideoMediaItem,
} from "./types"

type PresentedMediaContentProps = {
  directory: string
  objectID: string
  items: PresentMediaResolvedItem[]
  onOpenResource?: WorkspaceResourceOpener
}

type MediaInteractionProps = {
  directory: string
  onOpenResource?: WorkspaceResourceOpener
  onProcessResource: (resource: ResourceListItem | undefined, path: string) => Promise<void>
  resourceProcessingReady: boolean
  resourceByPath: Map<string, ResourceListItem>
}

type PresentedFileMediaModel = {
  item: FileMediaItem
  actions: MediaAction[]
  onOpen?: () => void
}

function resolvePresentedMediaStreamUrl(item: PresentMediaResolvedItem): string | null {
  if (!item.rawUrl) return null
  return resolveAssetUrl(item.rawUrl)
}

function fileOpenTargetLabel(target: WorkspaceFileOpenTarget, revealLabel: string): string {
  if (target === WORKSPACE_FILE_OPEN_TARGET_READING) return "Open file"
  if (target === WORKSPACE_FILE_OPEN_TARGET_MARKDOWN_BENCH) return "Open file"
  if (target === WORKSPACE_FILE_OPEN_TARGET_FILE_BENCH) return "Open file"
  if (target === WORKSPACE_FILE_OPEN_TARGET_DEFAULT_APP) return "Open in default app"
  if (target === WORKSPACE_FILE_OPEN_TARGET_REVEAL) return revealLabel
  return "Copy path"
}

function fileOpenTargetIcon(target: WorkspaceFileOpenTarget): LucideIcon {
  if (target === WORKSPACE_FILE_OPEN_TARGET_READING) return BookOpenIcon
  if (target === WORKSPACE_FILE_OPEN_TARGET_MARKDOWN_BENCH) return FileTextIcon
  if (target === WORKSPACE_FILE_OPEN_TARGET_FILE_BENCH) return FolderOpenIcon
  if (target === WORKSPACE_FILE_OPEN_TARGET_DEFAULT_APP) return ExternalLinkIcon
  if (target === WORKSPACE_FILE_OPEN_TARGET_REVEAL) return FolderOpenIcon
  return CopyIcon
}

function resourceProcessLabel(resource: ResourceListItem | undefined): string | undefined {
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
}): string {
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

function usePresentedFileMediaModel(props: {
  directory: string
  item: PresentMediaResolvedItem
  onOpenResource?: WorkspaceResourceOpener
  resource?: ResourceListItem
  resourceProcessingReady: boolean
  onProcessResource?: (resource: ResourceListItem | undefined, path: string) => Promise<void>
}): PresentedFileMediaModel {
  const { directory, item, onOpenResource, onProcessResource, resource, resourceProcessingReady } =
    props
  const platform = usePlatform()
  const [processing, setProcessing] = useState(false)
  const { resolvePlan, executeTarget, executePrimary } = useWorkspaceFileOpen(
    directory,
    onOpenResource,
  )
  const actionInput = useMemo<WorkspaceFileActionInput>(
    () => ({
      ...buildPresentedMediaFileActionInput({
        item: {
          ...item,
          availability: item.resolvedAvailability,
        },
        canOpenDefaultApp: !!platform.openPath,
        canReveal: !!platform.revealPath,
      }),
      ...(resource?.objectID ? { objectID: resource.objectID } : {}),
      ...(resource?.status ? { resourceStatus: resource.status } : {}),
    }),
    [item, platform.openPath, platform.revealPath, resource],
  )
  const plan = resolvePlan(actionInput)
  const primaryTarget = plan.primaryTarget
  const isMissing = item.resolvedAvailability.status === "missing"
  const revealLabel = platform.os === "macos" ? "Reveal in Finder" : "Reveal in File Explorer"
  const processLabel =
    resourceProcessingReady && item.mediaKind === "pdf" && item.workspacePath
      ? resourceProcessLabel(resource)
      : undefined
  const data: FileMediaData = {
    name: item.fileName,
    detail: fileRowStatusLabel({
      item,
      isMissing,
      primaryTarget,
      revealLabel,
    }),
    mediaKind: item.mediaKind,
    ...(item.mimeType ? { mediaType: item.mimeType } : {}),
  }
  const state: FileMediaItem["state"] = isMissing
    ? {
        status: "error",
        data,
        message: "File unavailable",
        detail: item.resolvedAvailability.message ?? undefined,
      }
    : {
        status: "ready",
        data,
      }

  const runTarget = useCallback(
    (target: WorkspaceFileOpenTarget) => {
      void executeTarget(actionInput, target).catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : String(error))
      })
    },
    [actionInput, executeTarget],
  )

  const processResource = useCallback(() => {
    if (!item.workspacePath || !onProcessResource || processing) return
    setProcessing(true)
    void onProcessResource(resource, item.workspacePath)
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : String(error))
      })
      .finally(() => setProcessing(false))
  }, [item.workspacePath, onProcessResource, processing, resource])

  const onOpen = useMemo(() => {
    if (!primaryTarget) return undefined
    return () => {
      void executePrimary(actionInput).catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : String(error))
      })
    }
  }, [actionInput, executePrimary, primaryTarget])

  const actions = useMemo<MediaAction[]>(() => {
    const items: Extract<MediaAction, { kind: "menu" }>["items"] = plan.targets.map((target) => {
      const Icon = fileOpenTargetIcon(target)
      return {
        id: target,
        label: fileOpenTargetLabel(target, revealLabel),
        icon: Icon,
        onSelect: () => runTarget(target),
      }
    })

    if (processLabel) {
      items.push(
        {
          kind: "separator",
          id: "process-separator",
        },
        {
          id: "process-resource-menu",
          label: processLabel,
          icon: processing || resource?.status === "preparing" ? Loader2Icon : RefreshCwIcon,
          disabled: processing || resource?.status === "preparing",
          loading: processing || resource?.status === "preparing",
          onSelect: processResource,
        },
      )
    }

    return [
      ...(processLabel
        ? [
            {
              id: "process-resource",
              label: processLabel,
              icon: processing || resource?.status === "preparing" ? Loader2Icon : RefreshCwIcon,
              disabled: processing || resource?.status === "preparing",
              loading: processing || resource?.status === "preparing",
              onSelect: processResource,
            } satisfies MediaAction,
          ]
        : []),
      {
        kind: "menu",
        id: "file-actions",
        label: `File actions for ${item.fileName}`,
        icon: EllipsisIcon,
        items,
      },
    ]
  }, [
    plan.targets,
    processLabel,
    processResource,
    processing,
    item.fileName,
    resource?.status,
    revealLabel,
    runTarget,
  ])

  return {
    item: {
      kind: "file",
      state,
    },
    actions,
    ...(onOpen ? { onOpen } : {}),
  }
}

function PresentedFileMedia(props: {
  directory: string
  item: PresentMediaResolvedItem
  onOpenResource?: WorkspaceResourceOpener
  resource?: ResourceListItem
  resourceProcessingReady: boolean
  onProcessResource?: (resource: ResourceListItem | undefined, path: string) => Promise<void>
}) {
  const model = usePresentedFileMediaModel(props)
  return <Media item={model.item} actions={model.actions} onOpen={model.onOpen} />
}

function PresentedFileMediaList(
  props: MediaInteractionProps & { items: PresentMediaResolvedItem[] },
) {
  return (
    <div className="flex w-full max-w-full flex-col gap-2 overflow-hidden">
      {props.items.map((item) => (
        <PresentedFileMedia
          key={`file-${item.id}`}
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
    </div>
  )
}

function MediaImageGallery(
  props: MediaInteractionProps & { objectID: string; items: PresentMediaResolvedItem[] },
) {
  const openBenchRoute = useOpenBench()
  const previewable = props.items.filter(
    (item) =>
      item.mediaKind === "image" &&
      item.resolvedAvailability.status === "available" &&
      (typeof item.sizeBytes !== "number" || item.sizeBytes <= MAX_INLINE_PRESENTED_MEDIA_BYTES),
  )
  const fallbackFiles = props.items.filter(
    (item) => !previewable.some((candidate) => candidate.id === item.id),
  )

  return (
    <ToolImageGallery
      dialogDescription="Media gallery preview"
      fallback={
        fallbackFiles.length > 0 ? (
          <PresentedFileMediaList {...props} items={fallbackFiles} />
        ) : undefined
      }
      items={previewable.map((item) => ({
        id: item.id,
        src: resolvePresentedMediaStreamUrl(item),
        alt: item.fileName,
        title: item.fileName,
        benchTarget: {
          type: "object",
          ref: {
            kind: "media-presentation",
            objectID: props.objectID,
            revisionID: null,
            itemID: item.id,
          },
          viewID: "gallery",
        } satisfies BenchTarget,
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

function PresentedPlaybackMedia(
  props: MediaInteractionProps & {
    objectID: string
    item: PresentMediaResolvedItem
    compact?: boolean
    shouldLoad: boolean
  },
) {
  const openBenchRoute = useOpenBench()
  const fallback = usePresentedFileMediaModel({
    directory: props.directory,
    item: props.item,
    onOpenResource: props.onOpenResource,
    onProcessResource: props.onProcessResource,
    resourceProcessingReady: props.resourceProcessingReady,
    resource: props.item.workspacePath
      ? props.resourceByPath.get(normalizeRelativePath(props.item.workspacePath))
      : undefined,
  })
  const openOnBench = useCallback(() => {
    void openBenchRoute({
      directory: props.directory,
      target: {
        type: "object",
        ref: {
          kind: "media-presentation",
          objectID: props.objectID,
          revisionID: null,
          itemID: props.item.id,
        },
        viewID: "gallery",
      },
      mode: BENCH_MODE_REQUEST_POLICY,
      autoOpen: null,
    })
  }, [openBenchRoute, props.directory, props.item.id, props.objectID])
  const playbackData = {
    item: props.item,
    playbackKey: `${props.objectID}:${props.item.id}`,
    onOpen: openOnBench,
    shouldLoad: props.shouldLoad,
    fallback,
    ...(props.compact !== undefined ? { compact: props.compact } : {}),
  }
  const mediaItem: AudioMediaItem | VideoMediaItem =
    props.item.mediaKind === "video"
      ? {
          kind: "video",
          state: {
            status: "ready",
            data: playbackData,
          },
        }
      : {
          kind: "audio",
          state: {
            status: "ready",
            data: playbackData,
          },
        }

  return <Media item={mediaItem} />
}

function PresentedPlaybackCollection(
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

  if (props.items.length === 1) {
    const item = props.items[0]
    return item ? <PresentedPlaybackMedia {...props} item={item} shouldLoad /> : null
  }

  return (
    <MultiViewShell
      contentClassName="min-h-64"
      onItemSelect={selectItem}
      items={props.items.map((item, index) => {
        const thumbnailItem: AudioMediaItem | VideoMediaItem =
          item.mediaKind === "video"
            ? {
                kind: "video",
                state: {
                  status: "ready",
                  data: {
                    item,
                    playbackKey: `${props.objectID}:${item.id}`,
                    shouldLoad: false,
                    fallback: {
                      item: {
                        kind: "file",
                        state: {
                          status: "ready",
                          data: {
                            name: item.fileName,
                            mediaKind: item.mediaKind,
                          },
                        },
                      },
                    },
                  },
                },
              }
            : {
                kind: "audio",
                state: {
                  status: "ready",
                  data: {
                    item,
                    playbackKey: `${props.objectID}:${item.id}`,
                    shouldLoad: false,
                    fallback: {
                      item: {
                        kind: "file",
                        state: {
                          status: "ready",
                          data: {
                            name: item.fileName,
                            mediaKind: item.mediaKind,
                          },
                        },
                      },
                    },
                  },
                },
              }

        return {
          key: item.id,
          thumbnail: <MediaThumbnail item={thumbnailItem} />,
          children: (
            <div className="w-full">
              <PresentedPlaybackMedia
                {...props}
                item={item}
                compact
                shouldLoad={index === selectedIndex}
              />
            </div>
          ),
        }
      })}
    />
  )
}

export function PresentedMediaContent(props: PresentedMediaContentProps) {
  const queryClient = useQueryClient()
  const images = props.items.filter((item) => item.mediaKind === "image")
  const videos = props.items.filter((item) => item.mediaKind === "video")
  const audios = props.items.filter((item) => item.mediaKind === "audio")
  const files = props.items.filter(
    (item) =>
      item.mediaKind !== "image" && item.mediaKind !== "audio" && item.mediaKind !== "video",
  )
  const hasWorkspacePdf = props.items.some((item) => item.mediaKind === "pdf" && item.workspacePath)
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
        <PresentedPlaybackCollection
          {...interactionProps}
          objectID={props.objectID}
          items={videos}
        />
      ) : null}
      {audios.length > 0 ? (
        <PresentedPlaybackCollection
          {...interactionProps}
          objectID={props.objectID}
          items={audios}
        />
      ) : null}
      {files.length > 0 ? <PresentedFileMediaList {...interactionProps} items={files} /> : null}
    </div>
  )
}
