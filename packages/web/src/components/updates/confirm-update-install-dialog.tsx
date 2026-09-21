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

type ConfirmUpdateInstallDialogProps = {
  open: boolean
  version: string
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function ConfirmUpdateInstallDialog(props: ConfirmUpdateInstallDialogProps) {
  return (
    <AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {language.t("updates.confirm.title", { version: props.version })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {language.t("updates.confirm.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="outline" size="default">
            {language.t("common.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            data-action="update-install-confirm"
            variant="default"
            size="default"
            onClick={() => {
              props.onConfirm()
              props.onOpenChange(false)
            }}
          >
            {language.t("updates.confirm.action")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
