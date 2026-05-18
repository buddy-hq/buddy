import { useEffect, useRef } from "react"
import type { QueryClient } from "@tanstack/react-query"
import { createRootRouteWithContext, Outlet, useLocation } from "@tanstack/react-router"
import { DesktopTitlebar } from "@/components/layout/desktop-titlebar"
import { BuddyDevTools } from "@/components/debug/buddy-devtools"
import { language } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { showDesktopUpdateToast } from "../lib/desktop-updates"

const RELEASE_UPDATE_POLL_INTERVAL_MS = 10 * 60 * 1000
const DOCUMENT_VISIBILITY_VISIBLE = "visible"

function ReleaseUpdateWatcher() {
  const platform = usePlatform()
  const shownRef = useRef(false)

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

      if (cancelled || next?.status !== "ready" || shownRef.current) return

      shownRef.current = true
      showDesktopUpdateToast({
        platform,
        version: next.version,
        onDeferred: () => {
          shownRef.current = false
        },
        onInstallFailed: () => {
          shownRef.current = false
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
  }, [platform])

  return null
}

function RootLayout() {
  const location = useLocation()
  const isOnboarding = location.pathname.startsWith("/onboarding")
  const isDirectoryChat = location.pathname !== "/chat" && location.pathname.endsWith("/chat")
  const isSettings = location.pathname === "/settings"

  return (
    <div className="h-full overflow-hidden bg-background-base text-text-base flex min-h-0 flex-col">
      <ReleaseUpdateWatcher />
      {!isOnboarding && !isDirectoryChat && !isSettings && (
        <DesktopTitlebar />
      )}
      <div className="min-h-0 flex-1">
        <Outlet />
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
