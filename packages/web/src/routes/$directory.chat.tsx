import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/$directory/chat")({
  component: DirectoryChatRoute,
})

function DirectoryChatRoute() {
  return null
}
