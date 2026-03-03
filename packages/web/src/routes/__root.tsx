import { useEffect, useRef } from "react"
import { createRootRoute, Outlet } from "@tanstack/react-router"
import { TanStackRouterDevtools } from "@tanstack/router-devtools"
import { toast } from "@buddy/ui"
import { DesktopTitlebar } from "@/components/layout/desktop-titlebar"
import { usePlatform } from "@/context/platform"

function ReleaseUpdateWatcher() {
  const platform = usePlatform()
  const shownRef = useRef(false)

  useEffect(() => {
    if (!platform.checkUpdate || !platform.update) return

    let interval: ReturnType<typeof setInterval> | undefined
    let cancelled = false

    const poll = async () => {
      const next = await platform.checkUpdate?.().catch(() => null)
      if (cancelled || !next?.updateAvailable || shownRef.current) return

      shownRef.current = true
      toast("Update ready to install", {
        description: next.version ? `Buddy ${next.version} has been downloaded.` : "A new Buddy release has been downloaded.",
        duration: Number.POSITIVE_INFINITY,
        action: {
          label: "Install & restart",
          onClick: async () => {
            await platform.update?.()
            await platform.restart()
          },
        },
        cancel: {
          label: "Later",
          onClick: () => undefined,
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
