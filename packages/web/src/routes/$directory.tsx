import { Outlet, createFileRoute } from "@tanstack/react-router"
import { DirectoryNotebookRouteProvider } from "@/components/directory-chat/directory-notebook-route-context"

export const Route = createFileRoute("/$directory")({
  component: DirectoryRouteLayout,
})

function DirectoryRouteLayout() {
  const params = Route.useParams()

  return (
    <DirectoryNotebookRouteProvider directoryToken={params.directory}>
      <Outlet />
    </DirectoryNotebookRouteProvider>
  )
}
