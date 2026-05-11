import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/skills")({
  beforeLoad: () => {
    throw redirect({ to: "/chat" })
  },
  component: () => null,
})
