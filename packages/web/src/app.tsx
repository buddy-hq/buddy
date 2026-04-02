import type { ReactNode } from "react"
import {
  RouterProvider,
  createBrowserHistory,
  createHashHistory,
  createRouter,
} from "@tanstack/react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Toaster, TooltipProvider } from "@buddy/ui"
import { LanguageProvider } from "@/context/language"
import { useChatStore } from "@/state/chat-store"
import { ThemeProvider } from "@/theme"
import { routeTree } from "./routeTree.gen"

const queryClient = new QueryClient()
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
    queryClient,
  },
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

export function AppBaseProviders(props: { children: ReactNode }) {
  return (
    <LanguageProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultTheme="dracula">
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

export function AppInterface() {
  return <RouterProvider router={router} />
}
