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

type ConfirmRemoveMathRuntimeDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function ConfirmRemoveMathRuntimeDialog(props: ConfirmRemoveMathRuntimeDialogProps) {
  return (
    <AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {language.t("settings.advanced.removeAdvancedMathTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {language.t("settings.advanced.removeAdvancedMathDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="outline" size="default">
            {language.t("common.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="default"
            size="default"
            onClick={() => {
              props.onConfirm()
              props.onOpenChange(false)
            }}
          >
            {language.t("settings.advanced.remove")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
