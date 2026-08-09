import type { ReactNode } from "react"
import {
  measureElement as measureVirtualElement,
  observeElementRect,
  useVirtualizer,
} from "@tanstack/react-virtual"
import { cn } from "@buddy/ui"
import { VIRTUAL_DEFAULT_OVERSCAN } from "./virtualization-defaults"

type VirtualizedRowsProps<TItem, TScrollElement extends Element = HTMLDivElement> = {
  items: readonly TItem[]
  getItemKey: (item: TItem, index: number) => string
  estimateSize: (item: TItem, index: number) => number
  getScrollElement: () => TScrollElement | null
  renderItem: (item: TItem, index: number) => ReactNode
  overscan?: number
  measure?: boolean
  className?: string
  initialRect?: { width: number; height: number }
}

export function VirtualizedRows<TItem, TScrollElement extends Element = HTMLDivElement>(
  props: VirtualizedRowsProps<TItem, TScrollElement>,
) {
  const fallbackRect = props.initialRect
  const virtualizer = useVirtualizer<TScrollElement, HTMLDivElement>({
    count: props.items.length,
    getScrollElement: props.getScrollElement,
    getItemKey: (index) => props.getItemKey(props.items[index]!, index),
    estimateSize: (index) => props.estimateSize(props.items[index]!, index),
    overscan: props.overscan ?? VIRTUAL_DEFAULT_OVERSCAN,
    initialRect: fallbackRect,
    ...(fallbackRect
      ? {
          observeElementRect: (instance, callback) =>
            observeElementRect(instance, (rect) =>
              callback(rect.height > 0 ? rect : fallbackRect),
            ),
          measureElement: (element, entry, instance) => {
            const measured = measureVirtualElement(element, entry, instance)
            if (measured > 0) return measured
            const index = Number(element.getAttribute("data-index"))
            const item = props.items[index]
            return item === undefined ? 0 : props.estimateSize(item, index)
          },
        }
      : {}),
  })

  const virtualRows = virtualizer.getVirtualItems()

  return (
    <div
      className={cn("relative w-full", props.className)}
      style={{ height: `${virtualizer.getTotalSize()}px` }}
    >
      {virtualRows.map((virtualRow) => (
        <div
          key={virtualRow.key}
          data-index={virtualRow.index}
          ref={props.measure ? virtualizer.measureElement : undefined}
          className="absolute top-0 left-0 w-full"
          style={{ transform: `translateY(${virtualRow.start}px)` }}
        >
          {props.renderItem(props.items[virtualRow.index]!, virtualRow.index)}
        </div>
      ))}
    </div>
  )
}
