import type { ReactNode } from "react"
import { RouterProvider, createRouter } from "@tanstack/react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { TooltipProvider } from "@buddy/ui"
import { routeTree } from "./routeTree.gen"

const queryClient = new QueryClient()

const router = createRouter({
  routeTree,
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

export function AppBaseProviders(props: {
  children: ReactNode
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {props.children}
      </TooltipProvider>
    </QueryClientProvider>
  )
}

export function AppInterface() {
  return <RouterProvider router={router} />
}
