import { useEffect, useState } from "react"
import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Skeleton,
  toast,
} from "@buddy/ui"
import { Loader2Icon, PencilIcon } from "@/icons/app-icons"
import type { BenchTarget } from "@/lib/bench-navigation"
import type { ReactNode } from "react"
import { Media } from "./media"
import { MediaThumbnail } from "./media-thumbnail"
import { MultiViewShell } from "./multi-view-shell"
import type { ImageMediaItem } from "./types"

export const MEDIA_IMAGE_GALLERY_CONTENT_CLASS_NAME = "h-[30rem]"

export type ToolImageGalleryItem = {
  id: string
  src: string | null
  alt: string
  title: string
  caption?: string
  localPath?: string
  benchTarget?: BenchTarget
}

type ToolImageGalleryProps = {
  items: ToolImageGalleryItem[]
  fallback?: ReactNode
  className?: string
  contentClassName?: string
  dialogDescription: string
  onOpenItem?: (item: ToolImageGalleryItem, index: number) => void
  onEditItem?: (item: ToolImageGalleryItem, index: number) => Promise<void>
}

function GalleryImage(props: {
  item: ToolImageGalleryItem
  className: string
  loadingClassName?: string
}) {
  if (!props.item.src) {
    return <Skeleton className={cn("rounded-[inherit]", props.className, props.loadingClassName)} />
  }

  return (
    <img
      src={props.item.src}
      alt={props.item.alt}
      loading="lazy"
      className={cn("rounded-[inherit]", props.className)}
    />
  )
}

function galleryMediaItem(item: ToolImageGalleryItem): ImageMediaItem {
  if (!item.src) {
    return {
      kind: "image",
      state: {
        status: "loading",
      },
    }
  }

  return {
    kind: "image",
    state: {
      status: "ready",
      data: {
        src: item.src,
        alt: item.alt,
        caption: item.caption,
      },
    },
  }
}

export function ToolImageGallery({
  items,
  fallback,
  className,
  contentClassName,
  dialogDescription,
  onOpenItem,
  onEditItem,
}: ToolImageGalleryProps) {
  const [open, setOpen] = useState(false)
  const [inlineIndex, setInlineIndex] = useState(0)
  const [dialogIndex, setDialogIndex] = useState(0)
  const [editingItemID, setEditingItemID] = useState<string>()
  const current = items[dialogIndex] ?? items[0]
  const inlineItem = items[inlineIndex] ?? items[0]

  const editInlineItem = () => {
    if (!onEditItem || !inlineItem?.src) return
    setEditingItemID(inlineItem.id)
    void onEditItem(inlineItem, inlineIndex)
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : String(error))
      })
      .finally(() => {
        setEditingItemID((currentID) =>
          currentID === inlineItem.id ? undefined : currentID,
        )
      })
  }

  useEffect(() => {
    if (!open || items.length <= 1) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault()
        setDialogIndex((currentIndex) => Math.max(currentIndex - 1, 0))
      }
      if (event.key === "ArrowRight") {
        event.preventDefault()
        setDialogIndex((currentIndex) => Math.min(currentIndex + 1, items.length - 1))
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [items.length, open])

  if (items.length === 0) {
    return fallback ? <div className="w-full max-w-full overflow-hidden">{fallback}</div> : null
  }

  return (
    <>
      <MultiViewShell
        className={className}
        contentClassName={contentClassName ?? MEDIA_IMAGE_GALLERY_CONTENT_CLASS_NAME}
        onIndexChange={setInlineIndex}
        actions={
          onEditItem && inlineItem?.src ? (
            <Button
              type="button"
              aria-label="Edit image"
              size="sm"
              variant="secondary"
              className="rounded-full border border-border-base/70 bg-background-base/92 shadow-lg backdrop-blur-xl"
              disabled={editingItemID !== undefined}
              onClick={editInlineItem}
            >
              {editingItemID === inlineItem.id ? (
                <Loader2Icon className="animate-spin" aria-hidden />
              ) : (
                <PencilIcon aria-hidden />
              )}
              Edit image
            </Button>
          ) : undefined
        }
        items={items.map((item, index) => {
          const mediaItem = galleryMediaItem(item)
          return {
            key: item.id,
            thumbnail: <MediaThumbnail item={mediaItem} />,
            children: (
              <Media
                item={mediaItem}
                fit="content"
                className={MEDIA_IMAGE_GALLERY_CONTENT_CLASS_NAME}
                onOpen={() => {
                  if (!item.src) return
                  if (onOpenItem) {
                    onOpenItem(item, index)
                    return
                  }
                  setDialogIndex(index)
                  setOpen(true)
                }}
              />
            ),
          }
        })}
      />
      {fallback ? <div className="mt-2 w-full max-w-full overflow-hidden">{fallback}</div> : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="!border-none !bg-transparent !shadow-none p-0 flex flex-col gap-4 sm:max-w-[90vw] md:max-w-[85vw] max-h-[90vh] w-full focus:outline-none"
        >
          <DialogHeader className="sr-only">
            <DialogTitle>{current?.title ?? "Image"}</DialogTitle>
            <DialogDescription>{dialogDescription}</DialogDescription>
          </DialogHeader>
          <div className="w-full flex-1">
            <MultiViewShell
              thumbnailSize="lg"
              defaultIndex={dialogIndex}
              onIndexChange={setDialogIndex}
              showZoomControls={true}
              contentClassName="h-[60vh] md:h-[70vh] !bg-transparent !border-none"
              items={items.map((item) => ({
                key: item.id,
                thumbnail: <GalleryImage item={item} className="h-full w-full object-cover" />,
                children: (
                  <div className="relative flex h-full w-full items-center justify-center">
                    <GalleryImage
                      item={item}
                      className="h-full max-h-[60vh] w-full max-w-[75vw] select-none rounded-xl object-contain shadow-2xl md:max-h-[70vh]"
                      loadingClassName="max-h-[28rem]"
                    />
                    {item.caption ? (
                      <p className="absolute bottom-4 max-w-xl rounded-full border border-border-base/10 bg-background-base/75 px-4 py-1.5 text-center text-xs font-medium text-text-base shadow-lg backdrop-blur-sm">
                        {item.caption}
                      </p>
                    ) : null}
                  </div>
                ),
              }))}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
