import {
  useEffect,
  useMemo,
  useRef,
  type ComponentType,
  type KeyboardEvent,
} from "react"
import "@/components/prompt/composer-surfaces.css"
import { useQuery } from "@tanstack/react-query"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from "@buddy/ui"
import {
  BookOpenIcon,
  FileIcon,
  FileTextIcon,
  Globe,
  ImageIcon,
  PresentationIcon,
  ShapesIcon,
  StudyLampIcon,
  XIcon,
} from "@/icons/app-icons"
import type { BenchObjectKind } from "@/lib/bench-navigation"
import { resolveBenchTabTitle, type BenchTab } from "@/lib/bench-tabs"
import { workspaceObjectsQueryOptions } from "@/state/workspace-objects-query"

type BenchTabsProps = {
  directory: string
  placement?: "workspace" | "titlebar"
  tabs: readonly BenchTab[]
  activeTabKey: string | null
  onActivate: (tabKey: string) => void
  onClose: (tabKey: string) => void
  onCloseOthers: (tabKey: string) => void
  onCloseToRight: (tabKey: string) => void
  onCloseAll: () => void
}

type BenchTabItemProps = {
  tab: BenchTab
  title: string
  active: boolean
  last: boolean
  only: boolean
  onActivate: () => void
  onClose: () => void
  onCloseOthers: () => void
  onCloseToRight: () => void
  onCloseAll: () => void
}

const TAB_ICON_CLASS = "size-3.5 shrink-0"
const TAB_KEY_ARROW_LEFT = "ArrowLeft"
const TAB_KEY_ARROW_RIGHT = "ArrowRight"
const TAB_KEY_HOME = "Home"
const TAB_KEY_END = "End"

function objectTabIcon(kind: BenchObjectKind): ComponentType<{ className?: string }> {
  switch (kind) {
    case "resource":
      return BookOpenIcon
    case "whiteboard":
      return PresentationIcon
    case "mermaid":
      return ShapesIcon
    case "html-widget":
      return Globe
    case "figure":
    case "freeform-figure":
      return ImageIcon
    case "media-presentation":
      return PresentationIcon
    case "question-set":
      return StudyLampIcon
    case "flashcard-deck":
      return BookOpenIcon
  }
}

function BenchTabItem(props: BenchTabItemProps) {
  const tabRef = useRef<HTMLDivElement>(null)
  const Icon =
    props.tab.target.type === "workspace-file"
      ? props.tab.target.viewer === "markdown"
        ? FileTextIcon
        : FileIcon
      : objectTabIcon(props.tab.target.ref.kind)

  useEffect(() => {
    if (!props.active) return
    tabRef.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" })
  }, [props.active])

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={tabRef}
          data-component="bench-tab"
          data-tab-key={props.tab.key}
          data-active={props.active ? "true" : "false"}
          className={cn(
            "group relative flex h-7 min-w-25 max-w-44 shrink-0 cursor-default items-center gap-1.5 rounded-md px-2 text-sm outline-none [-webkit-app-region:no-drag]",
            props.active
              ? "composer-surface-tab composer-grain text-text-strong"
              : "text-text-weak hover:bg-surface-base-hover hover:text-text-base",
          )}
          onMouseDown={(event) => {
            if (event.button !== 1) return
            event.preventDefault()
          }}
          onAuxClick={(event) => {
            if (event.button !== 1) return
            event.preventDefault()
            event.stopPropagation()
            props.onClose()
          }}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                role="tab"
                tabIndex={props.active ? 0 : -1}
                aria-selected={props.active}
                className="flex min-w-0 flex-1 items-center gap-1.5 rounded-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                onClick={props.onActivate}
              >
                <Icon className={TAB_ICON_CLASS} />
                <span className="min-w-0 truncate">{props.title}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              {props.title}
            </TooltipContent>
          </Tooltip>
          <button
            type="button"
            aria-label={`Close ${props.title}`}
            className="relative flex size-4 shrink-0 items-center justify-center rounded-sm text-icon-base opacity-0 hover:bg-surface-base-hover hover:text-text-strong group-hover:opacity-100 focus:opacity-100"
            onClick={props.onClose}
          >
            <XIcon className="size-3" />
          </button>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        <ContextMenuGroup>
          <ContextMenuItem onSelect={props.onClose}>Close</ContextMenuItem>
          <ContextMenuItem disabled={props.only} onSelect={props.onCloseOthers}>
            Close others
          </ContextMenuItem>
          <ContextMenuItem disabled={props.last} onSelect={props.onCloseToRight}>
            Close to the right
          </ContextMenuItem>
          <ContextMenuItem onSelect={props.onCloseAll}>Close all</ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  )
}

export function BenchTabs(props: BenchTabsProps) {
  const placement = props.placement ?? "workspace"
  const hasObjectTabs = props.tabs.some((tab) => tab.target.type === "object")
  const objectsQuery = useQuery({
    ...workspaceObjectsQueryOptions(props.directory),
    enabled: hasObjectTabs,
  })
  const objectTitles = useMemo(() => {
    const titles = new Map<string, string>()
    for (const object of objectsQuery.data?.objects ?? []) {
      titles.set(object.objectID, object.title)
    }
    return titles
  }, [objectsQuery.data?.objects])

  if (props.tabs.length === 0) return null

  function handleTablistKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (!(event.target instanceof Element)) return
    const currentTab = event.target.closest<HTMLButtonElement>('[role="tab"]')
    if (!currentTab || !event.currentTarget.contains(currentTab)) return
    const tabElements = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    )
    const currentIndex = tabElements.indexOf(currentTab)
    if (currentIndex === -1 || tabElements.length === 0) return

    let nextIndex: number
    switch (event.key) {
      case TAB_KEY_ARROW_LEFT:
        nextIndex = (currentIndex - 1 + tabElements.length) % tabElements.length
        break
      case TAB_KEY_ARROW_RIGHT:
        nextIndex = (currentIndex + 1) % tabElements.length
        break
      case TAB_KEY_HOME:
        nextIndex = 0
        break
      case TAB_KEY_END:
        nextIndex = tabElements.length - 1
        break
      default:
        return
    }

    const nextTab = props.tabs[nextIndex]
    const nextTabElement = tabElements[nextIndex]
    if (!nextTab || !nextTabElement) return
    event.preventDefault()
    nextTabElement.focus()
    props.onActivate(nextTab.key)
  }

  return (
    <TooltipProvider delayDuration={500}>
      <div
        role="tablist"
        aria-label="Open Bench tabs"
        aria-orientation="horizontal"
        onKeyDown={handleTablistKeyDown}
        data-component="bench-tabs"
        data-placement={placement}
        className={cn(
          "flex shrink-0 items-center bg-background-base px-1 [-webkit-app-region:drag]",
          placement === "titlebar" ? "h-full" : "h-9 border-b border-border-weaker-base",
        )}
      >
        <div className="no-scrollbar scroll-fade-x flex min-w-0 flex-1 gap-1 overflow-x-auto py-1 pl-1">
          {props.tabs.map((tab, index) => {
            const title = resolveBenchTabTitle(tab, objectTitles)
            return (
              <BenchTabItem
                key={tab.key}
                tab={tab}
                title={title}
                active={tab.key === props.activeTabKey}
                last={index === props.tabs.length - 1}
                only={props.tabs.length === 1}
                onActivate={() => props.onActivate(tab.key)}
                onClose={() => props.onClose(tab.key)}
                onCloseOthers={() => props.onCloseOthers(tab.key)}
                onCloseToRight={() => props.onCloseToRight(tab.key)}
                onCloseAll={props.onCloseAll}
              />
            )
          })}
        </div>
      </div>
    </TooltipProvider>
  )
}
