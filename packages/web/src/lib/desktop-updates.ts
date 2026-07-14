import { toast } from "@buddy/ui"
import { language } from "@/context/language"
import type { Platform, UpdateProgressSnapshot } from "@/context/platform"

const UPDATE_PROGRESS_TOAST_ID = "buddy-desktop-update-progress"
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
          const currentProgress = await args.platform.getUpdateProgress?.().catch(() => undefined)
          showDesktopUpdateProgressToast({
            progress: {
              percent: 100,
              ring: currentProgress?.ring ?? "stable",
              status: "installing",
              version: args.version ?? currentProgress?.version,
            },
          })
          await args.platform.update?.()
        } catch {
          toast.dismiss(UPDATE_PROGRESS_TOAST_ID)
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

export function showDesktopUpdateProgressToast(args: {
  progress: UpdateProgressSnapshot
  showChecking?: boolean
}) {
  switch (args.progress.status) {
    case "checking":
      if (!args.showChecking) return
      toast(language.t("desktopUpdates.checkingTitle"), {
        id: UPDATE_PROGRESS_TOAST_ID,
        duration: Number.POSITIVE_INFINITY,
      })
      return
    case "downloading":
      toast.dismiss(UPDATE_READY_TOAST_ID)
      toast(language.t("desktopUpdates.downloadingTitle"), {
        id: UPDATE_PROGRESS_TOAST_ID,
        description: updateProgressDescription(args.progress),
        duration: Number.POSITIVE_INFINITY,
      })
      return
    case "installing":
      toast.dismiss(UPDATE_READY_TOAST_ID)
      toast(language.t("desktopUpdates.installingTitle"), {
        id: UPDATE_PROGRESS_TOAST_ID,
        description: language.t("desktopUpdates.installingDescription"),
        duration: Number.POSITIVE_INFINITY,
      })
      return
    case "error":
      if (args.progress.version !== undefined) {
        toast.dismiss(UPDATE_READY_TOAST_ID)
      }
      toast.dismiss(UPDATE_PROGRESS_TOAST_ID)
      return
    case "ready":
      toast.dismiss(UPDATE_PROGRESS_TOAST_ID)
      return
    case "idle":
      toast.dismiss(UPDATE_READY_TOAST_ID)
      toast.dismiss(UPDATE_PROGRESS_TOAST_ID)
      return
  }
}

function updateProgressDescription(progress: UpdateProgressSnapshot): string {
  if (typeof progress.percent === "number" && Number.isFinite(progress.percent)) {
    return language.t("desktopUpdates.downloadProgressPercent", {
      percent: String(Math.round(progress.percent)),
    })
  }

  if (typeof progress.transferredBytes === "number" && Number.isFinite(progress.transferredBytes)) {
    return language.t("desktopUpdates.downloadProgressBytes", {
      transferred: formatBytes(progress.transferredBytes),
    })
  }

  return language.t("desktopUpdates.downloadProgressPreparing")
}

function formatBytes(bytes: number): string {
  if (bytes < 1_024) {
    return `${bytes} B`
  }

  const kib = bytes / 1_024
  if (kib < 1_024) {
    return `${Math.round(kib)} KB`
  }

  const mib = kib / 1_024
  return `${mib.toFixed(mib >= 10 ? 0 : 1)} MB`
}
