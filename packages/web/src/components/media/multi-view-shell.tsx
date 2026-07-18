import { useState, useEffect, useRef } from "react"
import {
  cn,
  Button,
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
  type CarouselApi,
} from "@buddy/ui"
import { ZoomInIcon, ZoomOutIcon } from "@/icons/app-icons"
import type { ReactNode } from "react"

export type MultiViewItem = {
  key: string
  thumbnail: ReactNode
  children: ReactNode
}

type MultiViewShellProps = {
  items: MultiViewItem[]
  actions?: ReactNode
  contentClassName?: string
  className?: string
  thumbnailSize?: "sm" | "md" | "lg"
  defaultIndex?: number
  showZoomControls?: boolean
  onIndexChange?: (index: number) => void
  onItemSelect?: (index: number) => void
}

export function MultiViewShell({
  items,
  actions,
  contentClassName,
  className,
  thumbnailSize,
  defaultIndex,
  showZoomControls,
  onIndexChange,
  onItemSelect,
}: MultiViewShellProps) {
  const [idx, setIdx] = useState(defaultIndex ?? 0)
  const [scale, setScale] = useState(1.0)
  const [api, setApi] = useState<CarouselApi>()
  const clampedIdx = Math.min(idx, items.length - 1)

  const containerRef = useRef<HTMLDivElement>(null)
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })

  useEffect(() => {
    if (defaultIndex !== undefined) {
      setIdx(defaultIndex)
    }
  }, [defaultIndex])

  useEffect(() => {
    onIndexChange?.(clampedIdx)
  }, [clampedIdx, onIndexChange])

  useEffect(() => {
    setScale(1.0)
    setPanOffset({ x: 0, y: 0 })
  }, [clampedIdx])

  useEffect(() => {
    if (scale <= 1.0) {
      setPanOffset({ x: 0, y: 0 })
    }
  }, [scale])

  useEffect(() => {
    if (!api) return
    api.scrollTo(clampedIdx)
  }, [api, clampedIdx])

  if (items.length === 0) return null

  const sizeClasses = {
    sm: "size-12 rounded-lg",
    md: "size-16 rounded-xl",
    lg: "h-20 w-32 rounded-xl",
  }
  const currentSizeClass = sizeClasses[thumbnailSize || "md"]

  const selectIndex = (nextIndex: number) => {
    const clampedIndex = Math.max(0, Math.min(nextIndex, items.length - 1))
    setIdx(clampedIndex)
    onItemSelect?.(clampedIndex)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault()
      e.stopPropagation()
      selectIndex(clampedIdx - 1)
    } else if (e.key === "ArrowRight") {
      e.preventDefault()
      e.stopPropagation()
      selectIndex(clampedIdx + 1)
    }
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!showZoomControls || scale <= 1.0) return
    if (e.button !== 0) return
    const container = containerRef.current
    if (!container) return

    setIsPanning(true)
    setPanStart({
      x: e.clientX - panOffset.x,
      y: e.clientY - panOffset.y,
    })
    e.preventDefault()
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isPanning) return
    const container = containerRef.current
    if (!container) return

    const newX = e.clientX - panStart.x
    const newY = e.clientY - panStart.y
    setPanOffset({ x: newX, y: newY })
  }

  const handleMouseUpOrLeave = () => {
    if (isPanning) {
      setIsPanning(false)
    }
  }

  const mainPanel = (
    <div className="relative w-full flex flex-col">
      <div
        ref={containerRef}
        tabIndex={0}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUpOrLeave}
        onMouseLeave={handleMouseUpOrLeave}
        className={cn(
          "relative w-full rounded-xl flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-base focus-visible:ring-offset-2 focus-visible:ring-offset-background-base select-none overflow-hidden",
          showZoomControls && scale > 1.0 ? (isPanning ? "cursor-grabbing" : "cursor-grab") : "",
          contentClassName || "h-[30rem]",
        )}
      >
        {items.map((item, i) => (
          <div
            key={item.key}
            className={cn(
              "flex items-center justify-center transition-opacity duration-150 rounded-[inherit]",
              i === clampedIdx
                ? "opacity-100 relative pointer-events-auto w-full"
                : "opacity-0 absolute inset-0 pointer-events-none w-full h-full",
            )}
          >
            {showZoomControls ? (
              <div
                style={{
                  transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${scale})`,
                  transformOrigin: "center center",
                }}
                className={cn(
                  "w-full h-full flex items-center justify-center",
                  isPanning ? "" : "transition-transform duration-100",
                )}
              >
                {item.children}
              </div>
            ) : (
              item.children
            )}
          </div>
        ))}
      </div>
      {showZoomControls ? (
        <div className="absolute top-4 right-4 z-20 flex items-center gap-2 px-3.5 py-1.5 bg-background-base/85 backdrop-blur-md rounded-full border border-border-base/10 shadow-lg text-xs text-text-weak select-none">
          <Button
            size="xs"
            variant="ghost"
            className="hover:bg-surface-weak/20 px-2.5 py-1 h-auto text-xs font-medium"
            onClick={() => setScale(1.0)}
          >
            Fit
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            className="hover:bg-surface-weak/20 size-7 rounded-full"
            onClick={() => setScale((c) => Math.max(c - 0.1, 0.25))}
          >
            <ZoomOutIcon className="size-3.5" />
          </Button>
          <span className="tabular-nums min-w-[36px] text-center text-xs font-semibold">
            {Math.round(scale * 100)}%
          </span>
          <Button
            size="icon-sm"
            variant="ghost"
            className="hover:bg-surface-weak/20 size-7 rounded-full"
            onClick={() => setScale((c) => Math.min(c + 0.1, 3.0))}
          >
            <ZoomInIcon className="size-3.5" />
          </Button>
        </div>
      ) : null}
      {actions ? <div className="absolute bottom-3 right-3 z-10">{actions}</div> : null}
    </div>
  )

  if (items.length === 1) {
    return (
      <div onKeyDownCapture={handleKeyDown} className={cn("relative w-full", className)}>
        {mainPanel}
      </div>
    )
  }

  return (
    <div onKeyDownCapture={handleKeyDown} className={cn("flex flex-col w-full", className)}>
      {mainPanel}

      {/* Thumbnail carousel below */}
      <div className="mt-2">
        <Carousel setApi={setApi} opts={{ align: "start", dragFree: true }} className="px-10">
          <CarouselContent className="-ml-2" viewportClassName="py-3 px-3">
            {items.map((item, i) => (
              <CarouselItem key={item.key} className="basis-auto pl-2">
                <button
                  type="button"
                  onClick={() => selectIndex(i)}
                  className={cn(
                    "shrink-0 overflow-hidden border-2 bg-background-base transition-[border-color,opacity]",
                    currentSizeClass,
                    i === clampedIdx
                      ? "border-border-interactive-base opacity-100"
                      : "border-border-base/40 opacity-60 hover:opacity-100",
                  )}
                >
                  {item.thumbnail}
                </button>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious className="left-1 bg-background-base/80 backdrop-blur-sm disabled:hidden" />
          <CarouselNext className="right-1 bg-background-base/80 backdrop-blur-sm disabled:hidden" />
        </Carousel>
      </div>
    </div>
  )
}
