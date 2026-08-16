import { z } from "zod"
import { useEffect, useRef, useState } from "react"
import type { QueryClient } from "@tanstack/react-query"
import { createRootRouteWithContext, Outlet, useLocation } from "@tanstack/react-router"
import { DesktopTitlebar } from "@/components/layout/desktop-titlebar"
import { DesktopTitlebarContentProvider } from "@/components/layout/desktop-titlebar-content"
import { WorkspaceFileOpenDialog } from "@/components/files/workspace-file-open-dialog"
import { BuddyDevTools } from "@/components/debug/buddy-devtools"
import { language } from "@/context/language"
import { usePlatform } from "@/context/platform"
import {
  BENCH_CHAT_LAYOUT_FLOATING,
  BENCH_CHAT_SEARCH_PARAM,
  isBenchRoutePathname,
  readBenchChatLayoutMode,
} from "@/lib/bench-navigation"
import {
  createDesktopUpdateNotificationTracker,
  type DesktopUpdateNotificationTracker,
} from "@/lib/desktop-update-notification-tracker"
import { showDesktopUpdateProgressToast, showDesktopUpdateToast } from "../lib/desktop-updates"

const RELEASE_UPDATE_POLL_INTERVAL_MS = 10 * 60 * 1000
const DOCUMENT_VISIBILITY_VISIBLE = "visible"

type TIncomingSearchValue = string | number | boolean
type TIncomingSearch = {
  readonly [key: string]: TIncomingSearchValue | readonly TIncomingSearchValue[] | undefined
}

const incomingSearchSchema = z.record(
  z.string(),
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.union([z.string(), z.number(), z.boolean()])),
  ]),
)

function parseTIncomingSearch<T>(value: T): TIncomingSearch | undefined {
  const parsed = incomingSearchSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

function isIncomingSearchList(
  value: TIncomingSearchValue | readonly TIncomingSearchValue[] | undefined,
): value is readonly TIncomingSearchValue[] {
  return Array.isArray(value)
}

function readSearchParam<T>(search: T, key: string): TIncomingSearchValue | undefined {
  const record = parseTIncomingSearch(search)
  const value = record?.[key]
  if (value === undefined || isIncomingSearchList(value)) return undefined
  return value
}

function ReleaseUpdateWatcher() {
  const platform = usePlatform()
  const notificationTrackerRef = useRef<DesktopUpdateNotificationTracker | null>(null)
  if (notificationTrackerRef.current === null) {
    notificationTrackerRef.current = createDesktopUpdateNotificationTracker()
  }
  const notificationTracker = notificationTrackerRef.current

  useEffect(() => {
    if (!platform.checkUpdate || !platform.update || !platform.restart) return

    let interval: ReturnType<typeof setInterval> | undefined
    let cancelled = false
    let checking = false

    const poll = async () => {
      if (cancelled || checking) {
        return
      }

      checking = true
      const next = await platform.checkUpdate?.().catch(() => null)
      checking = false

      if (cancelled || next?.status !== "ready") return

      const notification = notificationTracker.begin(next.version)
      if (!notification) return

      showDesktopUpdateToast({
        platform,
        version: notification.version,
        onDeferred: () => {
          notificationTracker.clear(notification)
        },
        onInstallFailed: () => {
          notificationTracker.clear(notification)
        },
      })
    }

    const pollWhenVisible = () => {
      if (document.visibilityState !== DOCUMENT_VISIBILITY_VISIBLE) {
        return
      }

      void poll()
    }

    void poll()
    interval = setInterval(() => {
      pollWhenVisible()
    }, RELEASE_UPDATE_POLL_INTERVAL_MS)
    window.addEventListener("focus", pollWhenVisible)
    document.addEventListener("visibilitychange", pollWhenVisible)

    return () => {
      cancelled = true
      if (interval !== undefined) {
        clearInterval(interval)
      }
      window.removeEventListener("focus", pollWhenVisible)
      document.removeEventListener("visibilitychange", pollWhenVisible)
    }
  }, [notificationTracker, platform])

  useEffect(() => {
    if (!platform.onUpdateProgress) return
    return platform.onUpdateProgress((progress) => {
      if (
        progress.status === "downloading" ||
        progress.status === "idle" ||
        progress.status === "installing" ||
        (progress.status === "error" && progress.version !== undefined)
      ) {
        notificationTracker.reset()
      }
      showDesktopUpdateProgressToast({ progress })
    })
  }, [notificationTracker, platform])

  return null
}

function RootLayout() {
  const [desktopTitlebarContentTarget, setDesktopTitlebarContentTarget] =
    useState<HTMLDivElement | null>(null)
  const location = useLocation()
  const isOnboarding = location.pathname.startsWith("/onboarding")
  const isDirectoryChat = location.pathname !== "/chat" && location.pathname.endsWith("/chat")
  const isBenchRoute = isBenchRoutePathname(location.pathname)
  const benchChatLayoutMode = readBenchChatLayoutMode(
    readSearchParam(location.search, BENCH_CHAT_SEARCH_PARAM),
  )
  const isFloatingBench = isBenchRoute && benchChatLayoutMode === BENCH_CHAT_LAYOUT_FLOATING
  const isDockedBench = isBenchRoute && !isFloatingBench
  const isSettings = location.pathname === "/settings"

  return (
    <div className="h-full overflow-hidden bg-background-base text-text-base flex min-h-0 flex-col">
      <ReleaseUpdateWatcher />
      <WorkspaceFileOpenDialog />
      {!isOnboarding && !isDirectoryChat && !isDockedBench && !isSettings && (
        <DesktopTitlebar
          showDockFloatingBench={isFloatingBench}
          rootContentRef={setDesktopTitlebarContentTarget}
        />
      )}
      <div className="min-h-0 flex-1">
        <DesktopTitlebarContentProvider target={desktopTitlebarContentTarget}>
          <Outlet />
        </DesktopTitlebarContentProvider>
      </div>
      {import.meta.env.DEV && <BuddyDevTools />}
    </div>
  )
}

type RouterContext = {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: () => <div className="p-6">{language.t("routes.root.notFound")}</div>,
})
