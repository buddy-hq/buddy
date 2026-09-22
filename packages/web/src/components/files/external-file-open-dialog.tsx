import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@buddy/ui"
import { language } from "@/context/language"
import { useExternalFileOpenDialogStore } from "@/state/external-file-open-dialog-store"
import { fileNameFromPath } from "@/lib/workspace-file-paths"

export function ExternalFileOpenDialog() {
  const request = useExternalFileOpenDialogStore((state) => state.request)
  const resolveRequest = useExternalFileOpenDialogStore((state) => state.resolveRequest)

  return (
    <AlertDialog
      open={request !== undefined}
      onOpenChange={(open) => {
        if (!open) resolveRequest("cancel")
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Open a file outside this notebook?</AlertDialogTitle>
          <AlertDialogDescription>
            {request
              ? `${fileNameFromPath(request.path) || request.path} is at ${request.path}. Buddy will show it read-only.`
              : "Buddy will show this file read-only."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{language.t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction variant="secondary" onClick={() => resolveRequest("always")}>
            Always allow
          </AlertDialogAction>
          <AlertDialogAction onClick={() => resolveRequest("open")}>Open</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
