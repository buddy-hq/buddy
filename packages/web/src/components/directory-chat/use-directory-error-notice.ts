import { useEffect, useRef } from "react"
import { toast } from "@buddy/ui"
import { language } from "@/context/language"
import { copyToClipboard } from "@/lib/directory-chat/chat-debug-helpers"
import { isNotebookFolderMissingError } from "@/state/chat-actions"
import { useChatStore } from "@/state/chat-store"
import type { DirectoryActionError } from "@/state/chat-types"
import { showNotebookFolderMissing } from "./show-notebook-folder-missing"

const CONFIG_INVALID_ERROR_CODE = "config.invalid"
const INTERNAL_ERROR_CODE = "internal"
const NOTEBOOK_MISSING_ERROR_CODE = "notebook.missing"

type DirectoryErrorNoticeActions = {
  onCloseNotebook: (directory: string) => void
  onOpenSettings: () => void
}

function showDirectoryActionError(
  input: { directory: string; error: DirectoryActionError } & DirectoryErrorNoticeActions,
): void {
  const { directory, error } = input
  if (error.code === NOTEBOOK_MISSING_ERROR_CODE || isNotebookFolderMissingError(error.message)) {
    showNotebookFolderMissing({
      directory,
      onCloseNotebook: () => input.onCloseNotebook(directory),
    })
    return
  }

  const id = `directory-action-error:${directory}`
  const errorID = error.errorID
  if (error.code === INTERNAL_ERROR_CODE && errorID) {
    toast.error(language.t("directoryChat.actionError.internal"), {
      id,
      description: language.t("directoryChat.actionError.reference", { id: errorID }),
      action: {
        label: language.t("directoryChat.actionError.copyReference"),
        onClick: () => void copyToClipboard(errorID),
      },
    })
    return
  }
  if (error.code === CONFIG_INVALID_ERROR_CODE) {
    toast.error(error.message, {
      id,
      action: {
        label: language.t("directoryChat.actionError.openSettings"),
        onClick: input.onOpenSettings,
      },
    })
    return
  }
  toast.error(error.message, { id })
}

function isSameNotice(
  left: DirectoryActionError | undefined,
  right: DirectoryActionError | undefined,
) {
  return left?.code === right?.code && left?.message === right?.message
}

export function useDirectoryErrorNotice(
  input: { directory: string | undefined } & DirectoryErrorNoticeActions,
): void {
  const { directory } = input
  const actionsRef = useRef<DirectoryErrorNoticeActions>(input)
  actionsRef.current = input

  useEffect(() => {
    if (!directory) return
    return useChatStore.subscribe((state, previousState) => {
      const error = state.directories[directory]?.error
      const previousError = previousState.directories[directory]?.error
      if (!error || error === previousError || isSameNotice(error, previousError)) return
      showDirectoryActionError({
        directory,
        error,
        onCloseNotebook: (target) => actionsRef.current.onCloseNotebook(target),
        onOpenSettings: () => actionsRef.current.onOpenSettings(),
      })
    })
  }, [directory])
}
