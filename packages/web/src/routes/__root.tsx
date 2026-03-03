import { useEffect, useRef } from "react"
import { createRootRoute, Outlet } from "@tanstack/react-router"
import { TanStackRouterDevtools } from "@tanstack/router-devtools"
import { DesktopTitlebar } from "@/components/layout/desktop-titlebar"
import { usePlatform } from "@/context/platform"
import { showDesktopUpdateToast } from "../lib/desktop-updates"

function ReleaseUpdateWatcher() {
  const platform = usePlatform()
  const shownRef = useRef(false)

  useEffect(() => {
    if (!platform.checkUpdate || !platform.update) return

    let interval: ReturnType<typeof setInterval> | undefined
    let cancelled = false

    const poll = async () => {
      const next = await platform.checkUpdate?.().catch(() => null)
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

    void poll()
    interval = setInterval(() => {
      void poll()
    }, 10 * 60 * 1000)

    return () => {
      cancelled = true
      if (interval !== undefined) {
        clearInterval(interval)
      }
    }
  }, [platform])

  return null
}

function RootLayout() {
  return (
    <div className="h-screen bg-background text-foreground flex min-h-0 flex-col">
      <ReleaseUpdateWatcher />
      <DesktopTitlebar />
      <div className="min-h-0 flex-1">
        <Outlet />
      </div>
      {import.meta.env.DEV && <TanStackRouterDevtools position="bottom-right" />}
    </div>
  )
}

export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: () => <div className="p-6">404 Not Found</div>,
})
