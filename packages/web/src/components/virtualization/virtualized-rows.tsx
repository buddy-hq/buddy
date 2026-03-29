import type { ReactNode } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
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
}

export function VirtualizedRows<TItem, TScrollElement extends Element = HTMLDivElement>(
  props: VirtualizedRowsProps<TItem, TScrollElement>,
) {
  const virtualizer = useVirtualizer<TScrollElement, HTMLDivElement>({
    count: props.items.length,
    getScrollElement: props.getScrollElement,
    getItemKey: (index) => props.getItemKey(props.items[index]!, index),
    estimateSize: (index) => props.estimateSize(props.items[index]!, index),
    overscan: props.overscan ?? VIRTUAL_DEFAULT_OVERSCAN,
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
