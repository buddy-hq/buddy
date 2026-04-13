import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Textarea,
  Button,
  ToggleGroup,
  ToggleGroupItem,
  cn,
} from "@buddy/ui"
import type { ReaderAnnotationDialogState } from "../foliate-reader-types"
import { ANNOTATION_COLORS, ANNOTATION_STYLE_LABELS } from "../foliate-reader-constants"

export interface FoliateAnnotationDialogProps {
  dialog: ReaderAnnotationDialogState | null
  selectionToolbarText: string | null
  isReaderAnnotationColorId: (value: string) => value is any
  onChangeNote: (note: string) => void
  onChangeStyle: (style: any) => void
  onChangeColor: (color: any) => void
  onSave: () => void
  onCancel: () => void
  onDelete?: () => void
}

export function FoliateAnnotationDialog({
  dialog,
  selectionToolbarText,
  isReaderAnnotationColorId: validateColor,
  onChangeNote,
  onChangeStyle,
  onChangeColor,
  onSave,
  onCancel,
  onDelete,
}: FoliateAnnotationDialogProps) {
  if (!dialog) return null

  return (
    <Dialog open={Boolean(dialog)} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="gap-0 p-0 sm:max-w-[420px] rounded-xl border border-border-base/50 shadow-xl overflow-hidden bg-surface-raised-base block">
        <DialogHeader className="px-5 py-4 border-b border-border-base/30 bg-surface-base">
          <DialogTitle className="text-[14px] font-medium text-text-base text-left">
            {dialog.mode === "edit" ? "Edit Annotation" : "New Annotation"}
          </DialogTitle>
          <DialogDescription className="text-[12px] text-text-weak mt-1 text-left">
            {dialog.mode === "edit"
              ? "Adjust style or your personal note."
              : "Choose a style and add a personal note."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col">
          {/* Selected text preview */}
          <div className="px-5 py-3 border-b border-border-base/30 bg-surface-base/50 overflow-hidden">
            <div className="relative rounded border-l-2 border-text-base/20 bg-surface-base px-3 py-2 text-[12px] leading-relaxed text-text-weak italic shadow-sm overflow-y-auto max-h-[80px] break-words">
              "{dialog.text || selectionToolbarText || "Selected text"}"
            </div>
          </div>

          <div className="flex flex-col px-5 py-4 space-y-4 bg-surface-raised-base">
            {/* Style + color selects */}
            <div className="flex items-center gap-3">
              <ToggleGroup
                type="single"
                variant="outline"
                value={dialog.style}
                onValueChange={(val) => {
                  if (val) onChangeStyle(val)
                }}
                className="flex flex-1"
              >
                {Object.entries(ANNOTATION_STYLE_LABELS).map(([value, label]) => (
                  <ToggleGroupItem key={value} value={value} className="flex-1 h-8 text-[11px] font-medium">
                    {label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>

              {/* Color picker — swatches */}
              <div className="flex items-center gap-2 p-1.5 rounded-md border border-border-interactive-base/20 bg-surface-base h-8 shadow-sm">
                {Object.entries(ANNOTATION_COLORS).map(([id, def]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      if (validateColor(id)) onChangeColor(id)
                    }}
                    aria-label={def.label}
                    style={{ backgroundColor: def.value }}
                    className={cn(
                      "size-[18px] rounded-full shadow-sm flex items-center justify-center transition-transform active:scale-95 border border-black/5",
                      dialog.color === id
                        ? "ring-2 ring-text-interactive-base ring-offset-2 ring-offset-surface-base scale-90"
                        : "opacity-80 hover:opacity-100 hover:scale-105",
                    )}
                  />
                ))}
              </div>
            </div>

            {/* Note textarea */}
            <div className="relative">
              <Textarea
                value={dialog.note || ""}
                onChange={(e) => onChangeNote(e.target.value)}
                placeholder="Write a note... (optional)"
                rows={3}
                className="resize-none text-[13px] bg-surface-base border-border-base/40 focus-visible:ring-1 focus-visible:ring-border-base/50 placeholder:text-text-weaker min-h-[80px] shadow-sm"
              />
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-border-base/30 bg-surface-base flex items-center justify-between">
          <div>
            {dialog.mode === "edit" && onDelete ? (
              <Button
                variant="ghost"
                onClick={onDelete}
                className="h-8 px-3 text-[12px] font-medium text-text-critical hover:text-text-critical hover:bg-surface-critical-weak"
              >
                Delete
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onCancel} className="h-8 px-4 text-[12px] font-medium text-text-weak hover:text-text-base hover:bg-surface-weak">
              Cancel
            </Button>
            <Button onClick={onSave} className="h-8 px-4 text-[12px] font-medium shadow-sm transition-transform active:scale-95">
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
