import { createRootRoute, Outlet } from "@tanstack/react-router"
import { TanStackRouterDevtools } from "@tanstack/router-devtools"

export const Route = createRootRoute({
  component: () => (
    <div className="min-h-screen bg-background text-foreground">
      <Outlet />
      <TanStackRouterDevtools position="bottom-right" />
    </div>
  ),
  notFoundComponent: () => <div className="p-6">404 Not Found</div>,
})
