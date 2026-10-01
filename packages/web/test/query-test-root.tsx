import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createRoot, type Root } from "react-dom/client"

/** Render with the app's query boundary and keep each test's cache isolated. */
export function createQueryTestRoot(container: Element): Root {
  const root = createRoot(container)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return {
    render(children) {
      root.render(<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>)
    },
    unmount() {
      root.unmount()
      queryClient.clear()
    },
  }
}
