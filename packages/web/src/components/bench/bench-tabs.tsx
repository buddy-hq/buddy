import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type KeyboardEvent,
} from "react"
import "@/components/prompt/composer-surfaces.css"
import "@/components/bench/bench-tabs.css"
import { useQuery } from "@tanstack/react-query"
import { useShallow } from "zustand/react/shallow"
import {
  Button,
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
  ArrowExpand02Icon,
  Bot,
  BookOpenIcon,
  FileIcon,
  FileTextIcon,
  Globe,
  ImageIcon,
  PresentationIcon,
  StudyLampIcon,
  WorkflowIcon,
  XIcon,
} from "@/icons/app-icons"
import type { BenchObjectKind } from "@/lib/bench-navigation"
import { BenchNewTabPopover } from "@/components/bench/bench-new-tab-popover"
import { resolveBenchTabTitle, type BenchTab } from "@/lib/bench-tabs"
import { inAppBrowserFaviconForUrl } from "@/lib/in-app-browser-events"
import { parseSubagentSession } from "@/lib/session-family"
import { useChatStore } from "@/state/chat-store"
import { workspaceObjectsQueryOptions } from "@/state/workspace-objects-query"
import { useInAppBrowserTabsStore } from "@/state/in-app-browser-tabs-store"
import type { InAppBrowserTabRuntime } from "@/state/in-app-browser-tabs-store"

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
  /** Takes the Bench full-window. Absent while the Bench is already immersive. */
  onEnterImmersive?: () => void
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
  browserRuntime?: InAppBrowserTabRuntime
}

const TAB_ICON_CLASS = "size-3.5 shrink-0"
/** A hair under the tab glyphs: the expand arrows run corner to corner, so at
 *  the tab size they read heavier than the tab icons beside them. */
const IMMERSIVE_ICON_CLASS = "size-3 shrink-0"
const IMMERSIVE_LABEL = "Immersive mode"
/** Strip-wide knob read by `.bench-tab` to size each tab; see bench-tabs.css. */
const TAB_COUNT_PROPERTY = "--bench-tab-count"
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
      return WorkflowIcon
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

function benchTabIcon(target: BenchTab["target"]): ComponentType<{ className?: string }> {
  if (target.type === "session") return Bot
  if (target.type === "browser") return Globe
  if (target.type === "workspace-file") {
    return target.viewer === "markdown" ? FileTextIcon : FileIcon
  }
  return objectTabIcon(target.ref.kind)
}

function BrowserTabFavicon(props: {
  runtime: InAppBrowserTabRuntime | undefined
  fallbackUrl: string
}) {
  const url = props.runtime?.url ?? props.fallbackUrl
  const favicon = inAppBrowserFaviconForUrl(props.runtime?.favicon ?? null, url)
  return (
    <BrowserTabFaviconAttempt
      key={favicon?.dataUrl ?? "no-favicon"}
      source={favicon?.dataUrl ?? null}
    />
  )
}

function BrowserTabFaviconAttempt(props: { source: string | null }) {
  const [failed, setFailed] = useState(false)
  if (!props.source || failed) return <Globe className={TAB_ICON_CLASS} />
  return (
    <img
      src={props.source}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={`${TAB_ICON_CLASS} rounded-sm object-contain`}
      onError={() => setFailed(true)}
    />
  )
}

function BenchTabItem(props: BenchTabItemProps) {
  const tabRef = useRef<HTMLDivElement>(null)
  const Icon = benchTabIcon(props.tab.target)

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
            // The whole tab is the click target, but `role="tab"` belongs on the
            // button inside it: a tab's descendants are presentational in the
            // ARIA tree, which would hide the close button from assistive tech,
            // and a keydown handler here would swallow that button's own Enter.
            "bench-tab group relative flex h-7 shrink-0 cursor-default items-center gap-1.5 px-2 text-sm [-webkit-app-region:no-drag]",
            props.active
              ? "composer-surface-tab composer-grain text-text-strong"
              : "text-text-weak hover:bg-surface-base-hover hover:text-text-base",
          )}
          onClick={props.onActivate}
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
              {/* Activation lives here so Enter and Space are the button's own
                  default, not a handler that has to guess where they came from.
                  The click bubbles to the tab, which is what runs `onActivate`. */}
              <button
                type="button"
                role="tab"
                tabIndex={props.active ? 0 : -1}
                aria-selected={props.active}
                className="bench-tab-label flex h-full min-w-0 flex-1 items-center gap-1.5 outline-none"
              >
                {props.tab.target.type === "browser" ? (
                  <BrowserTabFavicon
                    runtime={props.browserRuntime}
                    fallbackUrl={props.tab.target.url}
                  />
                ) : (
                  <Icon className={TAB_ICON_CLASS} />
                )}
                <span className="bench-tab-title min-w-0 flex-1">{props.title}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              {props.title}
            </TooltipContent>
          </Tooltip>
          <button
            type="button"
            aria-label={`Close ${props.title}`}
            className="bench-tab-close relative flex size-4 shrink-0 items-center justify-center rounded-sm text-icon-base opacity-0 hover:bg-surface-base-hover hover:text-text-strong group-hover:opacity-100 focus:opacity-100"
            onClick={(event) => {
              event.stopPropagation()
              props.onClose()
            }}
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
  const sessions = useChatStore((state) => state.directories[props.directory]?.sessions)
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
  const sessionTitles = useMemo(() => {
    const titles = new Map<string, string>()
    for (const session of sessions ?? []) {
      const title = parseSubagentSession(session).title
      if (title) titles.set(session.id, title)
    }
    return titles
  }, [sessions])
  const browserRuntimes = useInAppBrowserTabsStore(
    useShallow((state) => {
      const runtimes = new Map<string, InAppBrowserTabRuntime>()
      for (const tab of props.tabs) {
        if (tab.target.type !== "browser") continue
        const runtime = state.byTabID[tab.target.tabID]
        if (runtime) runtimes.set(tab.target.tabID, runtime)
      }
      return runtimes
    }),
  )
  const browserTitles = useMemo(() => {
    const titles = new Map<string, string>()
    for (const [tabID, runtime] of browserRuntimes) titles.set(tabID, runtime.title)
    return titles
  }, [browserRuntimes])
  const stripStyle: CSSProperties & Record<typeof TAB_COUNT_PROPERTY, string> = {
    [TAB_COUNT_PROPERTY]: String(props.tabs.length),
  }

  if (props.tabs.length === 0) return null

  function handleTablistKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (!(event.target instanceof Element)) return
    const currentTab = event.target.closest<HTMLElement>('[role="tab"]')
    if (!currentTab || !event.currentTarget.contains(currentTab)) return
    const tabElements = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]'),
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
          // The strip needs a definite width for `.bench-tab` sizing, so in the
          // titlebar (a row flex) it grows rather than hugging its content.
          "bench-tab-bar flex items-center bg-background-base pr-1 [-webkit-app-region:drag]",
          // The lead control is a filled chip, so it needs its own breathing room
          // from the bar's edge; a bare tab starts at the tighter default.
          props.onEnterImmersive ? "pl-2" : "pl-1",
          placement === "titlebar"
            ? "h-full min-w-0 flex-1"
            : "h-9 shrink-0 border-b border-border-weaker-base",
        )}
      >
        {/* Leads the strip rather than sitting in the window titlebar: the Bench
            is what expands, so the control belongs to the Bench's own chrome. It
            wears the tab material — a bare glyph in the bar reads as something
            dropped there — but sits a size under the tabs: the fill already
            carries it, and at tab size the chip outweighs the tabs it precedes.
            Filled, it needs no separator either: the strip's own hairlines stand
            down beside any filled shape. */}
        {props.onEnterImmersive ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            data-action="bench-enter-immersive"
            aria-label={IMMERSIVE_LABEL}
            className="composer-surface-tab composer-grain relative size-6 shrink-0 text-icon-base hover:text-text-strong [-webkit-app-region:no-drag]"
            onClick={props.onEnterImmersive}
          >
            <ArrowExpand02Icon className={IMMERSIVE_ICON_CLASS} />
          </Button>
        ) : null}
        <div
          // `pr-1` is the new-tab button's focus ring, which the scroll box
          // would otherwise clip against its own right edge. The left inset drops
          // to a hair after the lead chip: the first tab's own `px-2` already
          // stands its icon off, and the default `pl-1` on top of that left the
          // chip visibly closer to the bar edge than to the tabs.
          className={cn(
            "bench-tab-strip no-scrollbar scroll-fade-x flex min-w-0 flex-1 overflow-x-auto py-1 pr-1",
            props.onEnterImmersive ? "pl-0.5" : "pl-1",
          )}
          style={stripStyle}
        >
          {props.tabs.map((tab, index) => {
            const title = resolveBenchTabTitle(tab, objectTitles, sessionTitles, browserTitles)
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
                browserRuntime={
                  tab.target.type === "browser"
                    ? browserRuntimes.get(tab.target.tabID)
                    : undefined
                }
              />
            )
          })}
          {/* Rides with the tabs rather than sitting at the end of the bar, so it
              stays next to the last tab however few tabs are open. */}
          <span data-component="bench-tabs-new" className="bench-tab-new">
            <BenchNewTabPopover directory={props.directory} />
          </span>
        </div>
        <div aria-hidden data-component="bench-tabs-end" className="bench-tab-end" />
      </div>
    </TooltipProvider>
  )
}
