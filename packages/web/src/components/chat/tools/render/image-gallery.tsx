import { useEffect, useState } from "react"
import {
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Skeleton,
} from "@buddy/ui"
import { MultiViewShell } from "../multi-view-shell"
import type { BenchTarget } from "@/lib/bench-navigation"
import type { ReactNode } from "react"

export type ToolImageGalleryItem = {
  id: string
  src: string | null
  alt: string
  title: string
  caption?: string
  benchTarget?: BenchTarget
}

type ToolImageGalleryProps = {
  items: ToolImageGalleryItem[]
  fallback?: ReactNode
  className?: string
  contentClassName?: string
  dialogDescription: string
  onOpenItem?: (item: ToolImageGalleryItem, index: number) => void
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

export function ToolImageGallery({
  items,
  fallback,
  className,
  contentClassName,
  dialogDescription,
  onOpenItem,
}: ToolImageGalleryProps) {
  const [open, setOpen] = useState(false)
  const [idx, setIdx] = useState(0)
  const current = items[idx] ?? items[0]

  useEffect(() => {
    if (!open || items.length <= 1) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault()
        setIdx((currentIndex) => Math.max(currentIndex - 1, 0))
      }
      if (event.key === "ArrowRight") {
        event.preventDefault()
        setIdx((currentIndex) => Math.min(currentIndex + 1, items.length - 1))
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
        contentClassName={contentClassName}
        items={items.map((item, index) => ({
          key: item.id,
          thumbnail: <GalleryImage item={item} className="h-full w-full object-cover" />,
          children: (
            <button
              type="button"
              disabled={!item.src}
              className={cn(
                "flex h-full w-full flex-col items-center justify-center",
                item.src ? "cursor-zoom-in" : "cursor-default",
              )}
              onClick={() => {
                if (!item.src) return
                if (onOpenItem) {
                  onOpenItem(item, index)
                  return
                }
                setIdx(index)
                setOpen(true)
              }}
            >
              <GalleryImage
                item={item}
                className="min-h-0 flex-1 h-full w-full object-contain"
                loadingClassName="min-h-48"
              />
              {item.caption ? (
                <span className="w-full border-t border-border-base/30 bg-surface-base/80 px-3 py-2 text-center text-xs text-text-weaker">
                  {item.caption}
                </span>
              ) : null}
            </button>
          ),
        }))}
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
              defaultIndex={idx}
              onIndexChange={setIdx}
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
