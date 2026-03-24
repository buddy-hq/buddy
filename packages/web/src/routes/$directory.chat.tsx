import { createFileRoute } from "@tanstack/react-router"
import { DirectoryChatPage } from "@/components/directory-chat/directory-chat-page"

export const Route = createFileRoute("/$directory/chat")({
  component: DirectoryChatRoute,
})

function DirectoryChatRoute() {
  const params = Route.useParams()
  return <DirectoryChatPage directoryToken={params.directory} />
}
