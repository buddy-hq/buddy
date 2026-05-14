import { useCallback, useEffect, useState } from "react"
import { useQueries } from "@tanstack/react-query"
import {
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Skeleton,
  Slider,
  Table,
  TableBody,
  TableCell,
  TableRow,
  toast,
} from "@buddy/ui"
import { ZoomInIcon, ZoomOutIcon } from "lucide-react"
import { ToolRow, ToolRowIcon, ToolRowAction } from "../../tool-row"
import { TextShimmer } from "../../text-shimmer"
import { ToolErrorPanel } from "../../tool-error-panel"
import { FileTypeIcon } from "@/components/files/file-type-icon"
import { canOpenWorkspaceFileInPanel } from "@/lib/workspace-file-media"
import {
  MAX_INLINE_PRESENTED_MEDIA_BYTES,
  readPresentedMediaOutputArtifact,
  resolvePresentedMediaAvailability,
  toWorkspaceFilePanelItem,
  type PresentedMediaAvailabilityResolution,
  type PresentedMediaItem as PresentMediaItem,
  type PresentedMediaOutput as PresentMediaOutput,
} from "@/lib/presented-media"
import { resolveAssetUrl } from "@/lib/resource-url"
import { usePlatform } from "@/context/platform"
import { useWorkspaceFilePanelStore } from "@/state/workspace-file-panel-store"
import type { ToolPartProps } from "../../registry"

const IMAGE_DIALOG_FIT_SCALE = 1
const IMAGE_DIALOG_MIN_SCALE = 0.5
const IMAGE_DIALOG_MAX_SCALE = 3
const IMAGE_DIALOG_SCALE_STEP = 0.25

type PresentMediaResolvedItem = PresentMediaItem & {
  resolvedAvailability: PresentMediaItem["availability"]
  availabilityChecked: boolean
}

// ---------------------------------------------------------------------------
// Data hooks
// ---------------------------------------------------------------------------

function parsePresentMediaOutput(state: ToolPartProps["state"]): PresentMediaOutput | undefined {
  return readPresentedMediaOutputArtifact(state.metadata)
}

function resolvePresentedMediaStreamUrl(item: PresentMediaResolvedItem): string | null {
  if (!item.rawUrl) return null
  return resolveAssetUrl(item.rawUrl)
}

function canOpenPresentedMediaInWorkspacePanel(item: PresentMediaResolvedItem) {
  if (!item.workspacePath) {
    return false
  }

  return canOpenWorkspaceFileInPanel({
    path: item.workspacePath,
    mimeType: item.mimeType ?? undefined,
    sizeBytes: item.sizeBytes ?? undefined,
  })
}

function presentedMediaAvailabilityKey(directory: string, item: PresentMediaItem) {
  return [
    directory,
    item.displayPath,
    item.rawUrl ?? "",
    item.modifiedAt ?? "",
    String(item.sizeBytes ?? ""),
  ].join(":")
}

function presentedMediaAvailabilityQueryOptions(directory: string, item: PresentMediaItem) {
  return {
    queryKey: ["presented-media", "availability", presentedMediaAvailabilityKey(directory, item)],
    queryFn: () => resolvePresentedMediaAvailability(directory, item),
    retry: false,
    refetchOnWindowFocus: false,
  } as const
}

function mergeResolvedPresentedMediaItem(
  item: PresentMediaItem,
  resolution: PresentedMediaAvailabilityResolution | undefined,
): PresentMediaResolvedItem {
  const refreshed = resolution?.item

  return {
    ...item,
    absolutePath: refreshed?.absolutePath ?? item.absolutePath,
    displayPath: refreshed?.displayPath ?? item.displayPath,
    workspacePath: refreshed?.workspacePath ?? item.workspacePath,
    fileName: refreshed?.fileName ?? item.fileName,
    mediaKind: refreshed?.mediaKind ?? item.mediaKind,
    renderMode: refreshed?.renderMode ?? item.renderMode,
    mimeType: refreshed?.mimeType ?? item.mimeType,
    sizeBytes: refreshed?.sizeBytes ?? item.sizeBytes,
    modifiedAt: refreshed?.modifiedAt ?? item.modifiedAt,
    rawUrl: refreshed?.rawUrl ?? item.rawUrl,
    actionCapabilities: refreshed?.actionCapabilities ?? item.actionCapabilities,
    availability: refreshed?.availability ?? item.availability,
    resolvedAvailability: resolution?.availability ?? item.availability,
    availabilityChecked: resolution !== undefined,
  }
}

function usePresentedMediaAvailability(
  directory: string | undefined,
  items: PresentMediaItem[] | undefined,
) {
  const availabilityQueries = useQueries({
    queries: directory
      ? (items ?? []).map((item) => presentedMediaAvailabilityQueryOptions(directory, item))
      : [],
  })

  return (items ?? []).map((item, index) =>
    mergeResolvedPresentedMediaItem(item, availabilityQueries[index]?.data),
  )
}

// ---------------------------------------------------------------------------
// Tiny UI pieces
// ---------------------------------------------------------------------------

function isSafeInlineAudio(mt: string | null) {
  return (
    mt === "audio/mpeg" ||
    mt === "audio/mp4" ||
    mt === "audio/ogg" ||
    mt === "audio/wav" ||
    mt === "audio/x-wav" ||
    mt === "audio/flac"
  )
}

function isSafeInlineVideo(mt: string | null) {
  return mt === "video/mp4" || mt === "video/webm" || mt === "video/ogg" || mt === "video/quicktime"
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

function InlineImage(props: {
  directory: string
  item: PresentMediaResolvedItem
  alt: string
  className: string
}) {
  const url = resolvePresentedMediaStreamUrl(props.item)
  if (!url) return <Skeleton className={props.className} />
  return <img src={url} alt={props.alt} loading="lazy" className={props.className} />
}

// ---------------------------------------------------------------------------
// Clickable file row with right-click context menu
// ---------------------------------------------------------------------------

function useMediaPrimaryAction(directory: string, item: PresentMediaResolvedItem) {
  const platform = usePlatform()
  const queueFileOpen = useWorkspaceFilePanelStore((s) => s.queueFileOpen)
  const panelItem = toWorkspaceFilePanelItem(item)
  const canOpenInWorkspacePanel =
    item.resolvedAvailability.status === "available" &&
    panelItem !== undefined &&
    canOpenPresentedMediaInWorkspacePanel(item)
  const canOpenDefaultApp =
    item.resolvedAvailability.status === "available" &&
    item.actionCapabilities.canOpenDefaultApp &&
    !!platform.openPath

  return useCallback(() => {
    if (canOpenInWorkspacePanel && panelItem) {
      queueFileOpen(directory, panelItem, { autoOpen: true })
      return
    }
    if (canOpenDefaultApp) {
      void platform.openPath!(item.absolutePath).catch((error: unknown) =>
        toast.error(error instanceof Error ? error.message : String(error)),
      )
    }
  }, [
    canOpenDefaultApp,
    canOpenInWorkspacePanel,
    directory,
    item.absolutePath,
    panelItem,
    platform,
    queueFileOpen,
  ])
}

function MediaFileRow(props: { directory: string; item: PresentMediaResolvedItem }) {
  const platform = usePlatform()
  const primaryAction = useMediaPrimaryAction(props.directory, props.item)
  const canOpenInWorkspacePanel =
    props.item.resolvedAvailability.status === "available" &&
    props.item.actionCapabilities.canOpenInWorkspacePanel &&
    props.item.workspacePath !== null
  const canReveal = props.item.actionCapabilities.canRevealInFileManager && !!platform.revealPath
  const canOpenApp = props.item.actionCapabilities.canOpenDefaultApp && !!platform.openPath
  const hasPrimaryAction = canOpenInWorkspacePanel || canOpenApp
  const isMissing = props.item.resolvedAvailability.status === "missing"
  const rowClassName = [
    "border-none transition-colors hover:bg-surface-base",
    hasPrimaryAction ? "cursor-pointer" : "cursor-default",
    isMissing ? "opacity-50" : null,
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <TableRow onClick={primaryAction} className={rowClassName}>
          <TableCell className="w-10 px-2 py-1">
            <MediaFileIcon item={props.item} />
          </TableCell>
          <TableCell className="min-w-0 max-w-xs truncate px-2 py-1 text-sm text-text-base">
            {props.item.fileName}
          </TableCell>
        </TableRow>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {canReveal ? (
          <ContextMenuItem
            onSelect={() => {
              void platform.revealPath!(props.item.absolutePath).catch((e: unknown) =>
                toast.error(e instanceof Error ? e.message : String(e)),
              )
            }}
          >
            Reveal in Finder
          </ContextMenuItem>
        ) : null}
        {canOpenApp ? (
          <ContextMenuItem
            onSelect={() => {
              void platform.openPath!(props.item.absolutePath).catch((e: unknown) =>
                toast.error(e instanceof Error ? e.message : String(e)),
              )
            }}
          >
            Open in default app
          </ContextMenuItem>
        ) : null}
        {canReveal || canOpenApp ? <ContextMenuSeparator /> : null}
        <ContextMenuItem
          onSelect={() => void navigator.clipboard.writeText(props.item.absolutePath)}
        >
          Copy path
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

// ---------------------------------------------------------------------------
// Image gallery — compact grid + zoom dialog
// ---------------------------------------------------------------------------

function MediaImageGallery(props: { directory: string; items: PresentMediaResolvedItem[] }) {
  const [open, setOpen] = useState(false)
  const [idx, setIdx] = useState(0)
  const [scale, setScale] = useState(IMAGE_DIALOG_FIT_SCALE)

  const previewable = props.items.filter(
    (i) =>
      i.mediaKind === "image" &&
      i.resolvedAvailability.status === "available" &&
      (typeof i.sizeBytes !== "number" || i.sizeBytes <= MAX_INLINE_PRESENTED_MEDIA_BYTES),
  )
  const fallbackFiles = props.items.filter(
    (i) => !previewable.some((candidate) => candidate.id === i.id),
  )
  const current = previewable[idx] ?? previewable[0] ?? props.items[0]
  const currentUrl = resolvePresentedMediaStreamUrl(current)

  useEffect(() => {
    if (!open || previewable.length <= 1) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault()
        setIdx((c) => Math.max(c - 1, 0))
      }
      if (e.key === "ArrowRight") {
        e.preventDefault()
        setIdx((c) => Math.min(c + 1, previewable.length - 1))
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, previewable.length])

  if (previewable.length === 0) {
    return (
      <div className="w-full max-w-full overflow-hidden">
        <Table>
          <TableBody>
            {fallbackFiles.map((item) => (
              <MediaFileRow key={`image-file-${item.id}`} directory={props.directory} item={item} />
            ))}
          </TableBody>
        </Table>
      </div>
    )
  }

  const single = previewable.length === 1

  return (
    <>
      <div className={single ? "" : "grid grid-cols-2 gap-1.5"}>
        {previewable.map((item, i) => (
          <button
            key={item.id}
            type="button"
            className="overflow-hidden rounded-lg"
            onClick={() => {
              setIdx(i)
              setScale(IMAGE_DIALOG_FIT_SCALE)
              setOpen(true)
            }}
          >
            <InlineImage
              directory={props.directory}
              item={item}
              alt={item.fileName}
              className={
                single ? "max-h-[14rem] w-full object-contain" : "h-28 w-full object-cover"
              }
            />
          </button>
        ))}
      </div>
      {fallbackFiles.length > 0 ? (
        <div className="mt-2 w-full max-w-full overflow-hidden">
          <Table>
            <TableBody>
              {fallbackFiles.map((item) => (
                <MediaFileRow
                  key={`image-fallback-inline-${item.id}`}
                  directory={props.directory}
                  item={item}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <DialogTitle>{current.fileName}</DialogTitle>
            <DialogDescription>Preview</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-text-weak">
              <Button size="xs" variant="outline" onClick={() => setScale(IMAGE_DIALOG_FIT_SCALE)}>
                Fit
              </Button>
              <Button size="xs" variant="outline" onClick={() => setScale(1)}>
                1:1
              </Button>
              <Button
                size="icon-xs"
                variant="outline"
                onClick={() =>
                  setScale((c) => Math.max(c - IMAGE_DIALOG_SCALE_STEP, IMAGE_DIALOG_MIN_SCALE))
                }
              >
                <ZoomOutIcon className="size-3" />
                <span className="sr-only">Zoom out</span>
              </Button>
              <div className="min-w-32 max-w-56 flex-1 px-1">
                <Slider
                  value={[scale]}
                  min={IMAGE_DIALOG_MIN_SCALE}
                  max={IMAGE_DIALOG_MAX_SCALE}
                  step={IMAGE_DIALOG_SCALE_STEP}
                  onValueChange={(v) => setScale(v[0] ?? IMAGE_DIALOG_FIT_SCALE)}
                />
              </div>
              <span>{Math.round(scale * 100)}%</span>
              <Button
                size="icon-xs"
                variant="outline"
                onClick={() =>
                  setScale((c) => Math.min(c + IMAGE_DIALOG_SCALE_STEP, IMAGE_DIALOG_MAX_SCALE))
                }
              >
                <ZoomInIcon className="size-3" />
                <span className="sr-only">Zoom in</span>
              </Button>
            </div>
            <figure className="overflow-auto rounded-lg border border-border-base bg-background-base p-3">
              {currentUrl ? (
                <img
                  src={currentUrl}
                  alt={current.fileName}
                  loading="lazy"
                  className="mx-auto max-h-[70vh] object-contain"
                  style={{ transform: `scale(${scale})`, transformOrigin: "center center" }}
                />
              ) : (
                <Skeleton className="mx-auto h-[28rem] w-full rounded-lg" />
              )}
            </figure>
            {previewable.length > 1 ? (
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {previewable.map((item, i) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setIdx(i)}
                    className={
                      i === idx
                        ? "overflow-hidden rounded-md ring-2 ring-border-base"
                        : "overflow-hidden rounded-md border border-border-base/50"
                    }
                  >
                    <InlineImage
                      directory={props.directory}
                      item={item}
                      alt={item.fileName}
                      className="h-14 w-14 object-cover"
                    />
                  </button>
                ))}
              </div>
            ) : null}
            {fallbackFiles.length > 0 ? (
              <div className="w-full max-w-full overflow-hidden">
                <Table>
                  <TableBody>
                    {fallbackFiles.map((item) => (
                      <MediaFileRow
                        key={`image-fallback-${item.id}`}
                        directory={props.directory}
                        item={item}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ---------------------------------------------------------------------------
// Audio / Video — native player, no wrapper
// ---------------------------------------------------------------------------

function MediaPlayer(props: { directory: string; item: PresentMediaResolvedItem }) {
  const rawUrl = resolvePresentedMediaStreamUrl(props.item)
  const isVideo = props.item.mediaKind === "video"
  const canPreview =
    props.item.resolvedAvailability.status === "available" &&
    (isVideo ? isSafeInlineVideo(props.item.mimeType) : isSafeInlineAudio(props.item.mimeType))

  if (!canPreview || !rawUrl) return <MediaFileRow directory={props.directory} item={props.item} />

  return isVideo ? (
    <video controls preload="metadata" className="max-h-[20rem] w-full rounded-lg" src={rawUrl} />
  ) : (
    <audio controls preload="metadata" className="w-full" src={rawUrl} />
  )
}

// ---------------------------------------------------------------------------
// Content layout — routes by mediaKind, no header
// ---------------------------------------------------------------------------

function PresentedMediaContent(props: { directory: string; items: PresentMediaResolvedItem[] }) {
  const images = props.items.filter((i) => i.mediaKind === "image")
  const av = props.items.filter((i) => i.mediaKind === "audio" || i.mediaKind === "video")
  const files = props.items.filter(
    (i) => i.mediaKind !== "image" && i.mediaKind !== "audio" && i.mediaKind !== "video",
  )

  return (
    <div className="flex flex-col gap-2">
      {images.length > 0 ? <MediaImageGallery directory={props.directory} items={images} /> : null}
      {av.map((i) => (
        <MediaPlayer key={`av-${i.id}`} directory={props.directory} item={i} />
      ))}
      {files.length > 0 ? (
        <div className="w-full max-w-full overflow-hidden">
          <Table>
            <TableBody>
              {files.map((i) => (
                <MediaFileRow key={`file-${i.id}`} directory={props.directory} item={i} />
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

export function renderPresentMediaTool(props: ToolPartProps) {
  const output = props.state.output || (props.state.error ?? "")
  const showOutput = output.trim().length > 0
  const media =
    props.state.status === "completed" ? parsePresentMediaOutput(props.state) : undefined
  const resolvedItems = usePresentedMediaAvailability(props.directory, media?.items)
  const running = props.state.status === "pending" || props.state.status === "running"

  // Running / error / no-media: show tool row
  if (running || !media || !props.directory) {
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

  // Completed with media: render content directly, no header
  return <PresentedMediaContent directory={props.directory} items={resolvedItems} />
}
