import { createFileRoute } from "@tanstack/react-router"
import { DirectoryNotebookRouteProvider } from "@/components/directory-chat/directory-notebook-route-context"
import { DirectoryWorkspaceProvider } from "@/components/directory-chat/directory-workspace-context"
import { DirectoryWorkspaceRoot } from "@/components/directory-chat/directory-workspace-root"
import { decodeDirectory } from "@/lib/directory-token"
import { openProjectsWithSessionsQueryOptions } from "@/state/bootstrap-query"

export const Route = createFileRoute("/$directory")({
  loader: async ({ context }) => {
    await Promise.allSettled([
      context.queryClient.ensureQueryData(openProjectsWithSessionsQueryOptions()),
    ])
  },
  component: DirectoryRouteLayout,
})

function DirectoryRouteLayout() {
  const params = Route.useParams()
  const directory = decodeRouteDirectory(params.directory)

  return (
    <div className="h-full w-full overflow-hidden">
      <DirectoryWorkspaceProvider key={params.directory} directory={directory}>
        <DirectoryNotebookRouteProvider directoryToken={params.directory}>
          <DirectoryWorkspaceRoot />
        </DirectoryNotebookRouteProvider>
      </DirectoryWorkspaceProvider>
    </div>
  )
}

function decodeRouteDirectory(directoryToken: string): string {
  try {
    return decodeDirectory(directoryToken)
  } catch {
    return ""
  }
}
