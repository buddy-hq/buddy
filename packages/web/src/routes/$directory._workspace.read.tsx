import { createFileRoute } from "@tanstack/react-router"
import { DirectoryInvalidNotebook } from "@/components/directory-chat/directory-invalid-notebook"
import { DirectoryChatReadingPage } from "@/components/directory-chat/directory-chat-reading-page"
import { decodeDirectory } from "@/lib/directory-token"
import {
  isSupportedReadingResourcePath,
  readingResourceBlobQueryOptions,
  resourcesQueryOptions,
} from "@/state/resources-query"

type DirectoryReadingSearch = {
  path?: string
  resource?: string
}

export const Route = createFileRoute("/$directory/_workspace/read")({
  validateSearch: (search: Record<string, unknown>): DirectoryReadingSearch => ({
    path: typeof search.path === "string" ? search.path : undefined,
    resource: typeof search.resource === "string" ? search.resource : undefined,
  }),
  loaderDeps: ({ search }) => ({
    path: search.path,
    resource: search.resource,
  }),
  loader: async ({ context, deps, params }) => {
    let directory = ""
    try {
      directory = decodeDirectory(params.directory)
    } catch {
      return
    }

    await Promise.allSettled([
      context.queryClient.ensureQueryData(resourcesQueryOptions(directory)),
    ])

    if (deps.path && isSupportedReadingResourcePath(deps.path)) {
      await Promise.allSettled([
        context.queryClient.ensureQueryData(readingResourceBlobQueryOptions(directory, deps.path)),
      ])
    }
  },
  component: DirectoryReadingRoute,
})

function DirectoryReadingRoute() {
  const params = Route.useParams()
  const search = Route.useSearch()
  try {
    const directory = decodeDirectory(params.directory)
    return (
      <DirectoryChatReadingPage
        directory={directory}
        resourcePath={search.path ?? ""}
        resourceKey={search.resource}
      />
    )
  } catch {
    return <DirectoryInvalidNotebook />
  }
}
