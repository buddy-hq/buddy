import { useEffect, type ReactNode } from "react"
import {
  RouterProvider,
  createBrowserHistory,
  createHashHistory,
  createRouter,
} from "@tanstack/react-router"
import { QueryClientProvider } from "@tanstack/react-query"
import { Toaster, TooltipProvider } from "@buddy/ui"
import { LanguageProvider } from "@/context/language"
import { useChatStore } from "@/state/chat-store"
import { appQueryClient } from "@/state/query-client"
import {
  activateChatDirectory,
  selectActiveChatSession,
} from "@/lib/active-chat-transition-coordinator"
import { decodeDirectory } from "@/lib/directory-token"
import { resolveBenchRouteViewTransitionTypes } from "@/lib/bench-navigation"
import { buildWorkspaceRouteNavigation } from "@/lib/directory-workspace-controller"
import { ThemeProvider } from "@/theme"
import type { ThemeAppliedDetails } from "@/theme"
import { routeTree } from "./routeTree.gen"
import "@/state/appearance-preferences"
import "./bench-view-transitions.css"

const FILE_PROTOCOL = "file:"

function createAppHistory() {
  if (typeof window !== "undefined" && window.location.protocol === FILE_PROTOCOL) {
    return createHashHistory()
  }

  return createBrowserHistory()
}

const router = createRouter({
  routeTree,
  history: createAppHistory(),
  context: {
    queryClient: appQueryClient,
  },
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
  defaultViewTransition: {
    types: resolveBenchRouteViewTransitionTypes,
  },
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

export function AppBaseProviders(props: {
  children: ReactNode
  onThemeApplied?: (details: ThemeAppliedDetails) => void
}) {
  return (
    <LanguageProvider>
      <QueryClientProvider client={appQueryClient}>
        <ThemeProvider defaultTheme="dracula" onThemeApplied={props.onThemeApplied}>
          <TooltipProvider>
            {props.children}
            <Toaster position="bottom-right" />
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </LanguageProvider>
  )
}

export function resetAppRuntimeState() {
  useChatStore.getState().resetRuntimeState()
}

function readNotificationClickHref(event: Event) {
  if (!(event instanceof CustomEvent)) return undefined
  const detail = event.detail
  if (typeof detail !== "object" || detail === null) return undefined
  if (!("href" in detail) || typeof detail.href !== "string") return undefined
  return detail.href
}

async function activateNotificationHref(href: string) {
  const url = new URL(href, window.location.origin)
  const match = /^\/([^/]+)\/chat$/.exec(url.pathname)
  if (!match) {
    router.history.push(href)
    return
  }

  const directory = decodeDirectory(match[1])
  const sessionID = url.searchParams.get("session")
  const navigate = (targetDirectory: string, route: Parameters<typeof buildWorkspaceRouteNavigation>[0]["route"]) =>
    router.navigate(
      buildWorkspaceRouteNavigation({
        directory: targetDirectory,
        route,
      }),
    )
  if (sessionID) {
    await selectActiveChatSession({ directory, sessionID, navigate })
    return
  }
  await activateChatDirectory({ directory, navigate })
}

export function AppInterface() {
  useEffect(() => {
    const onNotificationClick = (event: Event) => {
      const href = readNotificationClickHref(event)
      if (!href) return
      void activateNotificationHref(href)
    }

    window.addEventListener("buddy:notification-click", onNotificationClick)
    return () => {
      window.removeEventListener("buddy:notification-click", onNotificationClick)
    }
  }, [])

  return <RouterProvider router={router} />
}
