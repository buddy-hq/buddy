import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@buddy/ui"
import { useLinkDestinationDialogStore } from "@/state/link-destination-dialog-store"

function linkHost(url: string): string {
  if (!URL.canParse(url)) return url
  return new URL(url).hostname.replace(/^www\./u, "")
}

export function LinkDestinationDialog() {
  const request = useLinkDestinationDialogStore((state) => state.request)
  const resolveRequest = useLinkDestinationDialogStore((state) => state.resolveRequest)
  const destination = request ? linkHost(request.url) : "this link"

  return (
    <AlertDialog
      open={request !== undefined}
      onOpenChange={(open) => {
        if (!open) resolveRequest("cancel")
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Open links in Buddy?</AlertDialogTitle>
          <AlertDialogDescription>
            {`Open ${destination} and future links in Buddy? Change this in Settings → Browser.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction variant="secondary" onClick={() => resolveRequest("system")}>
            Use default browser
          </AlertDialogAction>
          <AlertDialogAction onClick={() => resolveRequest("browser")}>
            Open in Buddy
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
