import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@buddy/ui"
import { useWorkspaceFileOpenDialogStore } from "@/state/workspace-file-open-dialog-store"
import { fileNameFromPath } from "@/lib/workspace-file-paths"

const BYTES_PER_MEGABYTE = 1_000_000

function formatFileSize(sizeBytes: number) {
  return `${(sizeBytes / BYTES_PER_MEGABYTE).toFixed(1)} MB`
}

export function WorkspaceFileOpenDialog() {
  const request = useWorkspaceFileOpenDialogStore((state) => state.request)
  const resolveRequest = useWorkspaceFileOpenDialogStore((state) => state.resolveRequest)

  return (
    <Dialog
      open={request !== undefined}
      onOpenChange={(open) => {
        if (!open) resolveRequest("cancel")
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Open large file?</DialogTitle>
          <DialogDescription>
            {request
              ? `${fileNameFromPath(request.path) || request.path} is ${formatFileSize(request.sizeBytes)}. Opening it in Buddy may use significant memory.`
              : "This file may use significant memory."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          {request?.canOpenDefaultApp ? (
            <Button type="button" variant="outline" onClick={() => resolveRequest("default-app")}>
              Open in default app
            </Button>
          ) : null}
          <Button type="button" onClick={() => resolveRequest("open")}>
            Open anyway
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
