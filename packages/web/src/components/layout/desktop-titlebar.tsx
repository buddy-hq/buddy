import type { MouseEvent, RefCallback } from "react"
import { useEffect, useState } from "react"
import { useLocation } from "@tanstack/react-router"
import { Button, Z_INDEX, cn } from "@buddy/ui"
import {
  ArrowLeftIcon,
  BookIcon,
  PanelLeftIcon,
  PanelRightIcon,
  SquarePenIcon,
  type AppIcon,
} from "@/icons/app-icons"
import {
  ThreadActionPill,
  ThreadParentReturnButton,
} from "@/components/directory-chat/thread-titlebar-controls"
import { ThreadHistoryPopover } from "@/components/directory-chat/thread-history-popover"
import type { SessionInfo } from "@/state/chat-types"
import { language } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { BENCH_DOCK_FLOATING_CHAT_EVENT } from "@/lib/bench-navigation"
import { useUiPreferences } from "@/state/ui-preferences"
import { RIGHT_WORKSPACE_RAIL_WIDTH_PX } from "@/lib/directory-chat/right-workspace-layout"
import {
  isBenchToggleEventTarget,
  logBenchToggleDomEvent,
  logBenchToggleStep,
} from "@/lib/bench-toggle-diagnostics"
import { isTitlebarInteractiveTarget } from "./desktop-titlebar-helpers"
import { DESKTOP_TITLEBAR_HEIGHT_PX } from "./desktop-titlebar-inset"
import { TextShimmer } from "@/components/chat/tools/text-shimmer"
import { parseTBoolean, parseTJsonObject } from "@/components/chat/tools/types"

function onDockFloatingBench() {
  window.dispatchEvent(new CustomEvent(BENCH_DOCK_FLOATING_CHAT_EVENT))
}

type DesktopTitlebarProps = {
  placement?: "root" | "chat" | "settings"
  chatTitle?: string
  projectName?: string
  isTurnActive?: boolean
  variant?: "chat" | "shell"
  leftSidebarOpen?: boolean
  rightWorkspaceOpen?: boolean
  onLeftSidebarToggle?: () => void
  onRightWorkspaceToggle?: () => void
  showThreadBrowser?: boolean
  showSidebarThreadControls?: boolean
  sessions?: SessionInfo[]
  activeSessionID?: string
  linkedSessionID?: string
  parentSession?: SessionInfo
  onNewSession?: () => void | Promise<void>
  onSelectSession?: (sessionID: string) => void | Promise<void>
  showDockFloatingBench?: boolean
  showSidebarToggles?: boolean
  rootContentRef?: RefCallback<HTMLDivElement>
}

export const MAC_WINDOW_CONTROL_INSET_WIDTH = 90
const MAC_WINDOW_CONTROL_INSET_CLASS = "w-[90px]"

// Fixed toggle left positions
const CHAT_SIDEBAR_TOGGLE_LEFT_MAC_PX = MAC_WINDOW_CONTROL_INSET_WIDTH
const CHAT_SIDEBAR_TOGGLE_LEFT_DEFAULT_PX = 8
/** One cluster control is `w-8`; the pill adds a 1px border on each side. */
const TITLEBAR_CLUSTER_BUTTON_WIDTH_PX = 32
const TITLEBAR_CLUSTER_PILL_BORDER_PX = 2
const TITLEBAR_CLUSTER_GAP_PX = 4
const TITLEBAR_NON_MAC_RIGHT_MARGIN_PX = 8
const WINDOWS_CAPTION_CONTROLS_INSET_WIDTH_PX = 140
export const WINDOWS_CHAT_TITLEBAR_RIGHT_CONTROLS_INSET_PX =
  WINDOWS_CAPTION_CONTROLS_INSET_WIDTH_PX +
  TITLEBAR_CLUSTER_BUTTON_WIDTH_PX +
  TITLEBAR_CLUSTER_GAP_PX * 2 +
  TITLEBAR_NON_MAC_RIGHT_MARGIN_PX * 2
/** Breathing room between the fixed left cluster and the title that follows it. */
const CHAT_SIDEBAR_TOGGLE_TITLE_GAP_PX = 10
/**
 * On macOS nothing else occupies the top-right, so the workspace toggle can sit exactly above the
 * right workspace rail. The rail is flush to the window edge and centres its buttons, so its icon
 * column sits RIGHT_WORKSPACE_RAIL_WIDTH_PX / 2 from that edge — this is the margin that puts the
 * toggle's centre on the same axis. Windows keeps the default inset: the native caption buttons
 * own that corner, so the toggle can never reach the rail there.
 */
const RIGHT_TOGGLE_RAIL_ALIGNED_MARGIN_PX =
  RIGHT_WORKSPACE_RAIL_WIDTH_PX / 2 - TITLEBAR_CLUSTER_BUTTON_WIDTH_PX / 2

/** 14px glyphs; the default stroke scales with size. */
const TITLEBAR_ICON_SIZE_CLASS = "size-3.5 shrink-0"
const DOCK_BENCH_ICON_SIZE_CLASS = "size-4 shrink-0"
const DOCK_BENCH_ICON_STROKE_WIDTH = 2.5
// No inset padding — hover fills flush with the outer rounded border (no halo gap).
const TITLEBAR_TOGGLE_PILL_CLASS =
  "flex shrink-0 items-center overflow-hidden rounded-full border border-border-weaker-base bg-surface-raised-base/60 p-0 shadow-xs [-webkit-app-region:no-drag]"

// The hairline is a real `border-b`, not a shadow layer: a box-shadow paints outside the element,
// so the bench/chat content below paints straight over it. A border draws inside the box and can't
// be covered. It is always present at 1px and only its colour changes, so nothing reflows when the
// bench opens — and `border-color` interpolates, so the rule still fades rather than snapping in.
// The soft falloff stays a shadow (it is meant to bleed past the edge); `relative` keeps it above
// the in-flow content, with no z-index so the fixed toggle's stacking stays global.
const TITLEBAR_SEPARATOR_BASE_CLASS =
  "relative border-b transition-[border-color,box-shadow] duration-200 ease-out motion-reduce:transition-none"

// One layer, offset well clear of the edge and pulled in by a negative spread, so it reads as
// light falling onto the content below. A tight contact layer at the boundary instead darkens the
// seam itself, which makes the titlebar and the chat area look like different fills when they are
// both bg-background-base.
const TITLEBAR_SEPARATOR_SHADOW_CLASS =
  "border-transparent shadow-[0_4px_10px_-4px_color-mix(in_oklab,var(--surface-strong)_18%,transparent)]"

const TITLEBAR_SEPARATOR_BORDER_CLASS =
  "border-border-weaker-base shadow-[0_4px_10px_-4px_transparent]"

/**
 * Hard rule whenever the titlebar meets a hard layout edge — the bench split, or chat content
 * running to the window's left edge with the sidebar collapsed. Both need a crisp boundary that a
 * soft falloff can't provide. The shadow is for the one case where the titlebar floats over a
 * single uninterrupted surface: sidebar open, bench closed.
 */
function titlebarSeparatorClass(hardEdge: boolean) {
  return `${TITLEBAR_SEPARATOR_BASE_CLASS} ${
    hardEdge ? TITLEBAR_SEPARATOR_BORDER_CLASS : TITLEBAR_SEPARATOR_SHADOW_CLASS
  }`
}

function titlebarToggleButtonClass(inPill: boolean) {
  return cn(
    "box-border h-6 w-8 p-0 text-icon-base hover:bg-surface-raised-base-hover hover:text-text-strong [-webkit-app-region:no-drag]",
    inPill ? "rounded-none" : "rounded-full",
  )
}

/** 14px icons with the default scaled stroke. */
function TitlebarIcon(props: { icon: AppIcon }) {
  const Icon = props.icon
  return <Icon className={TITLEBAR_ICON_SIZE_CLASS} />
}

export function DesktopTitlebar(props: DesktopTitlebarProps) {
  const placement = props.placement ?? "root"
  const location = useLocation()
  const platform = usePlatform()
  const isDesktop = platform.platform === "desktop"
  const isMac = isDesktop && platform.os === "macos"
  const isWindows = isDesktop && platform.os === "windows"
  const pathname = location.pathname
  const leftSidebarOpen = useUiPreferences((state) => state.leftSidebarOpen)
  const setLeftSidebarOpen = useUiPreferences((state) => state.setLeftSidebarOpen)
  const rightWorkspaceOpen = props.rightWorkspaceOpen ?? false
  const [isFullscreen, setIsFullscreen] = useState(false)
  const resolvedLeftSidebarOpen = props.leftSidebarOpen ?? leftSidebarOpen
  const showSidebarToggles =
    props.showSidebarToggles ??
    (placement === "chat" || (pathname !== "/chat" && pathname.endsWith("/chat")))
  // In chat placement the toggle is a fixed element inside the header — not in the flow
  const showLeftSidebarToggle = placement === "chat" ? false : showSidebarToggles
  const shouldReserveMacWindowControls = placement === "root" ? isMac && !isFullscreen : false
  // Fixed left cluster: the sidebar toggle, plus new-chat when it applies. New chat appears when
  // the sidebar is collapsed unless the contextual thread browser is present; that browser owns
  // session creation alongside history and the current-chat control. The pill is grouping chrome,
  // so it only appears once there is a second control to group with — the immersive control that
  // used to sit here now leads the Bench tab strip.
  const showNewChatInLeftCluster =
    Boolean(props.onNewSession) && !resolvedLeftSidebarOpen && !props.showThreadBrowser
  const chatLeftClusterUsesPill = showNewChatInLeftCluster
  const chatLeftClusterWidth =
    (1 + (showNewChatInLeftCluster ? 1 : 0)) * TITLEBAR_CLUSTER_BUTTON_WIDTH_PX +
    (chatLeftClusterUsesPill ? TITLEBAR_CLUSTER_PILL_BORDER_PX : 0)
  // This spacer clears the fixed cluster from the title in all desktop variants. Its width snaps
  // with the sidebar column so the titlebar and transcript share one layout frame — derived from
  // the cluster's actual control count so adding a control can't silently overlap the title.
  //   Sidebar open (Col 2 at x≥280): 0px — the cluster sits inside the sidebar area
  const chatToggleLeft =
    isMac && !isFullscreen ? CHAT_SIDEBAR_TOGGLE_LEFT_MAC_PX : CHAT_SIDEBAR_TOGGLE_LEFT_DEFAULT_PX
  const chatLeftSpacerWidth =
    placement === "chat" && isDesktop
      ? resolvedLeftSidebarOpen
        ? 0
        : chatToggleLeft + chatLeftClusterWidth + CHAT_SIDEBAR_TOGGLE_TITLE_GAP_PX
      : 0

  useEffect(() => {
    if (!isMac) return
    void platform.getIsFullscreen?.().then((v) => {
      const nextIsFullscreen = parseTBoolean(v)
      if (nextIsFullscreen !== undefined) setIsFullscreen(nextIsFullscreen)
    })
    const handler = (e: Event) => {
      if (!(e instanceof CustomEvent)) return
      const nextIsFullscreen = parseTBoolean(parseTJsonObject(e.detail)?.isFullscreen)
      if (nextIsFullscreen !== undefined) {
        setIsFullscreen(nextIsFullscreen)
      }
    }
    window.addEventListener("buddy:fullscreen-changed", handler)
    return () => window.removeEventListener("buddy:fullscreen-changed", handler)
  }, [isMac, platform])

  useEffect(() => {
    logBenchToggleStep("desktop-titlebar-state", {
      placement,
      variant: props.variant ?? "chat",
      pathname,
      isDesktop,
      isMac,
      isWindows,
      showSidebarToggles,
      hasRightWorkspaceCallback: props.onRightWorkspaceToggle !== undefined,
      rightWorkspaceOpen,
      showDockFloatingBench: props.showDockFloatingBench === true,
    })
  }, [
    isDesktop,
    isMac,
    isWindows,
    pathname,
    placement,
    props.onRightWorkspaceToggle,
    props.showDockFloatingBench,
    props.variant,
    rightWorkspaceOpen,
    showSidebarToggles,
  ])

  useEffect(() => {
    if (!isDesktop || !showSidebarToggles) return

    function onDocumentPointerDown(event: PointerEvent) {
      if (!isBenchToggleEventTarget(event.target)) return
      logBenchToggleDomEvent("document-pointerdown-capture", event)
    }

    function onDocumentMouseDown(event: globalThis.MouseEvent) {
      if (!isBenchToggleEventTarget(event.target)) return
      logBenchToggleDomEvent("document-mousedown-capture", event)
    }

    function onDocumentMouseUp(event: globalThis.MouseEvent) {
      if (!isBenchToggleEventTarget(event.target)) return
      logBenchToggleDomEvent("document-mouseup-capture", event)
    }

    function onDocumentClick(event: globalThis.MouseEvent) {
      if (!isBenchToggleEventTarget(event.target)) return
      logBenchToggleDomEvent("document-click-capture", event)
    }

    document.addEventListener("pointerdown", onDocumentPointerDown, true)
    document.addEventListener("mousedown", onDocumentMouseDown, true)
    document.addEventListener("mouseup", onDocumentMouseUp, true)
    document.addEventListener("click", onDocumentClick, true)
    return () => {
      document.removeEventListener("pointerdown", onDocumentPointerDown, true)
      document.removeEventListener("mousedown", onDocumentMouseDown, true)
      document.removeEventListener("mouseup", onDocumentMouseUp, true)
      document.removeEventListener("click", onDocumentClick, true)
    }
  }, [isDesktop, showSidebarToggles])

  if (!isMac && !isWindows) {
    return null
  }

  function onToggleRightWorkspace() {
    const commandType = rightWorkspaceOpen ? "collapse" : "reveal"
    logBenchToggleStep("desktop-titlebar-right-toggle-handler-entry", {
      placement,
      variant: props.variant ?? "chat",
      pathname,
      rightWorkspaceOpen,
      commandType,
      hasRightWorkspaceCallback: props.onRightWorkspaceToggle !== undefined,
    })

    if (props.onRightWorkspaceToggle) {
      logBenchToggleStep("desktop-titlebar-right-toggle-calling-prop-callback", {
        commandType,
      })
      props.onRightWorkspaceToggle()
      logBenchToggleStep("desktop-titlebar-right-toggle-prop-callback-returned", {
        commandType,
      })
      return
    }

    logBenchToggleStep("desktop-titlebar-right-toggle-no-target", {
      commandType,
    })
    return
  }

  function onToggleLeftSidebar() {
    if (props.onLeftSidebarToggle) {
      props.onLeftSidebarToggle()
      return
    }

    setLeftSidebarOpen(!resolvedLeftSidebarOpen)
  }

  function onMouseDown(event: MouseEvent<HTMLElement>) {
    if (!platform.startWindowDragging) return
    if (event.buttons !== 1) return
    if (isTitlebarInteractiveTarget(event.target)) return

    event.preventDefault()
    void platform.startWindowDragging().catch(() => undefined)
  }

  function onDoubleClick(event: MouseEvent<HTMLElement>) {
    if (!platform.toggleWindowMaximize) return
    if (isTitlebarInteractiveTarget(event.target)) return

    event.preventDefault()
    void platform.toggleWindowMaximize().catch(() => undefined)
  }

  const rightWorkspaceToggle = showSidebarToggles ? (
    <div
      data-titlebar-no-drag
      className={cn(
        "flex shrink-0 items-center gap-1 motion-reduce:transition-none [-webkit-app-region:no-drag]",
        // On mac the outer container owns the right offset so the toggle lands on the rail axis.
        isMac ? undefined : "mr-2",
      )}
      onPointerDownCapture={(event) =>
        logBenchToggleDomEvent("right-toggle-wrapper-pointerdown-capture", event)
      }
      onMouseDownCapture={(event) =>
        logBenchToggleDomEvent("right-toggle-wrapper-mousedown-capture", event)
      }
      onClickCapture={(event) =>
        logBenchToggleDomEvent("right-toggle-wrapper-click-capture", event)
      }
    >
      {/* Solo control — no pill chrome. */}
      <Button
        type="button"
        data-action="titlebar-toggle-right-workspace"
        variant="ghost"
        className={cn(titlebarToggleButtonClass(false), "relative text-icon-base")}
        aria-label={
          rightWorkspaceOpen
            ? language.t("desktopTitlebar.collapseRightPanel")
            : language.t("desktopTitlebar.expandRightPanel")
        }
        aria-expanded={rightWorkspaceOpen}
        title={
          rightWorkspaceOpen
            ? language.t("desktopTitlebar.collapseRightPanel")
            : language.t("desktopTitlebar.expandRightPanel")
        }
        onPointerDownCapture={(event) =>
          logBenchToggleDomEvent("right-toggle-button-pointerdown-capture", event)
        }
        onMouseDownCapture={(event) =>
          logBenchToggleDomEvent("right-toggle-button-mousedown-capture", event)
        }
        onMouseUpCapture={(event) =>
          logBenchToggleDomEvent("right-toggle-button-mouseup-capture", event)
        }
        onClickCapture={(event) =>
          logBenchToggleDomEvent("right-toggle-button-click-capture", event)
        }
        onClick={onToggleRightWorkspace}
      >
        <TitlebarIcon icon={PanelRightIcon} />
      </Button>
    </div>
  ) : null

  const isShellVariant = props.variant === "shell"
  // The collapsed-sidebar term only applies in chat placement — root/settings have no left sidebar,
  // so the persisted preference there would flip the separator for a panel that isn't rendered.
  const hasHardBottomEdge = rightWorkspaceOpen || (placement === "chat" && !resolvedLeftSidebarOpen)
  const separatorClass = isShellVariant ? "" : titlebarSeparatorClass(hasHardBottomEdge)
  const leftSidebarToggleButton = (
    <Button
      type="button"
      data-action="titlebar-toggle-left-sidebar"
      variant="ghost"
      className={titlebarToggleButtonClass(false)}
      aria-label={
        resolvedLeftSidebarOpen
          ? language.t("desktopTitlebar.collapseLeftPanel")
          : language.t("desktopTitlebar.expandLeftPanel")
      }
      aria-expanded={resolvedLeftSidebarOpen}
      title={
        resolvedLeftSidebarOpen
          ? language.t("desktopTitlebar.collapseLeftPanel")
          : language.t("desktopTitlebar.expandLeftPanel")
      }
      onClick={onToggleLeftSidebar}
    >
      <TitlebarIcon icon={PanelLeftIcon} />
    </Button>
  )
  return (
    <header
      data-component="desktop-titlebar"
      data-variant={props.variant ?? "chat"}
      className={`shrink-0 ${separatorClass} bg-background-base text-text-base select-none [-webkit-app-region:drag]`}
      style={{ height: DESKTOP_TITLEBAR_HEIGHT_PX }}
      onPointerDownCapture={(event) => {
        if (!isBenchToggleEventTarget(event.target)) return
        logBenchToggleDomEvent("desktop-titlebar-pointerdown-capture", event)
      }}
      onMouseDownCapture={(event) => {
        if (!isBenchToggleEventTarget(event.target)) return
        logBenchToggleDomEvent("desktop-titlebar-mousedown-capture", event)
      }}
      onMouseUpCapture={(event) => {
        if (!isBenchToggleEventTarget(event.target)) return
        logBenchToggleDomEvent("desktop-titlebar-mouseup-capture", event)
      }}
      onClickCapture={(event) => {
        if (!isBenchToggleEventTarget(event.target)) return
        logBenchToggleDomEvent("desktop-titlebar-click-capture", event)
      }}
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
    >
      {/* Chat-placement fixed sidebar toggle — rendered inside this drag header so Electron's
          webkit-app-region exclusion recognises it as a no-drag child of the drag region. */}
      {placement === "chat" && isDesktop ? (
        <div
          style={{
            position: "fixed",
            // Match the titlebar row: full bar height + flex center (same as in-flow controls).
            // Previous top math used a 30px assumed height while buttons are h-6 (24px), so the pill sat high.
            top: 0,
            height: DESKTOP_TITLEBAR_HEIGHT_PX,
            left:
              isMac && !isFullscreen
                ? CHAT_SIDEBAR_TOGGLE_LEFT_MAC_PX
                : CHAT_SIDEBAR_TOGGLE_LEFT_DEFAULT_PX,
            zIndex: Z_INDEX.applicationChrome,
            transition: "none",
          }}
          className="motion-reduce:transition-none [-webkit-app-region:no-drag] flex items-center gap-1.5"
        >
          <div
            data-component="chat-titlebar-left-cluster"
            data-pill={chatLeftClusterUsesPill ? "true" : "false"}
            className={
              chatLeftClusterUsesPill ? TITLEBAR_TOGGLE_PILL_CLASS : "flex shrink-0 items-center"
            }
          >
            <Button
              type="button"
              data-action="chat-toggle-left-sidebar"
              variant="ghost"
              className={titlebarToggleButtonClass(chatLeftClusterUsesPill)}
              aria-label={
                resolvedLeftSidebarOpen
                  ? language.t("desktopTitlebar.collapseLeftPanel")
                  : language.t("desktopTitlebar.expandLeftPanel")
              }
              aria-expanded={resolvedLeftSidebarOpen}
              title={
                resolvedLeftSidebarOpen
                  ? language.t("desktopTitlebar.collapseLeftPanel")
                  : language.t("desktopTitlebar.expandLeftPanel")
              }
              onClick={onToggleLeftSidebar}
            >
              <TitlebarIcon icon={PanelLeftIcon} />
            </Button>
            {showNewChatInLeftCluster ? (
              <Button
                type="button"
                data-action="chat-new-session"
                variant="ghost"
                className={titlebarToggleButtonClass(chatLeftClusterUsesPill)}
                aria-label={language.t("sidebar.newChat")}
                title={language.t("sidebar.newChat")}
                onClick={() => void props.onNewSession?.()}
              >
                <TitlebarIcon icon={SquarePenIcon} />
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="flex h-full items-center">
        {shouldReserveMacWindowControls ? (
          <div className={`${MAC_WINDOW_CONTROL_INSET_CLASS} shrink-0`} />
        ) : null}
        {placement === "root" && props.showDockFloatingBench ? (
          <div className="ml-2 flex shrink-0 items-center [-webkit-app-region:no-drag]">
            {/* Solo control — no pill chrome. */}
            <Button
              type="button"
              data-action="titlebar-dock-floating-bench"
              variant="ghost"
              className={cn(titlebarToggleButtonClass(false), "text-text-strong")}
              aria-label={language.t("sidebar.dockChat")}
              title={language.t("sidebar.dockChat")}
              onClick={onDockFloatingBench}
            >
              <ArrowLeftIcon
                className={DOCK_BENCH_ICON_SIZE_CLASS}
                strokeWidth={DOCK_BENCH_ICON_STROKE_WIDTH}
              />
            </Button>
          </div>
        ) : null}
        {placement === "chat" && isDesktop ? (
          <div
            data-component="desktop-titlebar-chat-left-spacer"
            className="shrink-0 transition-none"
            style={{ width: chatLeftSpacerWidth }}
          />
        ) : null}
        {showLeftSidebarToggle ? (
          <div className="ml-2 flex shrink-0 items-center">{leftSidebarToggleButton}</div>
        ) : null}
        {placement === "root" ? (
          <div
            ref={props.rootContentRef}
            data-component="desktop-titlebar-root-content"
            className="flex h-full min-w-0 flex-1 items-stretch overflow-hidden"
          />
        ) : (
          !isShellVariant &&
          (placement === "chat" ? (
            <div className="flex min-w-0 flex-1 items-stretch">
              {props.showThreadBrowser ? (
                <div className="flex min-w-0 items-center gap-1 pl-3 pr-1 shrink">
                  <ThreadParentReturnButton
                    parentSession={props.parentSession}
                    onSelectSession={props.onSelectSession}
                    className="[-webkit-app-region:no-drag]"
                  />

                  <ThreadActionPill
                    sessions={props.sessions ?? []}
                    activeSessionID={props.activeSessionID}
                    linkedSessionID={props.linkedSessionID}
                    onSelectSession={props.onSelectSession ?? (() => undefined)}
                    notebookName={props.projectName}
                    onNewSession={props.onNewSession}
                    showHistory
                    size="titlebar"
                    title={props.chatTitle}
                    titleActive={props.isTurnActive}
                    className="[-webkit-app-region:no-drag]"
                  />
                </div>
              ) : null}

              {/* The sidebar already names the directory, so this stands in for it only while the
                  sidebar is collapsed — otherwise the name is on screen twice. It also owns the
                  thread switcher: clicking it opens the history popover, which used to open on
                  hovering the title. A hover target that large opened the panel by accident. */}
              {props.projectName && !props.showThreadBrowser && !resolvedLeftSidebarOpen ? (
                <div className="shrink-0 overflow-hidden max-w-[12rem] transition-[max-width] duration-150 ease-in hover:max-w-[20rem] hover:duration-300 hover:ease-out [-webkit-app-region:no-drag] flex items-center border-r border-border-weaker-base [box-shadow:-2px_0_4px_rgba(0,0,0,0.08)]">
                  {props.onSelectSession ? (
                    <ThreadHistoryPopover
                      sessions={props.sessions ?? []}
                      activeSessionID={props.activeSessionID}
                      linkedSessionID={props.linkedSessionID}
                      onSelectSession={props.onSelectSession}
                      notebookName={props.projectName}
                      trigger={
                        <button
                          type="button"
                          data-action="titlebar-notebook-threads"
                          className="flex min-w-0 items-center gap-1.5 pl-4 pr-3 text-xs font-medium text-text-weak transition-colors hover:text-text-base [-webkit-app-region:no-drag]"
                          aria-label={language.t("sidebar.showAllThreads")}
                        >
                          <BookIcon className={TITLEBAR_ICON_SIZE_CLASS} />
                          <span className="block min-w-0 truncate">{props.projectName}</span>
                        </button>
                      }
                    />
                  ) : (
                    <span className="flex min-w-0 items-center gap-1.5 pl-4 pr-3 text-xs font-medium text-text-weak select-none">
                      <BookIcon className={TITLEBAR_ICON_SIZE_CLASS} />
                      <span className="block min-w-0 truncate">{props.projectName}</span>
                    </span>
                  )}
                </div>
              ) : null}

              {!props.showThreadBrowser ? (
                <h1 className="min-w-0 max-w-[24rem] self-center truncate px-4 text-sm font-medium text-text-strong">
                  {props.chatTitle ? (
                    <TextShimmer text={props.chatTitle} active={props.isTurnActive ?? false} />
                  ) : null}
                </h1>
              ) : null}
              <div className="min-w-0 flex-1" />
            </div>
          ) : (
            <div className="min-w-0 flex-1" />
          ))
        )}
        <div
          data-titlebar-no-drag
          className={cn(
            "flex shrink-0 items-center gap-1 ml-auto [-webkit-app-region:no-drag]",
            isMac ? undefined : "mr-2",
            placement === "chat" && isDesktop ? "fixed top-0" : undefined,
          )}
          style={
            placement === "chat" && isDesktop
              ? {
                  right: isMac ? RIGHT_TOGGLE_RAIL_ALIGNED_MARGIN_PX : 0,
                  height: DESKTOP_TITLEBAR_HEIGHT_PX,
                  zIndex: Z_INDEX.applicationChrome,
                }
              : isMac
                ? { marginRight: RIGHT_TOGGLE_RAIL_ALIGNED_MARGIN_PX }
                : undefined
          }
        >
          {!isShellVariant && rightWorkspaceToggle}

          {isWindows ? (
            <>
              <div
                className="shrink-0"
                style={{ width: WINDOWS_CAPTION_CONTROLS_INSET_WIDTH_PX }}
              />
              <div
                data-component="titlebar-system-controls-mount"
                data-titlebar-no-drag
                className="flex shrink-0 flex-row [-webkit-app-region:no-drag]"
                style={{ height: DESKTOP_TITLEBAR_HEIGHT_PX }}
              />
            </>
          ) : null}
        </div>
      </div>
    </header>
  )
}
