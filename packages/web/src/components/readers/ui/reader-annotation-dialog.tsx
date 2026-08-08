import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldGroup,
  FieldLabel,
  Textarea,
  ToggleGroup,
  ToggleGroupItem,
  cn,
} from "@buddy/ui"
import type {
  ReaderAnnotationColorId,
  ReaderAnnotationEditorViewModel,
  ReaderAnnotationStyle,
} from "../reader-types"
import {
  isReaderAnnotationColorId,
  isReaderAnnotationStyle,
  READER_ANNOTATION_COLOR_OPTIONS,
  READER_ANNOTATION_STYLE_LABELS,
} from "./reader-ui-constants"

type ReaderAnnotationDialogProps = {
  dialog: ReaderAnnotationEditorViewModel | null
  onChangeNote: (note: string) => void
  onChangeStyle: (style: ReaderAnnotationStyle) => void
  onChangeColor: (color: ReaderAnnotationColorId) => void
  onSave: () => void
  onCancel: () => void
  onDelete?: () => void
}

export function ReaderAnnotationDialog({
  dialog,
  onChangeNote,
  onChangeStyle,
  onChangeColor,
  onSave,
  onCancel,
  onDelete,
}: ReaderAnnotationDialogProps) {
  if (!dialog) return null

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{dialog.mode === "edit" ? "Edit annotation" : "New annotation"}</DialogTitle>
          <DialogDescription>
            {dialog.mode === "edit"
              ? "Adjust the annotation style or personal note."
              : "Choose a style and optionally add a personal note."}
          </DialogDescription>
        </DialogHeader>

        <blockquote className="max-h-24 overflow-y-auto rounded-md border-l-2 bg-surface-base px-3 py-2 text-sm italic text-text-weak">
          {dialog.text || "Selected text"}
        </blockquote>

        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel id="reader-annotation-style-label">Annotation style</FieldLabel>
            <ToggleGroup
              type="single"
              variant="outline"
              value={dialog.style}
              aria-labelledby="reader-annotation-style-label"
              onValueChange={(value) => {
                if (isReaderAnnotationStyle(value)) onChangeStyle(value)
              }}
              className="w-full"
            >
              {Object.entries(READER_ANNOTATION_STYLE_LABELS).map(([value, label]) => (
                <ToggleGroupItem key={value} value={value} className="flex-1">
                  {label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>

          <Field>
            <FieldLabel id="reader-annotation-color-label">Annotation color</FieldLabel>
            <ToggleGroup
              type="single"
              value={dialog.color}
              aria-labelledby="reader-annotation-color-label"
              onValueChange={(value) => {
                if (isReaderAnnotationColorId(value)) onChangeColor(value)
              }}
              className="gap-2"
            >
              {READER_ANNOTATION_COLOR_OPTIONS.map((option) => (
                <ToggleGroupItem
                  key={option.id}
                  value={option.id}
                  aria-label={option.label}
                  className="size-8 rounded-full p-1"
                >
                  <span
                    aria-hidden="true"
                    className={cn("size-4 rounded-full", option.previewClassName)}
                  />
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>

          <Field>
            <FieldLabel htmlFor="reader-annotation-note">Note</FieldLabel>
            <Textarea
              id="reader-annotation-note"
              value={dialog.note}
              onChange={(event) => onChangeNote(event.target.value)}
              placeholder="Write a note (optional)"
              rows={3}
              className="resize-none"
            />
          </Field>
        </FieldGroup>

        <DialogFooter className="justify-between sm:justify-between">
          <div>
            {dialog.mode === "edit" && onDelete ? (
              <Button type="button" variant="destructive" onClick={onDelete}>
                Delete
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="button" onClick={onSave}>
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
