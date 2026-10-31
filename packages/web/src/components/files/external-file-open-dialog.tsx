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
import { usePlatform } from "@/context/platform"
import { useExternalFileOpenDialogStore } from "@/state/external-file-open-dialog-store"

export function ExternalFileOpenDialog() {
  const platform = usePlatform()
  const request = useExternalFileOpenDialogStore((state) => state.request)
  const resolveRequest = useExternalFileOpenDialogStore((state) => state.resolveRequest)
  const missing = request?.kind === "missing"
  const folderLabel = platform.os === "macos" ? "Reveal in Finder" : "Reveal in File Explorer"

  return (
    <AlertDialog
      open={request !== undefined}
      onOpenChange={(open) => {
        if (!open) resolveRequest("cancel")
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {missing
              ? request.outsideNotebook
                ? "File outside this notebook not found"
                : "Linked file not found"
              : "Open a file outside this notebook?"}
          </AlertDialogTitle>
          <AlertDialogDescription className="min-w-0 break-words">
            {missing
              ? "Buddy couldn't find the linked file at this path:"
              : "Buddy will show it read-only."}
          </AlertDialogDescription>
          {request ? (
            <p className="min-w-0 max-h-40 overflow-y-auto break-all rounded-md bg-surface-weak p-3 font-mono text-xs text-text-base">
              {request.path}
            </p>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter className="min-w-0 sm:flex-wrap">
          <AlertDialogCancel>{missing ? "Close" : language.t("common.cancel")}</AlertDialogCancel>
          {missing ? (
            <>
              <AlertDialogAction variant="secondary" onClick={() => resolveRequest("copy-path")}>
                Copy path
              </AlertDialogAction>
              {request.canShowFolder ? (
                <AlertDialogAction onClick={() => resolveRequest("show-folder")}>
                  {folderLabel}
                </AlertDialogAction>
              ) : null}
            </>
          ) : (
            <>
              <AlertDialogAction variant="secondary" onClick={() => resolveRequest("always")}>
                Always allow
              </AlertDialogAction>
              <AlertDialogAction onClick={() => resolveRequest("open")}>Open</AlertDialogAction>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
