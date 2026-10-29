import { toast } from "@buddy/ui"
import { getFilename } from "@/components/layout/sidebar-helpers"
import { language } from "@/context/language"

export function showNotebookFolderMissing(input: {
  directory: string
  onCloseNotebook: () => void
}): void {
  toast.warning(language.t("directoryChat.folderMissing.title", { name: getFilename(input.directory) }), {
    id: `notebook-folder-missing:${input.directory}`,
    description: language.t("directoryChat.folderMissing.description", { path: input.directory }),
    action: {
      label: language.t("sidebar.closeNotebook"),
      onClick: input.onCloseNotebook,
    },
  })
}
