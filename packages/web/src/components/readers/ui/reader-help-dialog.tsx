import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@buddy/ui"
import type { ReaderShortcut } from "../reader-types"

type ReaderHelpDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  shortcuts: ReaderShortcut[]
}

export function ReaderHelpDialog({
  open,
  onOpenChange,
  shortcuts,
}: ReaderHelpDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <dl className="divide-y">
          {shortcuts.map((shortcut) => (
            <div key={shortcut.keys} className="flex items-center justify-between gap-4 py-2">
              <dt className="text-sm text-text-weak">{shortcut.label}</dt>
              <dd>
                <kbd className="rounded-md bg-surface-weak px-1.5 py-0.5 font-mono text-xs text-text-weaker">
                  {shortcut.keys}
                </kbd>
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  )
}
