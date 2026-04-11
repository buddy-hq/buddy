import { createFileRoute } from "@tanstack/react-router"
import { DirectoryChatReadingPage } from "@/components/directory-chat/directory-chat-reading-page"

type DirectoryReadingSearch = {
  path?: string
  resource?: string
}

export const Route = createFileRoute("/$directory/read")({
  validateSearch: (search: Record<string, unknown>): DirectoryReadingSearch => ({
    path: typeof search.path === "string" ? search.path : undefined,
    resource: typeof search.resource === "string" ? search.resource : undefined,
  }),
  component: DirectoryReadingRoute,
})

function DirectoryReadingRoute() {
  const search = Route.useSearch()
  return <DirectoryChatReadingPage resourcePath={search.path ?? ""} resourceKey={search.resource} />
}
