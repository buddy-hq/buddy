import { createFileRoute, redirect } from "@tanstack/react-router"
import { resolveCurrentDesktopEntryPath } from "@/lib/desktop-onboarding"

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    throw redirect({ to: await resolveCurrentDesktopEntryPath() })
  },
  component: () => null,
})
