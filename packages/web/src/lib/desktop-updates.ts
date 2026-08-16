import { toast } from "@buddy/ui"
import { language } from "@/context/language"
import type { Platform, UpdateProgressSnapshot } from "@/context/platform"

const UPDATE_TOAST_ID_PREFIX = "buddy-desktop-update"
let updateToastSequence = 0
type UpdateToastHandlers = {
  onDeferred?: () => void
  onInstallFailed?: () => void
}

let activeToast: {
  id: string
  status: UpdateProgressSnapshot["status"]
} | null = null
let activeHandlers: UpdateToastHandlers = {}

function clearUpdateToastTransitionOptions() {
  return {
    action: undefined,
    cancel: undefined,
    onAutoClose: undefined,
    onDismiss: undefined,
  }
}

function transitionUpdateToast(status: UpdateProgressSnapshot["status"]): string {
  if (activeToast === null) {
    updateToastSequence += 1
    activeToast = {
      id: `${UPDATE_TOAST_ID_PREFIX}-${updateToastSequence}`,
      status,
    }
    return activeToast.id
  }

  activeToast.status = status
  return activeToast.id
}

function clearUpdateToast(id: string) {
  if (activeToast?.id !== id) return

  activeToast = null
  activeHandlers = {}
}

function dismissUpdateToast() {
  if (activeToast === null) return

  const { id } = activeToast
  clearUpdateToast(id)
  toast.dismiss(id)
}

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

  const toastId = transitionUpdateToast("ready")
  toast.success(language.t("desktopUpdates.updateReadyTitle"), {
    id: toastId,
    description: args.version
      ? language.t("desktopUpdates.updateReadyWithVersion", { version: args.version })
      : language.t("desktopUpdates.updateReadyNoVersion"),
    duration: Number.POSITIVE_INFINITY,
    onAutoClose: undefined,
    onDismiss: () => {
      if (activeToast?.id !== toastId) return

      const onDeferred = activeHandlers.onDeferred
      clearUpdateToast(toastId)
      onDeferred?.()
    },
    action: {
      label: language.t("desktopUpdates.installAndRestart"),
      onClick: async (event) => {
        event.preventDefault()
        const onInstallFailed = activeHandlers.onInstallFailed

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
          onInstallFailed?.()
          dismissUpdateToast()
          toast.error(language.t("desktopUpdates.updateInstallFailedTitle"), {
            description: language.t("desktopUpdates.updateInstallFailedDescription"),
          })
        }
      },
    },
    cancel: {
      label: language.t("desktopUpdates.later"),
      onClick: () => {
        activeHandlers.onDeferred?.()
        dismissUpdateToast()
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
      if (!args.showChecking || activeToast?.status === "ready") return
      const checkingToastId = transitionUpdateToast("checking")
      toast.loading(language.t("desktopUpdates.checkingTitle"), {
        id: checkingToastId,
        description: undefined,
        duration: Number.POSITIVE_INFINITY,
        ...clearUpdateToastTransitionOptions(),
      })
      return
    case "downloading":
      const downloadingToastId = transitionUpdateToast("downloading")
      activeHandlers = {}
      toast.loading(language.t("desktopUpdates.downloadingTitle"), {
        id: downloadingToastId,
        description: updateProgressDescription(args.progress),
        duration: Number.POSITIVE_INFINITY,
        ...clearUpdateToastTransitionOptions(),
      })
      return
    case "installing":
      const installingToastId = transitionUpdateToast("installing")
      toast.loading(language.t("desktopUpdates.installingTitle"), {
        id: installingToastId,
        description: language.t("desktopUpdates.installingDescription"),
        duration: Number.POSITIVE_INFINITY,
        ...clearUpdateToastTransitionOptions(),
      })
      return
    case "error":
      if (args.progress.version === undefined && activeToast?.status === "ready") {
        return
      }
      dismissUpdateToast()
      return
    case "ready":
      if (activeToast?.status === "ready") return
      const readyToastId = transitionUpdateToast("ready")
      activeHandlers = {}
      toast.success(language.t("desktopUpdates.updateReadyTitle"), {
        id: readyToastId,
        description: args.progress.version
          ? language.t("desktopUpdates.updateReadyWithVersion", {
              version: args.progress.version,
            })
          : language.t("desktopUpdates.updateReadyNoVersion"),
        duration: undefined,
        action: undefined,
        cancel: undefined,
        onAutoClose: () => {
          clearUpdateToast(readyToastId)
        },
      })
      return
    case "idle":
      dismissUpdateToast()
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
