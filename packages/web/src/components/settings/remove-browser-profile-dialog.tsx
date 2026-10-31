import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
} from "@buddy/ui"
import type { InAppBrowserProfile } from "@buddy/browser-contract/profiles"

export function RemoveBrowserProfileDialog(props: {
  profile: InAppBrowserProfile | null
  removing: boolean
  error: string | null
  onCancel: () => void
  onRemove: (profile: InAppBrowserProfile) => void
}) {
  const { profile } = props
  return (
    <AlertDialog
      open={profile !== null}
      onOpenChange={(open) => {
        if (!open && !props.removing) props.onCancel()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove “{profile?.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            Deletes this profile’s cookies and logins. Existing tabs stay open until closed.
          </AlertDialogDescription>
          {props.error ? (
            <p aria-live="polite" className="text-sm text-icon-critical-base">
              {props.error}
            </p>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="outline" size="default" disabled={props.removing}>
            Cancel
          </AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={props.removing}
            onClick={() => {
              if (profile) props.onRemove(profile)
            }}
          >
            {props.removing ? "Removing…" : "Remove profile"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
