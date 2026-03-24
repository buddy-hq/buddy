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
            <DialogTitle>Archive thread?</DialogTitle>
            <DialogDescription>
              {props.archiveState
                ? `Archive "${props.archiveState.title}" and remove it from the active thread list?`
                : "Archive this thread and remove it from the active thread list?"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={props.onArchiveCancel}
              disabled={props.archiveSaving}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={props.onArchiveConfirm}
              disabled={props.archiveSaving}
            >
              {props.archiveSaving ? "Archiving..." : "Archive"}
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
            <DialogTitle>Rename thread</DialogTitle>
            <DialogDescription>Use a short, meaningful title.</DialogDescription>
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
              Cancel
            </Button>
            <Button
              disabled={props.renameSaving || !props.renameState?.title.trim()}
              onClick={props.onRenameConfirm}
            >
              {props.renameSaving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
