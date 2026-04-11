import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@buddy/ui"
import { SHORTCUTS } from "../foliate-reader-constants"
import type { ReaderShortcut } from "../foliate-reader-types"

export interface FoliateHelpDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function FoliateHelpDialog({ open, onOpenChange }: FoliateHelpDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <div className="divide-y divide-border-base/30">
          {SHORTCUTS.map((shortcut: ReaderShortcut) => (
            <div key={shortcut.keys} className="flex items-center justify-between gap-4 py-2">
              <span className="text-[12px] text-text-weak">{shortcut.label}</span>
              <code className="shrink-0 rounded bg-surface-weak/60 px-1.5 py-0.5 font-mono text-[10px] text-text-weaker">
                {shortcut.keys}
              </code>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
