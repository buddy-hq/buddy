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
import { useHostedBrowserStore } from "@/state/hosted-browser-store"
import { appQueryClient } from "@/state/query-client"
import {
  activateChatDirectory,
  selectActiveChatSession,
} from "@/lib/active-chat-transition-coordinator"
import { decodeDirectory, encodeDirectory } from "@/lib/directory-token"
import { closeOpenProject, isNotebookFolderMissingError } from "@/state/chat-actions"
import { setOpenProjectsQueryData } from "@/state/bootstrap-query"
import { showNotebookFolderMissing } from "@/components/directory-chat/show-notebook-folder-missing"
import { resolveBenchRouteViewTransitionTypes } from "@/lib/bench-navigation"
import { buildWorkspaceRouteNavigation } from "@/lib/directory-workspace-controller"
import { ThemeProvider } from "@/theme"
import { HostedBrowserHost } from "@/components/bench/surfaces/browser/hosted-browser-host"
import { UpgradePendingScreen } from "@/components/layout/upgrade-pending-screen"
import type { ThemeAppliedDetails } from "@/theme"
import { browserWindow, parseBuddyConfigObject, parseStringValue } from "@/state/parse-external"
import { routeTree } from "./routeTree.gen"
import "@/state/appearance-preferences"
import "./bench-view-transitions.css"

const FILE_PROTOCOL = "file:"

type TNotificationClickDetail = {
  href: string
}

function createAppHistory() {
  const windowNode = browserWindow()
  if (windowNode !== undefined && windowNode.location.protocol === FILE_PROTOCOL) {
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
  defaultPendingComponent: UpgradePendingScreen,
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
        <ThemeProvider onThemeApplied={props.onThemeApplied}>
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
  useHostedBrowserStore.getState().reset()
}

function parseNotificationClickDetail<TValue>(value: TValue): TNotificationClickDetail | undefined {
  const href = parseStringValue(parseBuddyConfigObject(value)?.href)
  if (href === undefined) return undefined
  return { href }
}

function readNotificationClickHref(event: Event) {
  if (!(event instanceof CustomEvent)) return undefined
  return parseNotificationClickDetail(event.detail)?.href
}

function chatRouteDirectory(pathname: string) {
  const match = /^\/([^/]+)\/chat$/.exec(pathname)
  return match ? decodeDirectory(match[1]) : undefined
}

async function closeMissingNotebook(directory: string) {
  if (chatRouteDirectory(router.state.location.pathname) === directory) {
    const nextDirectory = useChatStore
      .getState()
      .openProjects.find((candidate) => candidate !== directory)
    await (nextDirectory
      ? router.navigate({
          to: "/$directory/chat",
          params: { directory: encodeDirectory(nextDirectory) },
          replace: true,
        })
      : router.navigate({ to: "/chat", replace: true }))
  }
  await closeOpenProject(directory)
  setOpenProjectsQueryData(appQueryClient, useChatStore.getState().openProjects)
}

async function activateNotificationHref(href: string) {
  const url = new URL(href, window.location.origin)
  const directory = chatRouteDirectory(url.pathname)
  if (!directory) {
    router.history.push(href)
    return
  }

  const sessionID = url.searchParams.get("session")
  const navigate = (
    targetDirectory: string,
    route: Parameters<typeof buildWorkspaceRouteNavigation>[0]["route"],
  ) =>
    router.navigate(
      buildWorkspaceRouteNavigation({
        directory: targetDirectory,
        route,
      }),
    )
  const result = sessionID
    ? await selectActiveChatSession({ directory, sessionID, navigate })
    : await activateChatDirectory({ directory, navigate })
  if (result.outcome !== "failed" || !isNotebookFolderMissingError(result.error)) return
  showNotebookFolderMissing({
    directory,
    onCloseNotebook: () => void closeMissingNotebook(directory),
  })
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

  return (
    <>
      <RouterProvider router={router} />
      <HostedBrowserHost />
    </>
  )
}
