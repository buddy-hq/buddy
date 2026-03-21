import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect } from "react"

export const Route = createFileRoute("/")({
  component: IndexComponent,
})

function IndexComponent() {
  const navigate = useNavigate()

  useEffect(() => {
    navigate({ to: "/chat", replace: true })
  }, [navigate])

  return null
}
