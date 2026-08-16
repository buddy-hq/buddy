import {
  forwardRef,
  useCallback,
  type ComponentType,
  type ReactNode,
} from "react"
import { useDurableScrollTop } from "@/lib/use-durable-scroll-top"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Badge, Button, Input, Skeleton, Spinner, cn } from "@buddy/ui"
import { ChevronRightIcon, SearchIcon } from "@/icons/app-icons"

const RIGHT_WORKSPACE_LIST_OVERSCAN = 8
const RIGHT_WORKSPACE_ROW_ESTIMATE_PX = 56

type RightWorkspaceDrawerAction = {
  label: string
  icon: ComponentType
  busy?: boolean
  onClick: () => void
}

type RightWorkspaceDrawerShellProps = {
  /**
   * Names the drawer for assistive tech only. On screen the rail says which
   * drawer is open and the search field repeats it — a heading row would be the
   * third place, and it costs a whole row of a surface that cannot be resized.
   */
  title: string
  searchLabel?: string
  searchValue?: string
  searchPending?: boolean
  searchAutoFocus?: boolean
  searchMaxLength?: number
  action?: RightWorkspaceDrawerAction
  toolbar?: ReactNode
  bodyClassName?: string
  scrollRef?: (node: HTMLDivElement | null) => void
  /** Restores and records this drawer's scroll position across the unmount every chat switch causes. */
  durableScrollKey?: string
  onSearchValueChange?: (value: string) => void
  children: ReactNode
}

type RightWorkspaceListRowProps = {
  title: string
  metadata: string
  badge?: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  onPreviewIntent?: (anchor: HTMLButtonElement) => void
  onPreviewEnd?: () => void
} & ({ icon: ComponentType; visual?: never } | { icon?: never; visual: ReactNode })

type RightWorkspaceVirtualListProps<TItem> = {
  items: readonly TItem[]
  scrollElement: HTMLDivElement | null
  getKey: (item: TItem) => string
  renderItem: (item: TItem, index: number) => ReactNode
  /** A function when the list is mixed-density, so the initial scroll height is not wildly wrong. */
  estimateSize?: (index: number) => number
  /** Defaults to the catalog rhythm; ruled lists can opt into contiguous rows. */
  gap?: number
}

export function RightWorkspaceDrawerShell(props: RightWorkspaceDrawerShellProps) {
  const ActionIcon = props.action?.icon
  const { containerRef: durableScrollRef, onScroll: onDurableScroll } = useDurableScrollTop(
    props.durableScrollKey ?? "",
  )
  const scrollRef = props.scrollRef
  const setScrollNode = useCallback(
    (node: HTMLDivElement | null) => {
      durableScrollRef.current = node
      if (scrollRef) {
        scrollRef(node)
      }
    },
    [durableScrollRef, scrollRef],
  )

  return (
    <section
      data-component="right-workspace-drawer"
      aria-label={props.title}
      className="flex h-full min-h-0 flex-col bg-background-base"
    >
      {/*
       * The drawer's one head row. Beside a search field the action is an icon,
       * since the field has already said what this drawer holds; on its own it
       * spells itself out, because an unlabelled icon floating over a list is a
       * guess.
       */}
      {props.searchLabel || props.action ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-border-weaker-base p-3">
          {props.searchLabel ? (
            <div className="relative min-w-0 flex-1">
              {props.searchPending ? (
                <Spinner className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-icon-base" />
              ) : (
                <SearchIcon
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-icon-base"
                  aria-hidden
                />
              )}
              <Input
                type="search"
                autoFocus={props.searchAutoFocus}
                maxLength={props.searchMaxLength}
                value={props.searchValue ?? ""}
                aria-label={props.searchLabel}
                placeholder={props.searchLabel}
                className="pl-9"
                onChange={(event) => props.onSearchValueChange?.(event.currentTarget.value)}
              />
            </div>
          ) : null}
          {props.action && ActionIcon ? (
            props.searchLabel ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="shrink-0"
                aria-label={props.action.label}
                title={props.action.label}
                disabled={props.action.busy}
                onClick={props.action.onClick}
              >
                <ActionIcon aria-hidden />
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                disabled={props.action.busy}
                onClick={props.action.onClick}
              >
                <ActionIcon data-icon="inline-start" aria-hidden />
                {props.action.label}
              </Button>
            )
          ) : null}
        </div>
      ) : null}

      {props.toolbar ? (
        <div className="shrink-0 border-b border-border-weaker-base p-3">{props.toolbar}</div>
      ) : null}

      <div
        ref={setScrollNode}
        onScroll={onDurableScroll}
        data-component="right-workspace-drawer-scroll"
        className={cn("scrollbar-hover min-h-0 flex-1 overflow-y-auto p-3", props.bodyClassName)}
      >
        {props.children}
      </div>
    </section>
  )
}

export const RightWorkspaceListRow = forwardRef<HTMLButtonElement, RightWorkspaceListRowProps>(
  function RightWorkspaceListRow(props, ref) {
    const Icon = props.icon

    return (
      <Button
        ref={ref}
        type="button"
        variant="ghost"
        aria-current={props.active ? "page" : undefined}
        disabled={props.disabled}
        className={cn(
          "h-auto w-full justify-start px-2 py-2 text-left",
          props.active ? "bg-surface-raised-base" : undefined,
        )}
        onPointerEnter={(event) => {
          if (event.pointerType === "touch") return
          props.onPreviewIntent?.(event.currentTarget)
        }}
        onPointerLeave={props.onPreviewEnd}
        onFocus={(event) => props.onPreviewIntent?.(event.currentTarget)}
        onBlur={props.onPreviewEnd}
        onClick={props.onClick}
      >
        {props.visual ? (
          props.visual
        ) : Icon ? (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border-weaker-base bg-surface-raised-base text-icon-base">
            <Icon aria-hidden />
          </span>
        ) : null}
        <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
          <span className="w-full truncate text-sm text-text-base">{props.title}</span>
          <span className="w-full truncate text-xs font-normal text-text-weaker">
            {props.metadata}
          </span>
        </span>
        {props.badge ? <Badge variant="outline">{props.badge}</Badge> : null}
        <ChevronRightIcon className="ml-auto text-icon-base" aria-hidden />
      </Button>
    )
  },
)

export function RightWorkspaceListSkeleton(props: { count?: number }) {
  const count = props.count ?? 4

  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex items-center gap-2 px-2 py-2">
          <Skeleton className="size-9 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function RightWorkspaceSectionLabel(props: { children: ReactNode; trailing?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-1 pb-1">
      <p className="text-[11px] font-medium uppercase tracking-wider text-text-weaker">
        {props.children}
      </p>
      {props.trailing}
    </div>
  )
}

export function RightWorkspaceVirtualList<TItem>(props: RightWorkspaceVirtualListProps<TItem>) {
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: props.items.length,
    getScrollElement: () => props.scrollElement,
    getItemKey: (index) => {
      const item = props.items[index]
      return item ? props.getKey(item) : index
    },
    estimateSize: (index) => props.estimateSize?.(index) ?? RIGHT_WORKSPACE_ROW_ESTIMATE_PX,
    overscan: RIGHT_WORKSPACE_LIST_OVERSCAN,
    gap: props.gap ?? 4,
  })

  return (
    <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((virtualRow) => {
        const item = props.items[virtualRow.index]
        if (!item) return null

        return (
          <div
            key={virtualRow.key}
            data-index={virtualRow.index}
            ref={virtualizer.measureElement}
            className="absolute left-0 top-0 w-full"
            style={{ transform: `translateY(${virtualRow.start}px)` }}
          >
            {props.renderItem(item, virtualRow.index)}
          </div>
        )
      })}
    </div>
  )
}
