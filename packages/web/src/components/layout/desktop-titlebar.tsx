import type { MouseEvent } from "react"
import { useEffect, useState } from "react"
import { useLocation } from "@tanstack/react-router"
import { Button, cn } from "@buddy/ui"
import {
  ArrowLeftIcon,
  PanelLeftIcon,
  PanelRightIcon,
  PictureInPicture2Icon,
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
import {
  isBenchToggleEventTarget,
  logBenchToggleDomEvent,
  logBenchToggleStep,
} from "@/lib/bench-toggle-diagnostics"
import { isTitlebarInteractiveTarget } from "./desktop-titlebar-helpers"
import { TextShimmer } from "@/components/chat/tools/text-shimmer"

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
  onFloatChat?: () => void
  showDockFloatingBench?: boolean
}

const ROOT_TITLEBAR_HEIGHT_CLASS = "h-10"
const CHAT_TITLEBAR_HEIGHT_CLASS = "h-[52px]"
const CHAT_TITLEBAR_HEIGHT_PX = 52
export const MAC_WINDOW_CONTROL_INSET_WIDTH = 90
const MAC_WINDOW_CONTROL_INSET_CLASS = "w-[90px]"

// When sidebar is closed, reserve space for the fixed toggle/pop-out pill plus a title gap.
const CHAT_SIDEBAR_TOGGLE_RESERVED_PX = 76
// Fixed toggle left positions
const CHAT_SIDEBAR_TOGGLE_LEFT_MAC_PX = MAC_WINDOW_CONTROL_INSET_WIDTH
const CHAT_SIDEBAR_TOGGLE_LEFT_DEFAULT_PX = 8

/** 14px glyphs; the default stroke scales with size. */
const TITLEBAR_ICON_SIZE_CLASS = "size-3.5 shrink-0"
// No inset padding — hover fills flush with the outer rounded border (no halo gap).
const TITLEBAR_TOGGLE_PILL_CLASS =
  "flex shrink-0 items-center overflow-hidden rounded-full border border-border-weaker-base bg-surface-raised-base/60 p-0 shadow-xs [-webkit-app-region:no-drag]"

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
  const titlebarHeightClass =
    placement === "chat" || (placement === "root" && props.showDockFloatingBench)
      ? CHAT_TITLEBAR_HEIGHT_CLASS
      : ROOT_TITLEBAR_HEIGHT_CLASS
  const rightWorkspaceOpen = props.rightWorkspaceOpen ?? false
  const [isFullscreen, setIsFullscreen] = useState(false)
  const resolvedLeftSidebarOpen = props.leftSidebarOpen ?? leftSidebarOpen
  const showSidebarToggles =
    placement === "chat" || (pathname !== "/chat" && pathname.endsWith("/chat"))
  // In chat placement the toggle is a fixed element inside the header — not in the flow
  const showLeftSidebarToggle = placement === "chat" ? false : showSidebarToggles
  const shouldReserveMacWindowControls = placement === "root" ? isMac && !isFullscreen : false
  // Animated spacer clears the fixed toggle from the title in ALL desktop variants:
  //   Mac non-fullscreen closed: 90px (traffic lights) + 40px (toggle + gap) = 130px
  //   Mac fullscreen / Windows closed: 8px (toggle left) + 40px (toggle + gap) = 48px
  //   Sidebar open (Col 2 at x≥280): 0px — toggle is inside the sidebar area
  const chatToggleLeft =
    isMac && !isFullscreen ? CHAT_SIDEBAR_TOGGLE_LEFT_MAC_PX : CHAT_SIDEBAR_TOGGLE_LEFT_DEFAULT_PX
  const chatLeftSpacerWidth =
    placement === "chat" && isDesktop
      ? resolvedLeftSidebarOpen
        ? 0
        : chatToggleLeft + CHAT_SIDEBAR_TOGGLE_RESERVED_PX
      : 0

  useEffect(() => {
    if (!isMac) return
    void platform.getIsFullscreen?.().then((v) => {
      if (typeof v === "boolean") setIsFullscreen(v)
    })
    const handler = (e: Event) => {
      if (!(e instanceof CustomEvent)) return
      const nextIsFullscreen = e.detail?.isFullscreen
      if (typeof nextIsFullscreen === "boolean") {
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

  function onDockFloatingBench() {
    window.dispatchEvent(new CustomEvent(BENCH_DOCK_FLOATING_CHAT_EVENT))
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
      className="mr-2 flex shrink-0 items-center gap-1 motion-reduce:transition-none [-webkit-app-region:no-drag]"
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
  const borderClass = isShellVariant ? "" : "border-b border-border-weaker-base"
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
  const showChatFloatInLeftCluster = Boolean(
    props.onFloatChat && (props.showSidebarThreadControls || props.showThreadBrowser),
  )
  const chatLeftClusterUsesPill = showChatFloatInLeftCluster
  return (
    <header
      data-component="desktop-titlebar"
      data-variant={props.variant ?? "chat"}
      className={`shrink-0 ${borderClass} bg-background-base text-text-base select-none [-webkit-app-region:drag] ${titlebarHeightClass}`}
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
            height: CHAT_TITLEBAR_HEIGHT_PX,
            left:
              isMac && !isFullscreen
                ? CHAT_SIDEBAR_TOGGLE_LEFT_MAC_PX
                : CHAT_SIDEBAR_TOGGLE_LEFT_DEFAULT_PX,
            zIndex: 50,
            transition: "left 200ms ease-out",
          }}
          className="motion-reduce:transition-none [-webkit-app-region:no-drag] flex items-center gap-1.5"
        >
          <div
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
            {showChatFloatInLeftCluster ? (
              <Button
                type="button"
                data-action="chat-pop-out"
                variant="ghost"
                className={titlebarToggleButtonClass(true)}
                aria-label={language.t("sidebar.popOutChat")}
                title={language.t("sidebar.popOutChat")}
                onClick={props.onFloatChat}
              >
                <PictureInPicture2Icon className={TITLEBAR_ICON_SIZE_CLASS} />
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
              className={titlebarToggleButtonClass(false)}
              aria-label={language.t("sidebar.dockChat")}
              title={language.t("sidebar.dockChat")}
              onClick={onDockFloatingBench}
            >
              <TitlebarIcon icon={ArrowLeftIcon} />
            </Button>
          </div>
        ) : null}
        {placement === "chat" && isDesktop ? (
          <div
            className="shrink-0 transition-[width] duration-200 ease-out motion-reduce:transition-none"
            style={{ width: chatLeftSpacerWidth }}
          />
        ) : null}
        {showLeftSidebarToggle ? (
          <div className="ml-2 flex shrink-0 items-center">{leftSidebarToggleButton}</div>
        ) : null}
        {!isShellVariant &&
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

              {props.projectName && !props.showThreadBrowser ? (
                <div className="shrink-0 overflow-hidden max-w-[12rem] transition-[max-width] duration-150 ease-in hover:max-w-[20rem] hover:duration-300 hover:ease-out [-webkit-app-region:no-drag] flex items-center border-r border-border-weaker-base [box-shadow:-2px_0_4px_rgba(0,0,0,0.08)]">
                  <span className="block truncate pl-4 pr-3 text-xs font-medium text-text-weak select-none">
                    {props.projectName}
                  </span>
                </div>
              ) : null}

              {!props.showThreadBrowser && props.chatTitle && props.onSelectSession ? (
                <ThreadHistoryPopover
                  sessions={props.sessions ?? []}
                  activeSessionID={props.activeSessionID}
                  linkedSessionID={props.linkedSessionID}
                  onSelectSession={props.onSelectSession ?? (() => undefined)}
                  notebookName={props.projectName}
                  openOnTriggerHover
                  trigger={
                    <button
                      type="button"
                      className="min-w-0 max-w-[24rem] self-center truncate px-4 text-left text-sm font-medium text-text-strong transition-colors hover:text-text-base [-webkit-app-region:no-drag]"
                      aria-label={language.t("sidebar.showAllThreads")}
                    >
                      <TextShimmer text={props.chatTitle} active={props.isTurnActive ?? false} />
                    </button>
                  }
                />
              ) : !props.showThreadBrowser ? (
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
          ))}
        <div
          data-titlebar-no-drag
          className="flex shrink-0 items-center gap-1 mr-2 ml-auto [-webkit-app-region:no-drag]"
        >
          {!isShellVariant && rightWorkspaceToggle}

          {isWindows ? (
            <>
              <div className="w-[140px] shrink-0" />
              <div
                data-component="titlebar-system-controls-mount"
                data-titlebar-no-drag
                className={`flex shrink-0 flex-row [-webkit-app-region:no-drag] ${titlebarHeightClass}`}
              />
            </>
          ) : null}
        </div>
      </div>
    </header>
  )
}
