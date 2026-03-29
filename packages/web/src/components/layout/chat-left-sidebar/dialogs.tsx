import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@buddy/ui"
import { language } from "@/context/language"
import type { ArchiveState, RenameState } from "./types"

type ChatLeftSidebarDialogsProps = {
  archiveState?: ArchiveState
  archiveSaving: boolean
  renameState?: RenameState
  renameSaving: boolean
  onArchiveCancel: () => void
  onArchiveConfirm: () => void
  onRenameCancel: () => void
  onRenameConfirm: () => void
  onRenameTitleChange: (title: string) => void
}

export function ChatLeftSidebarDialogs(props: ChatLeftSidebarDialogsProps) {
  return (
    <>
      <Dialog
        open={props.archiveState !== undefined}
        onOpenChange={(open) => {
          if (!open && !props.archiveSaving) {
            props.onArchiveCancel()
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{language.t("sidebar.archiveThreadTitle")}</DialogTitle>
            <DialogDescription>
              {props.archiveState
                ? language.t("sidebar.archiveThreadQuestion", { title: props.archiveState.title })
                : language.t("sidebar.archiveThreadFallback")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={props.onArchiveCancel}
              disabled={props.archiveSaving}
            >
              {language.t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={props.onArchiveConfirm}
              disabled={props.archiveSaving}
            >
              {props.archiveSaving
                ? language.t("sidebar.archiving")
                : language.t("sidebar.archive")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={props.renameState !== undefined}
        onOpenChange={(open) => {
          if (!open) {
            props.onRenameCancel()
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{language.t("sidebar.renameThread")}</DialogTitle>
            <DialogDescription>{language.t("sidebar.renameThreadHint")}</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={props.renameState?.title ?? ""}
            onChange={(event) => props.onRenameTitleChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                props.onRenameConfirm()
              }
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={props.onRenameCancel}>
              {language.t("common.cancel")}
            </Button>
            <Button
              disabled={props.renameSaving || !props.renameState?.title.trim()}
              onClick={props.onRenameConfirm}
            >
              {props.renameSaving ? language.t("common.saving") : language.t("sidebar.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
