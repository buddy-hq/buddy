import { createFileRoute } from "@tanstack/react-router"
import { DirectoryInvalidNotebook } from "@/components/directory-chat/directory-invalid-notebook"
import { DirectoryChatWhiteboardPage } from "@/components/directory-chat/directory-chat-whiteboard-page"
import { decodeDirectory } from "@/lib/directory-token"

export const Route = createFileRoute("/$directory/_workspace/whiteboard")({
  component: DirectoryWhiteboardRoute,
})

function DirectoryWhiteboardRoute() {
  const params = Route.useParams()
  try {
    const directory = decodeDirectory(params.directory)
    return <DirectoryChatWhiteboardPage directory={directory} />
  } catch {
    return <DirectoryInvalidNotebook />
  }
}
