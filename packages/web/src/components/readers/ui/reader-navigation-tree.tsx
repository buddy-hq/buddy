import { Button } from "@buddy/ui"
import type { ReaderNavigationItem } from "../reader-types"

type ReaderNavigationTreeProps = {
  items: ReaderNavigationItem[]
  activeItemId?: string
  activeLabel?: string
  onSelect: (navigationId: string) => void
  depth?: number
}

export function ReaderNavigationTree({
  items,
  activeItemId,
  activeLabel,
  onSelect,
  depth = 0,
}: ReaderNavigationTreeProps) {
  return (
    <div
      className={depth === 0 ? "flex flex-col gap-0.5" : "ml-3 flex flex-col gap-0.5 border-l pl-2"}
    >
      {items.map((item) => {
        const isActive = item.id === activeItemId || item.label === activeLabel
        return (
          <div key={item.id}>
            <Button
              type="button"
              variant={isActive ? "secondary" : "ghost"}
              size="sm"
              aria-current={isActive ? "location" : undefined}
              onClick={() => onSelect(item.id)}
              className="h-auto w-full justify-start whitespace-normal px-2 py-1.5 text-left"
            >
              <span className="min-w-0">
                <span className="block">{item.label}</span>
                {item.description ? (
                  <span className="block truncate text-xs text-text-weaker">
                    {item.description}
                  </span>
                ) : null}
              </span>
            </Button>
            {item.subitems.length > 0 ? (
              <ReaderNavigationTree
                items={item.subitems}
                activeItemId={activeItemId}
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
