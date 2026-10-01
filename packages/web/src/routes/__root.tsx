import { useCallback } from "react"
import type { QueryClient } from "@tanstack/react-query"
import {
  createRootRouteWithContext,
  Outlet,
  useLocation,
  useNavigate,
} from "@tanstack/react-router"
import { DesktopTitlebar } from "@/components/layout/desktop-titlebar"
import { LinkDestinationDialog } from "@/components/directory-chat/link-destination-dialog"
import { ExternalFileOpenDialog } from "@/components/files/external-file-open-dialog"
import { WorkspaceFileOpenDialog } from "@/components/files/workspace-file-open-dialog"
import { BuddyDevTools } from "@/components/debug/buddy-devtools"
import { UpdateMenuCommandHandler } from "@/components/updates/update-menu-command-handler"
import { QuitShortcutHint } from "@/components/layout/quit-shortcut-hint"
import { language } from "@/context/language"
import { isBenchRoutePathname } from "@/lib/bench-navigation"
import { useCloseWindowShortcut } from "@/lib/close-tab-shortcut"

function RootLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const isOnboarding = location.pathname.startsWith("/onboarding")
  const isDirectoryChat = location.pathname !== "/chat" && location.pathname.endsWith("/chat")
  // A notebook's chat and Bench routes draw their own titlebar, so it survives switching between
  // them, including the immersive layout's tabs.
  const isBenchRoute = isBenchRoutePathname(location.pathname)
  const isSettings = location.pathname === "/settings"
  const openUpdateSurface = useCallback(async () => {
    await navigate({ to: "/settings", search: { tab: "about" } })
  }, [navigate])
  useCloseWindowShortcut()

  return (
    <div className="h-full overflow-hidden bg-background-base text-text-base flex min-h-0 flex-col">
      <UpdateMenuCommandHandler openUpdateSurface={openUpdateSurface} />
      <QuitShortcutHint />
      <WorkspaceFileOpenDialog />
      <ExternalFileOpenDialog />
      <LinkDestinationDialog />
      {!isOnboarding && !isDirectoryChat && !isBenchRoute && !isSettings && <DesktopTitlebar />}
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
