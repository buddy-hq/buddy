import { cn } from "@buddy/ui"
import type { FoliateTocItem } from "foliate-js/view.js"

export interface FoliateTocTreeProps {
  items: FoliateTocItem[]
  activeLabel?: string
  onSelect: (href: string) => void
  depth?: number
}

export function FoliateTocTree({ items, activeLabel, onSelect, depth = 0 }: FoliateTocTreeProps) {
  return (
    <div
      className={
        depth === 0 ? "space-y-0.5" : "ml-3 space-y-0.5 border-l border-border-base/30 pl-2"
      }
    >
      {items.map((item) => {
        const isActive = item.label === activeLabel
        return (
          <div key={`${depth}:${item.href}:${item.label}`}>
            <button
              type="button"
              onClick={() => onSelect(item.href)}
              className={cn(
                "w-full rounded px-2 py-1.5 text-left text-[12px] leading-snug transition-colors",
                isActive
                  ? "bg-surface-interactive-weak font-medium text-text-interactive-base"
                  : "text-text-weak hover:bg-surface-weak/70 hover:text-text-base",
              )}
            >
              {item.label}
            </button>
            {item.subitems && item.subitems.length > 0 ? (
              <FoliateTocTree
                items={item.subitems}
                activeLabel={activeLabel}
                onSelect={onSelect}
                depth={depth + 1}
              />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
