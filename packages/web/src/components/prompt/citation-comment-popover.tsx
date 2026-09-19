import { useEffect, useMemo, useState } from "react"
import { CITATION_MAX_COMMENT_LENGTH } from "@buddy/citation-contract"
import { Button, Popover, PopoverAnchor, PopoverContent, PopoverTrigger, Textarea } from "@buddy/ui"
import { PencilLineIcon } from "@/icons/app-icons"
import {
  consumeCitationCommentRequest,
  type CitationCommentSource,
} from "@/lib/citations/comment-request"

export function CitationCommentPopover(props: {
  citationID: string | undefined
  comment: string
  onSave: (comment: string) => void
  triggerClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(props.comment)
  const [source, setSource] = useState<CitationCommentSource>()
  const sourceAnchorRef = useMemo(() => (source ? { current: source } : undefined), [source])
  const close = () => setOpen(false)
  useEffect(() => {
    if (!props.citationID) return
    const request = consumeCitationCommentRequest(props.citationID)
    if (!request) return
    setSource(request.source)
    setOpen(true)
  }, [props.citationID])
  useEffect(() => {
    if (!open || !source) return
    return source.mark(() => setOpen(false))
  }, [open, source])
  const tooLong = draft.length > CITATION_MAX_COMMENT_LENGTH
  const save = () => {
    if (tooLong) return
    props.onSave(draft)
    close()
  }

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          close()
          return
        }
        setSource(undefined)
        setOpen(true)
        setDraft(props.comment)
      }}
    >
      {sourceAnchorRef ? <PopoverAnchor virtualRef={sourceAnchorRef} /> : null}
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={props.comment ? "Edit citation comment" : "Add citation comment"}
          className={props.triggerClassName}
        >
          <PencilLineIcon className="size-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side={source ? "bottom" : "top"}
        updatePositionStrategy="always"
        hideWhenDetached={source !== undefined}
        aria-label="Edit citation comment"
        className="w-72 max-w-[calc(100vw-1rem)] gap-0 p-3"
      >
        <Textarea
          autoFocus
          aria-label="Comment on cited text"
          aria-invalid={tooLong || undefined}
          placeholder="Add an optional comment..."
          rows={2}
          value={draft}
          className="max-h-40 min-h-16 resize-none rounded-none border-0 bg-transparent px-1 py-1.5 focus-visible:ring-0 aria-invalid:ring-0"
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return
            if (event.key === "Escape") {
              event.preventDefault()
              close()
            }
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              save()
            }
          }}
        />
        {tooLong ? (
          <p role="status" className="pt-1 text-xs text-icon-critical-base">
            Comments can contain up to {CITATION_MAX_COMMENT_LENGTH.toLocaleString()} characters.
          </p>
        ) : null}
        <div className="mt-2 flex items-center justify-end gap-2">
          <Button variant="outline" size="xs" onClick={close}>
            {props.comment ? "Cancel" : "Skip comment"}
          </Button>
          <Button size="xs" disabled={tooLong} onClick={save}>
            {tooLong ? "Shorten comment" : "Save"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
