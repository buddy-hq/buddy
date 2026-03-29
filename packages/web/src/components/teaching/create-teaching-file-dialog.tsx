import { useRef, useState } from "react"
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

type CreateTeachingFileDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (relativePath: string) => void
}

export function CreateTeachingFileDialog(props: CreateTeachingFileDialogProps) {
  const [value, setValue] = useState<string>(language.t("teaching.createFileDialog.defaultPath"))
  const inputRef = useRef<HTMLInputElement>(null)

  function handleConfirm() {
    const trimmed = value.trim()
    if (!trimmed) return
    props.onConfirm(trimmed)
    props.onOpenChange(false)
    setValue(language.t("teaching.createFileDialog.defaultPath"))
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault()
      handleConfirm()
    }
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={(next) => {
        if (!next) setValue(language.t("teaching.createFileDialog.defaultPath"))
        props.onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{language.t("teaching.createFileDialog.title")}</DialogTitle>
          <DialogDescription>
            {language.t("teaching.createFileDialog.description")}
          </DialogDescription>
        </DialogHeader>
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={language.t("teaching.createFileDialog.defaultPath")}
          autoFocus
          className="mt-1"
          aria-label={language.t("teaching.createFileDialog.filePathAria")}
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
            {language.t("common.cancel")}
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={!value.trim()}>
            {language.t("teaching.createFileDialog.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
