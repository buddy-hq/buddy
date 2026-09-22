import { z } from "zod"
import { useCallback, useState } from "react"
import type { QueryClient } from "@tanstack/react-query"
import {
  createRootRouteWithContext,
  Outlet,
  useLocation,
  useNavigate,
} from "@tanstack/react-router"
import { DesktopTitlebar } from "@/components/layout/desktop-titlebar"
import { DesktopTitlebarContentProvider } from "@/components/layout/desktop-titlebar-content"
import { LinkDestinationDialog } from "@/components/directory-chat/link-destination-dialog"
import { ExternalFileOpenDialog } from "@/components/files/external-file-open-dialog"
import { WorkspaceFileOpenDialog } from "@/components/files/workspace-file-open-dialog"
import { BuddyDevTools } from "@/components/debug/buddy-devtools"
import { UpdateMenuCommandHandler } from "@/components/updates/update-menu-command-handler"
import { language } from "@/context/language"
import {
  BENCH_CHAT_LAYOUT_FLOATING,
  BENCH_CHAT_SEARCH_PARAM,
  isBenchRoutePathname,
  readBenchChatLayoutMode,
} from "@/lib/bench-navigation"

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

function RootLayout() {
  const [desktopTitlebarContentTarget, setDesktopTitlebarContentTarget] =
    useState<HTMLDivElement | null>(null)
  const location = useLocation()
  const navigate = useNavigate()
  const isOnboarding = location.pathname.startsWith("/onboarding")
  const isDirectoryChat = location.pathname !== "/chat" && location.pathname.endsWith("/chat")
  const isBenchRoute = isBenchRoutePathname(location.pathname)
  const benchChatLayoutMode = readBenchChatLayoutMode(
    readSearchParam(location.search, BENCH_CHAT_SEARCH_PARAM),
  )
  const isFloatingBench = isBenchRoute && benchChatLayoutMode === BENCH_CHAT_LAYOUT_FLOATING
  const isDockedBench = isBenchRoute && !isFloatingBench
  const isSettings = location.pathname === "/settings"
  const openUpdateSurface = useCallback(async () => {
    await navigate({ to: "/settings", search: { tab: "about" } })
  }, [navigate])

  return (
    <div className="h-full overflow-hidden bg-background-base text-text-base flex min-h-0 flex-col">
      <UpdateMenuCommandHandler openUpdateSurface={openUpdateSurface} />
      <WorkspaceFileOpenDialog />
      <ExternalFileOpenDialog />
      <LinkDestinationDialog />
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
