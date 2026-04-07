import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@buddy/ui"
import { InfoIcon } from "lucide-react"
import { language } from "@/context/language"
import type { ArchiveState, RenameState } from "./types"

type NotebookCreationDialogProps = {
  open: boolean
  busy: boolean
  notebookName: string
  title: string
  description: string
  confirmLabel: string
  placeholder: string
  onOpenChange: (open: boolean) => void
  onNotebookNameChange: (name: string) => void
  onCreate: () => void
  onOpenExistingFolder?: () => void
}

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
        <DialogContent data-component="left-sidebar-archive-dialog">
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
              data-action="left-sidebar-archive-cancel"
              variant="outline"
              onClick={props.onArchiveCancel}
              disabled={props.archiveSaving}
            >
              {language.t("common.cancel")}
            </Button>
            <Button
              data-action="left-sidebar-archive-confirm"
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
        <DialogContent data-component="left-sidebar-rename-dialog">
          <DialogHeader>
            <DialogTitle>{language.t("sidebar.renameThread")}</DialogTitle>
            <DialogDescription>{language.t("sidebar.renameThreadHint")}</DialogDescription>
          </DialogHeader>
          <Input
            data-action="left-sidebar-rename-input"
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
            <Button
              data-action="left-sidebar-rename-cancel"
              variant="outline"
              onClick={props.onRenameCancel}
            >
              {language.t("common.cancel")}
            </Button>
            <Button
              data-action="left-sidebar-rename-save"
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

export function NotebookCreationDialog(props: NotebookCreationDialogProps) {
  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open && !props.busy) {
          props.onOpenChange(false)
        }
      }}
    >
      <DialogContent data-component="left-sidebar-create-notebook-dialog">
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
          <DialogDescription>{props.description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            data-action="left-sidebar-create-notebook-input"
            autoFocus
            value={props.notebookName}
            onChange={(event) => props.onNotebookNameChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                props.onCreate()
              }
            }}
            placeholder={props.placeholder}
          />
          {props.onOpenExistingFolder && (
            <div className="flex justify-center pt-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={props.onOpenExistingFolder}
                    className="group inline-flex items-center gap-1.5 text-xs text-text-weak transition-colors hover:text-text-base"
                  >
                    <span className="underline decoration-border-base underline-offset-4 group-hover:decoration-text-weak">
                      {language.t("sidebar.openExistingFolder")}
                    </span>
                    <InfoIcon className="size-3 text-text-weaker transition-colors group-hover:text-text-weak" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={8} className="px-2 py-1 text-[11px]">
                  {language.t("sidebar.openExistingFolderTooltip")}
                </TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            data-action="left-sidebar-create-notebook-cancel"
            variant="outline"
            onClick={() => props.onOpenChange(false)}
            disabled={props.busy}
          >
            {language.t("common.cancel")}
          </Button>
          <Button
            data-action="left-sidebar-create-notebook-confirm"
            onClick={props.onCreate}
            disabled={props.busy || !props.notebookName.trim()}
          >
            {props.busy ? language.t("common.saving") : props.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
