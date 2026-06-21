import type { MouseEvent } from "react"
import { useEffect, useState } from "react"
import { useLocation, useRouterState } from "@tanstack/react-router"
import { Button, MoveLeftIcon } from "@buddy/ui"
import { type LucideIcon } from "lucide-react"
import { language } from "@/context/language"
import { usePlatform } from "@/context/platform"
import {
  BENCH_CHAT_LAYOUT_FLOATING,
  BENCH_CHAT_SEARCH_PARAM,
  isBenchRoutePathname,
  readBenchChatLayoutMode,
} from "@/lib/bench-navigation"
import { useDirectoryWorkspaceOptional } from "@/components/directory-chat/directory-workspace-context"
import { useUiPreferences } from "@/state/ui-preferences"
import { WORKSPACE_VISIBILITY_EXPANDED } from "@/state/directory-workspace-store"
import {
  isBenchToggleEventTarget,
  logBenchToggleDomEvent,
  logBenchToggleStep,
} from "@/lib/bench-toggle-diagnostics"
import { isTitlebarInteractiveTarget } from "./desktop-titlebar-helpers"
import {
  LayoutLeftIcon,
  LayoutLeftPartialIcon,
  LayoutRightIcon,
  LayoutRightPartialIcon,
} from "./sidebar-icons"
import { TextShimmer } from "@/components/chat/tools/text-shimmer"

type DesktopTitlebarProps = {
  placement?: "root" | "chat" | "settings"
  chatTitle?: string
  projectName?: string
  isTurnActive?: boolean
  variant?: "chat" | "shell"
  leftSidebarOpen?: boolean
  rightSidebarOpen?: boolean
  onLeftSidebarToggle?: () => void
  onRightSidebarToggle?: () => void
}

const ROOT_TITLEBAR_HEIGHT_CLASS = "h-10"
const CHAT_TITLEBAR_HEIGHT_CLASS = "h-[52px]"
const CHAT_TITLEBAR_HEIGHT_PX = 52
export const MAC_WINDOW_CONTROL_INSET_WIDTH = 90
const MAC_WINDOW_CONTROL_INSET_CLASS = "w-[90px]"

// When sidebar is closed, reserve space for the fixed toggle (w-8 = 32px) + 8px gap
const CHAT_SIDEBAR_TOGGLE_RESERVED_PX = 40
// Fixed toggle left positions
const CHAT_SIDEBAR_TOGGLE_LEFT_MAC_PX = MAC_WINDOW_CONTROL_INSET_WIDTH
const CHAT_SIDEBAR_TOGGLE_LEFT_DEFAULT_PX = 8
const CHAT_SIDEBAR_TOGGLE_HEIGHT_PX = 24 // h-6

const TITLEBAR_ICON_STROKE_WIDTH = 1.5

/** 14px Lucide icons with a constant on-screen stroke (avoids blurry sub-pixel scaling). */
function TitlebarIcon(props: { icon: LucideIcon }) {
  const Icon = props.icon
  return (
    <Icon
      className="size-3.5 shrink-0"
      absoluteStrokeWidth
      strokeWidth={TITLEBAR_ICON_STROKE_WIDTH}
    />
  )
}

function readDirectoryParam(params: unknown) {
  if (!params || typeof params !== "object") return undefined
  if (!("directory" in params)) return undefined
  return typeof params.directory === "string" ? params.directory : undefined
}

function readDirectoryParamFromMatches(matches: readonly { params: unknown }[]) {
  for (const match of matches) {
    const directory = readDirectoryParam(match.params)
    if (directory) return directory
  }
  return undefined
}

function readDirectoryTokenFromPathname(pathname: string) {
  return pathname.split("/").find((segment) => segment.length > 0)
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readSearchParam(search: unknown, key: string): unknown {
  if (!isUnknownRecord(search)) return undefined
  return search[key]
}

export function DesktopTitlebar(props: DesktopTitlebarProps) {
  const placement = props.placement ?? "root"
  const titlebarHeightClass =
    placement === "chat" ? CHAT_TITLEBAR_HEIGHT_CLASS : ROOT_TITLEBAR_HEIGHT_CLASS
  const location = useLocation()
  const workspace = useDirectoryWorkspaceOptional()
  const platform = usePlatform()
  const isDesktop = platform.platform === "desktop"
  const isMac = isDesktop && platform.os === "macos"
  const isWindows = isDesktop && platform.os === "windows"
  const pathname = location.pathname
  const leftSidebarOpen = useUiPreferences((state) => state.leftSidebarOpen)
  const setLeftSidebarOpen = useUiPreferences((state) => state.setLeftSidebarOpen)
  const routerState = useRouterState()
  const focusedBenchMatch = routerState.matches.find(
    (match) =>
      match.routeId === "/$directory/_bench" || match.routeId.startsWith("/$directory/_bench/"),
  )
  const isFocusedBenchPage = focusedBenchMatch !== undefined || isBenchRoutePathname(pathname)
  const isFloatingBenchPage =
    isFocusedBenchPage &&
    readBenchChatLayoutMode(readSearchParam(location.search, BENCH_CHAT_SEARCH_PARAM)) ===
      BENCH_CHAT_LAYOUT_FLOATING
  const workspaceRightSidebarOpen =
    workspace?.projection.dockedState.visibility === WORKSPACE_VISIBILITY_EXPANDED
  const rightSidebarOpen = props.rightSidebarOpen ?? workspaceRightSidebarOpen ?? false
  const isParkedBenchPage =
    isFocusedBenchPage &&
    !isFloatingBenchPage &&
    workspace?.projection.bench.visibility === "parked"
  const directoryToken = isFocusedBenchPage
    ? (readDirectoryParam(focusedBenchMatch?.params) ??
      readDirectoryParamFromMatches(routerState.matches) ??
      readDirectoryTokenFromPathname(pathname))
    : undefined
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
      if (e instanceof CustomEvent && typeof e.detail?.isFullscreen === "boolean") {
        setIsFullscreen(e.detail.isFullscreen as boolean)
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
      hasRightSidebarCallback: props.onRightSidebarToggle !== undefined,
      hasWorkspaceContext: workspace !== undefined,
      rightSidebarOpen,
      workspaceRightSidebarOpen,
      isFocusedBenchPage,
      isFloatingBenchPage,
      isParkedBenchPage,
      directoryToken,
    })
  }, [
    directoryToken,
    isDesktop,
    isFloatingBenchPage,
    isFocusedBenchPage,
    isMac,
    isParkedBenchPage,
    isWindows,
    pathname,
    placement,
    props.onRightSidebarToggle,
    props.variant,
    rightSidebarOpen,
    showSidebarToggles,
    workspace,
    workspaceRightSidebarOpen,
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

  function onToggleRightSidebar() {
    const commandType = rightSidebarOpen ? "collapse" : "reveal"
    logBenchToggleStep("desktop-titlebar-right-toggle-handler-entry", {
      placement,
      variant: props.variant ?? "chat",
      pathname,
      rightSidebarOpen,
      commandType,
      hasRightSidebarCallback: props.onRightSidebarToggle !== undefined,
      hasWorkspaceContext: workspace !== undefined,
      workspaceRightSidebarOpen,
    })

    if (props.onRightSidebarToggle) {
      logBenchToggleStep("desktop-titlebar-right-toggle-calling-prop-callback", {
        commandType,
      })
      props.onRightSidebarToggle()
      logBenchToggleStep("desktop-titlebar-right-toggle-prop-callback-returned", {
        commandType,
      })
      return
    }

    if (workspace) {
      logBenchToggleStep("desktop-titlebar-right-toggle-fallback-controller-execute", {
        commandType,
      })
      void workspace.controller
        .execute({ type: commandType })
        .then((result) => {
          logBenchToggleStep("desktop-titlebar-right-toggle-fallback-controller-result", {
            commandType,
            result,
          })
        })
        .catch((error: unknown) => {
          logBenchToggleStep("desktop-titlebar-right-toggle-fallback-controller-error", {
            commandType,
            error,
          })
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

  async function onBackToChat() {
    if (!directoryToken || !workspace) return
    await workspace.controller.execute({ type: "close" })
  }

  const rightSidebarToggle = showSidebarToggles ? (
    <div
      data-titlebar-no-drag
      className="mr-2 flex shrink-0 items-center gap-1 motion-reduce:transition-none [-webkit-app-region:no-drag]"
      onPointerDownCapture={(event) =>
        logBenchToggleDomEvent("right-toggle-wrapper-pointerdown-capture", event)
      }
      onMouseDownCapture={(event) =>
        logBenchToggleDomEvent("right-toggle-wrapper-mousedown-capture", event)
      }
      onClickCapture={(event) => logBenchToggleDomEvent("right-toggle-wrapper-click-capture", event)}
    >
      <Button
        type="button"
        data-action="titlebar-toggle-right-sidebar"
        variant="ghost"
        className="relative h-6 w-8 p-0 box-border text-icon-base hover:bg-surface-base-hover [-webkit-app-region:no-drag]"
        aria-label={
          rightSidebarOpen
            ? language.t("desktopTitlebar.collapseRightPanel")
            : language.t("desktopTitlebar.expandRightPanel")
        }
        aria-expanded={rightSidebarOpen}
        title={
          rightSidebarOpen
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
        onClickCapture={(event) => logBenchToggleDomEvent("right-toggle-button-click-capture", event)}
        onClick={onToggleRightSidebar}
      >
        {rightSidebarOpen ? (
          <TitlebarIcon icon={LayoutRightPartialIcon} />
        ) : (
          <TitlebarIcon icon={LayoutRightIcon} />
        )}
        {isParkedBenchPage ? (
          <span className="absolute right-1 top-1 size-1.5 rounded-full bg-text-interactive-base" />
        ) : null}
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
      className="h-6 w-8 p-0 box-border text-text-weak hover:bg-surface-base-hover hover:text-text-strong [-webkit-app-region:no-drag]"
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
      {resolvedLeftSidebarOpen ? (
        <TitlebarIcon icon={LayoutLeftPartialIcon} />
      ) : (
        <TitlebarIcon icon={LayoutLeftIcon} />
      )}
    </Button>
  )
  const benchBackButton =
    isFocusedBenchPage && directoryToken && !isParkedBenchPage ? (
      <div className="flex items-center gap-2 px-3 animate-in fade-in slide-in-from-left-2 duration-300 cubic-bezier(0.23, 1, 0.32, 1)">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={language.t("sidebar.resourcesBackToChat")}
          title={language.t("sidebar.resourcesBackToChat")}
          className="transition-transform active:scale-90 [-webkit-app-region:no-drag]"
          onClick={() => {
            void onBackToChat()
          }}
        >
          <TitlebarIcon icon={MoveLeftIcon} />
        </Button>
      </div>
    ) : null

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
            top: (CHAT_TITLEBAR_HEIGHT_PX - CHAT_SIDEBAR_TOGGLE_HEIGHT_PX) / 2,
            left:
              isMac && !isFullscreen
                ? CHAT_SIDEBAR_TOGGLE_LEFT_MAC_PX
                : CHAT_SIDEBAR_TOGGLE_LEFT_DEFAULT_PX,
            zIndex: 50,
            transition: "left 200ms ease-out",
          }}
          className="motion-reduce:transition-none [-webkit-app-region:no-drag]"
        >
          <Button
            type="button"
            data-action="chat-toggle-left-sidebar"
            variant="ghost"
            className="box-border h-6 w-8 p-0 text-text-weak hover:bg-surface-base-hover hover:text-text-strong [-webkit-app-region:no-drag]"
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
            {resolvedLeftSidebarOpen ? (
              <TitlebarIcon icon={LayoutLeftPartialIcon} />
            ) : (
              <TitlebarIcon icon={LayoutLeftIcon} />
            )}
          </Button>
        </div>
      ) : null}
      <div className="flex h-full items-center">
        {shouldReserveMacWindowControls ? (
          <div className={`${MAC_WINDOW_CONTROL_INSET_CLASS} shrink-0`} />
        ) : null}
        {placement === "chat" && isDesktop ? (
          <div
            className="shrink-0 transition-[width] duration-200 ease-out motion-reduce:transition-none"
            style={{ width: chatLeftSpacerWidth }}
          />
        ) : null}
        {showLeftSidebarToggle ? (
          <div className="ml-2 flex h-6 w-8 shrink-0 items-center">{leftSidebarToggleButton}</div>
        ) : null}
        {!isShellVariant &&
          (placement === "chat" ? (
            <div className="flex min-w-0 flex-1 items-stretch">
              {benchBackButton}
              {props.projectName ? (
                <div className="shrink-0 overflow-hidden max-w-[12rem] transition-[max-width] duration-150 ease-in hover:max-w-[20rem] hover:duration-300 hover:ease-out [-webkit-app-region:no-drag] flex items-center border-r border-border-weaker-base [box-shadow:-2px_0_4px_rgba(0,0,0,0.08)]">
                  <span className="block truncate pl-4 pr-3 text-xs font-medium text-text-weak select-none">
                    {props.projectName}
                  </span>
                </div>
              ) : null}
              <h1 className="min-w-0 flex-1 self-center truncate px-4 text-sm font-medium text-text-strong">
                {props.chatTitle ? (
                  <TextShimmer text={props.chatTitle} active={props.isTurnActive ?? false} />
                ) : null}
              </h1>
            </div>
          ) : (
            <div className="min-w-0 flex-1">{benchBackButton}</div>
          ))}
        <div
          data-titlebar-no-drag
          className="flex shrink-0 items-center gap-1 mr-2 ml-auto [-webkit-app-region:no-drag]"
        >
          {!isShellVariant && rightSidebarToggle}

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
