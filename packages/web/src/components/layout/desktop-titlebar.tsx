import type { MouseEvent } from "react"
import { useState, useEffect } from "react"
import { useLocation, useNavigate } from "@tanstack/react-router"
import { PowerIcon, SparklesIcon } from "lucide-react"
import { CopyIcon, CheckIcon, toast, Button } from "@buddy/ui"
import { language } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useUiPreferences } from "@/state/ui-preferences"
import { useChatStore } from "@/state/chat-store"
import {
  CHAT_ENTRY_PATH,
  buildOnboardingChatEntryReturnTo,
  buildOnboardingTestSearch,
  isOnboardingTestSearch,
  readOnboardingTestReturnTo,
} from "@/lib/onboarding-test-mode"
import { setE2EOpenAIConnectedState } from "@/lib/e2e-runtime"
import { OPENAI_PROVIDER_ID } from "@/lib/provider-ids"
import { buildSessionTrace, copyToClipboard } from "@/lib/directory-chat/chat-debug-helpers"
import {
  formatProviderAuthError,
  removeProviderAuth,
  reloadProviderRuntime,
} from "@/lib/provider-auth"
import {
  isTitlebarInteractiveTarget,
  isTitlebarSystemControlTarget,
} from "./desktop-titlebar-helpers"
import {
  LayoutLeftIcon,
  LayoutLeftPartialIcon,
  LayoutRightIcon,
  LayoutRightPartialIcon,
} from "./sidebar-icons"

const RIGHT_SIDEBAR_EDITOR_MIN_WIDTH = 360
const RIGHT_SIDEBAR_EDITOR_DEFAULT_WIDTH = 640

function buildRelativeSearchParams(search: string) {
  const params = new URLSearchParams(search)

  if (params.size === 0) {
    return undefined
  }

  const result: Record<string, string> = {}
  for (const [key, value] of params.entries()) {
    result[key] = value
  }

  return result
}

function parseRelativeHref(href: string) {
  const url = new URL(href, window.location.origin)
  return {
    pathname: url.pathname,
    search: buildRelativeSearchParams(url.search),
  }
}

export function DesktopTitlebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const platform = usePlatform()
  const isDesktop = platform.platform === "desktop"
  const isMac = isDesktop && platform.os === "macos"
  const isWindows = isDesktop && platform.os === "windows"
  const [isCopied, setIsCopied] = useState(false)
  const pathname = location.pathname
  const leftSidebarOpen = useUiPreferences((state) => state.leftSidebarOpen)
  const setLeftSidebarOpen = useUiPreferences((state) => state.setLeftSidebarOpen)
  const rightSidebarOpen = useUiPreferences((state) => state.rightSidebarOpen)
  const rightSidebarWidth = useUiPreferences((state) => state.rightSidebarWidth)
  const rightSidebarTab = useUiPreferences((state) => state.rightSidebarTab)
  const setRightSidebarOpen = useUiPreferences((state) => state.setRightSidebarOpen)
  const setRightSidebarWidth = useUiPreferences((state) => state.setRightSidebarWidth)
  const activeDirectory = useChatStore((state) => state.activeDirectory)
  const streamStatus = useChatStore((state) => state.streamStatus)
  const activeSessionID = useChatStore((state) =>
    activeDirectory ? state.directories[activeDirectory]?.sessionID : undefined,
  )
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isDisconnectingOpenAi, setIsDisconnectingOpenAi] = useState(false)

  useEffect(() => {
    if (!isMac) return
    const media = window.matchMedia("(display-mode: fullscreen)")
    const handler = (e: MediaQueryListEvent | MediaQueryList) => setIsFullscreen(e.matches)
    handler(media)
    media.addEventListener("change", handler)
    return () => media.removeEventListener("change", handler)
  }, [isMac])

  if (!isMac && !isWindows) {
    return null
  }

  const showSidebarToggles = pathname !== "/chat" && pathname.endsWith("/chat")
  const onboardingToggleLabel =
    pathname === "/onboarding"
      ? language.t("desktopTitlebar.exitOnboarding")
      : language.t("desktopTitlebar.testOnboarding")
  const onboardingToggleVariant = pathname === "/onboarding" ? "secondary" : "outline"

  function onToggleRightSidebar() {
    if (rightSidebarOpen) {
      setRightSidebarOpen(false)
      return
    }

    if (rightSidebarTab === "editor" && rightSidebarWidth < RIGHT_SIDEBAR_EDITOR_MIN_WIDTH) {
      setRightSidebarWidth(RIGHT_SIDEBAR_EDITOR_DEFAULT_WIDTH)
    }

    setRightSidebarOpen(true)
  }

  async function disconnectOpenAiProvider() {
    setIsDisconnectingOpenAi(true)

    try {
      await removeProviderAuth({
        providerID: OPENAI_PROVIDER_ID,
      })
      await setE2EOpenAIConnectedState(false)
      await reloadProviderRuntime()
      toast.success(language.t("desktopTitlebar.openAiDisconnected"))
    } catch (error) {
      toast.error(
        formatProviderAuthError(error, language.t("desktopTitlebar.disconnectOpenAiFailed")),
      )
    } finally {
      setIsDisconnectingOpenAi(false)
    }
  }

  function openOnboardingTestMode() {
    const currentHref = `${location.pathname}${location.searchStr}`
    const returnTo =
      pathname === CHAT_ENTRY_PATH && !isOnboardingTestSearch(location.search)
        ? buildOnboardingChatEntryReturnTo()
        : currentHref

    void navigate({
      to: "/onboarding",
      search: buildOnboardingTestSearch(returnTo),
    })
  }

  function closeOnboardingTestMode() {
    const returnTo = readOnboardingTestReturnTo(location.search)
    if (returnTo) {
      const target = parseRelativeHref(returnTo)
      void navigate({
        to: target.pathname,
        ...(target.search ? { search: target.search } : {}),
      })
      return
    }

    void navigate({
      to: CHAT_ENTRY_PATH,
      search: buildOnboardingTestSearch(),
    })
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
    if (isTitlebarSystemControlTarget(event.target)) return

    event.preventDefault()
    void platform.toggleWindowMaximize().catch(() => undefined)
  }

  const rightSidebarToggle = showSidebarToggles ? (
    <div className="mr-2 flex shrink-0 items-center gap-1">
      <Button
        type="button"
        data-action="titlebar-toggle-right-sidebar"
        variant="ghost"
        className="h-6 w-8 p-0 box-border text-text-weak hover:bg-surface-base-hover hover:text-text-strong"
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
        onClick={onToggleRightSidebar}
      >
        {rightSidebarOpen ? (
          <LayoutRightPartialIcon className="size-4" />
        ) : (
          <LayoutRightIcon className="size-4" />
        )}
      </Button>
    </div>
  ) : null

  return (
    <header
      data-component="desktop-titlebar"
      className="h-10 shrink-0 border-b border-border-weaker-base bg-background-base text-text-base"
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
    >
      <div className="flex h-full items-center">
        {isMac && !isFullscreen ? <div className="w-[72px] shrink-0" /> : null}
        {showSidebarToggles ? (
          <div className="ml-2 flex shrink-0 items-center gap-1">
            <Button
              type="button"
              data-action="titlebar-toggle-left-sidebar"
              variant="ghost"
              className="h-6 w-8 p-0 box-border text-text-weak hover:bg-surface-base-hover hover:text-text-strong"
              aria-label={
                leftSidebarOpen
                  ? language.t("desktopTitlebar.collapseLeftPanel")
                  : language.t("desktopTitlebar.expandLeftPanel")
              }
              aria-expanded={leftSidebarOpen}
              title={
                leftSidebarOpen
                  ? language.t("desktopTitlebar.collapseLeftPanel")
                  : language.t("desktopTitlebar.expandLeftPanel")
              }
              onClick={() => setLeftSidebarOpen(!leftSidebarOpen)}
            >
              {leftSidebarOpen ? (
                <LayoutLeftPartialIcon className="size-4" />
              ) : (
                <LayoutLeftIcon className="size-4" />
              )}
            </Button>
          </div>
        ) : null}
        <div className="min-w-0 flex-1" />
        <div className="flex shrink-0 items-center gap-1 mr-2 ml-auto">
          {import.meta.env.DEV ? (
            <>
              <Button
                type="button"
                data-action="titlebar-disconnect-openai"
                variant="outline"
                size="sm"
                className="h-6 gap-1 rounded-full border-border-base/70 px-2 text-[11px] font-medium text-text-weak hover:bg-surface-base-hover hover:text-text-strong"
                title={language.t("desktopTitlebar.disconnectOpenAi")}
                disabled={isDisconnectingOpenAi}
                onClick={() => {
                  void disconnectOpenAiProvider()
                }}
              >
                <PowerIcon className="size-3.5" />
                {language.t("desktopTitlebar.disconnectOpenAi")}
              </Button>
              <Button
                type="button"
                data-action="titlebar-test-onboarding"
                variant={onboardingToggleVariant}
                size="sm"
                className="h-6 gap-1 rounded-full border-border-base/70 px-2 text-[11px] font-medium text-text-weak hover:bg-surface-base-hover hover:text-text-strong"
                title={onboardingToggleLabel}
                onClick={() => {
                  if (pathname === "/onboarding") {
                    closeOnboardingTestMode()
                    return
                  }

                  openOnboardingTestMode()
                }}
              >
                <SparklesIcon className="size-3.5" />
                {onboardingToggleLabel}
              </Button>
            </>
          ) : null}
          {import.meta.env.DEV && activeDirectory ? (
            <div className="flex shrink-0 items-center">
              <Button
                type="button"
                data-action="titlebar-copy-session-trace"
                variant="ghost"
                size="icon-xs"
                className="h-6 w-8 p-0 box-border text-text-weak hover:bg-surface-base-hover hover:text-text-strong"
                title={language.t("desktopTitlebar.copySessionTrace")}
                onClick={() => {
                  void copyToClipboard(
                    buildSessionTrace({
                      directory: activeDirectory,
                      sessionID: activeSessionID,
                      streamStatus,
                    }),
                  )
                  setIsCopied(true)
                  toast.success(language.t("desktopTitlebar.sessionTraceCopied"))
                  setTimeout(() => setIsCopied(false), 2000)
                }}
              >
                {isCopied ? (
                  <CheckIcon className="size-4 text-text-success-base" />
                ) : (
                  <CopyIcon className="size-4" />
                )}
              </Button>
            </div>
          ) : null}
          {rightSidebarToggle}

          {isWindows ? (
            <>
              <div className="w-[140px] shrink-0" />
              <div
                data-component="titlebar-system-controls-mount"
                data-tauri-decorum-tb
                className="flex h-10 shrink-0 flex-row"
              />
            </>
          ) : null}
        </div>
      </div>
    </header>
  )
}
