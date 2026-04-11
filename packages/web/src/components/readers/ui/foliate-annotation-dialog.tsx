import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Textarea,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
      <DialogContent className="gap-4 sm:max-w-lg">
        <DialogHeader className="gap-1">
          <DialogTitle className="text-base">
            {dialog.mode === "edit" ? "Edit annotation" : "New annotation"}
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            {dialog.mode === "edit"
              ? "Adjust style or note."
              : "Choose a style and optionally add a note."}
          </DialogDescription>
        </DialogHeader>

        {/* Selected text preview */}
        <div className="rounded border-l-2 border-border-base/60 bg-surface-weak/30 px-3 py-2 text-[12px] leading-relaxed text-text-weak">
          {dialog.text || selectionToolbarText || "Selected text"}
        </div>

        {/* Style + color selects */}
        <div className="grid grid-cols-2 gap-2">
          <Select value={dialog.style} onValueChange={onChangeStyle}>
            <SelectTrigger className="h-8 text-[12px]">
              <SelectValue placeholder="Style" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ANNOTATION_STYLE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Color picker — swatches */}
          <div className="flex items-center gap-1.5 rounded border border-border-base/50 px-2.5">
            {Object.entries(ANNOTATION_COLORS).map(([id, def]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  if (validateColor(id)) onChangeColor(id)
                }}
                aria-label={def.label}
                className={cn(
                  "size-4 rounded-full transition-transform",
                  def.previewClassName,
                  dialog.color === id
                    ? "scale-110 ring-1 ring-border-base ring-offset-1"
                    : "opacity-60 hover:opacity-90",
                )}
              />
            ))}
          </div>
        </div>

        {/* Note textarea */}
        <Textarea
          value={dialog.note}
          onChange={(e) => onChangeNote(e.target.value)}
          placeholder="Add a note (optional)"
          rows={4}
          className="resize-none text-[12px]"
        />

        <DialogFooter className="gap-2 sm:gap-1">
          {dialog.mode === "edit" && onDelete ? (
            <Button
              variant="outline"
              onClick={onDelete}
              className="mr-auto h-8 text-[12px] text-text-weak"
            >
              Delete
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onCancel} className="h-8 text-[12px]">
            Cancel
          </Button>
          <Button onClick={onSave} className="h-8 text-[12px]">
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
