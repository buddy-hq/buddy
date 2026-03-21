import { useRef, useState } from 'react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from '@buddy/ui'

type CreateTeachingFileDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (relativePath: string) => void
}

export function CreateTeachingFileDialog(props: CreateTeachingFileDialogProps) {
  const [value, setValue] = useState('helpers.ts')
  const inputRef = useRef<HTMLInputElement>(null)

  function handleConfirm() {
    const trimmed = value.trim()
    if (!trimmed) return
    props.onConfirm(trimmed)
    props.onOpenChange(false)
    setValue('helpers.ts')
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      handleConfirm()
    }
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={(next) => {
        if (!next) setValue('helpers.ts')
        props.onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New teaching file</DialogTitle>
          <DialogDescription>Enter a path relative to the workspace root.</DialogDescription>
        </DialogHeader>
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="helpers.ts"
          autoFocus
          className="mt-1"
          aria-label="File path"
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={!value.trim()}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
