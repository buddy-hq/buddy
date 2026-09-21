import { useState } from "react"
import type { UpdateRing } from "@buddy/update-contract"
import { pendingUpdateVersion, resolveUpdateAction } from "@buddy/update-contract"
import { toast } from "@buddy/ui"
import { language } from "@/context/language"
import { useUpdateCommands, useUpdateState } from "@/state/desktop-update"

export type UpdateInstallConfirmation = {
  readonly open: boolean
  readonly version: string | undefined
  readonly onOpenChange: (open: boolean) => void
  readonly onConfirm: () => void
}

function showDownloadedToast(version: string) {
  toast.success(language.t("updates.toast.downloadedTitle", { version }), {
    id: `buddy-update-downloaded-${version}`,
    description: language.t("updates.toast.downloadedDescription"),
  })
}

export function useUpdateControl() {
  const state = useUpdateState()
  const commands = useUpdateCommands()
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const action = resolveUpdateAction(state)

  const perform = () => {
    switch (action) {
      case "check":
        void commands.check()
        return
      case "download":
        void commands.download().then((next) => {
          if (next?.activity.status === "downloaded") showDownloadedToast(next.activity.version)
        })
        return
      case "install":
        setConfirmationOpen(true)
        return
      case "none":
        return
    }
  }

  return {
    state,
    action,
    perform,
    check: () => void commands.check(),
    setRing: async (ring: UpdateRing) => {
      try {
        await commands.setRing(ring)
      } catch {
        toast.error(language.t("settings.updates.ringSaveFailed"))
      }
    },
    confirmation: {
      open: confirmationOpen,
      version: pendingUpdateVersion(state),
      onOpenChange: setConfirmationOpen,
      onConfirm: () => void commands.install(),
    },
  }
}
