import { createFileRoute, redirect } from "@tanstack/react-router"
import { resolveCurrentDesktopEntryPath } from "@/lib/desktop-onboarding"

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: resolveCurrentDesktopEntryPath() })
  },
  component: () => null,
})
