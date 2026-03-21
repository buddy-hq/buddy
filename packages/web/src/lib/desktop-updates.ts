import { toast } from "@buddy/ui"
import type { Platform } from "@/context/platform"

const UPDATE_READY_TOAST_ID = "buddy-desktop-update-ready"
let activeHandlers: {
  onDeferred?: () => void
  onInstallFailed?: () => void
} = {}

export function showDesktopUpdateToast(args: {
  platform: Platform
  version?: string
  onDeferred?: () => void
  onInstallFailed?: () => void
}) {
  if (args.onDeferred) {
    activeHandlers.onDeferred = args.onDeferred
  }
  if (args.onInstallFailed) {
    activeHandlers.onInstallFailed = args.onInstallFailed
  }

  toast("Update ready to install", {
    id: UPDATE_READY_TOAST_ID,
    description: args.version
      ? `Buddy ${args.version} has been downloaded.`
      : "A new Buddy release has been downloaded.",
    duration: Number.POSITIVE_INFINITY,
    action: {
      label: "Install & restart",
      onClick: async () => {
        toast.dismiss(UPDATE_READY_TOAST_ID)

        try {
          await args.platform.update?.()
          await args.platform.restart()
        } catch {
          activeHandlers.onInstallFailed?.()
          activeHandlers = {}
          toast.error("Update install failed", {
            description: "Buddy is still running the current version. Try again in a moment.",
          })
        }
      },
    },
    cancel: {
      label: "Later",
      onClick: () => {
        toast.dismiss(UPDATE_READY_TOAST_ID)
        activeHandlers.onDeferred?.()
        activeHandlers = {}
      },
    },
  })
}
