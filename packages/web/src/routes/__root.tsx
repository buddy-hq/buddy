import { createRootRoute, Outlet } from "@tanstack/react-router"
import { TanStackRouterDevtools } from "@tanstack/router-devtools"
import { DesktopTitlebar } from "@/components/layout/desktop-titlebar"

export const Route = createRootRoute({
  component: () => (
    <div className="h-screen bg-background text-foreground flex min-h-0 flex-col">
      <DesktopTitlebar />
      <div className="min-h-0 flex-1">
        <Outlet />
      </div>
      <TanStackRouterDevtools position="bottom-right" />
    </div>
  ),
  notFoundComponent: () => <div className="p-6">404 Not Found</div>,
})
