import { toast } from "@buddy/ui"
import { language } from "@/context/language"
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

  toast(language.t("desktopUpdates.updateReadyTitle"), {
    id: UPDATE_READY_TOAST_ID,
    description: args.version
      ? language.t("desktopUpdates.updateReadyWithVersion", { version: args.version })
      : language.t("desktopUpdates.updateReadyNoVersion"),
    duration: Number.POSITIVE_INFINITY,
    action: {
      label: language.t("desktopUpdates.installAndRestart"),
      onClick: async () => {
        toast.dismiss(UPDATE_READY_TOAST_ID)

        try {
          await args.platform.update?.()
        } catch {
          activeHandlers.onInstallFailed?.()
          activeHandlers = {}
          toast.error(language.t("desktopUpdates.updateInstallFailedTitle"), {
            description: language.t("desktopUpdates.updateInstallFailedDescription"),
          })
        }
      },
    },
    cancel: {
      label: language.t("desktopUpdates.later"),
      onClick: () => {
        toast.dismiss(UPDATE_READY_TOAST_ID)
        activeHandlers.onDeferred?.()
        activeHandlers = {}
      },
    },
  })
}
