import { useEffect, useMemo, useRef, useState } from "react"
import { CITATION_MAX_COMMENT_LENGTH } from "@buddy/citation-contract"
import { detectPlatform } from "@tanstack/react-hotkeys"
import {
  CheckIcon,
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
  Textarea,
  XIcon,
} from "@buddy/ui"
import { PencilLineIcon } from "@/icons/app-icons"
import { shouldSubmitComposer } from "@/lib/chat-input"
import { usePhysicalModifierKeys } from "@/lib/use-physical-modifier-keys"
import {
  consumeCitationCommentRequest,
  type CitationCommentSource,
} from "@/lib/citations/comment-request"

export function CitationCommentPopover(props: {
  citationID: string | undefined
  comment: string
  onSave: (comment: string) => void
  onSend?: (comment: string) => boolean | void
  canSend?: boolean
  onReturnFocus?: () => void
  triggerClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(props.comment)
  const [source, setSource] = useState<CitationCommentSource>()
  const physicalModifiers = usePhysicalModifierKeys(open)
  const sourceAnchorRef = useMemo(() => (source ? { current: source } : undefined), [source])
  // Committing a comment hands focus back to the composer so the next Enter
  // sends the prompt instead of reopening this popover from its trigger.
  const returnFocusToComposerRef = useRef(false)
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
  const isMac = detectPlatform() === "mac"
  const sendShortcut = isMac ? "⌘↵" : "Ctrl+↵"
  const save = () => {
    if (tooLong) return
    props.onSave(draft)
    returnFocusToComposerRef.current = true
    close()
  }
  const send = () => {
    if (tooLong || !props.onSend || props.canSend === false) return
    if (props.onSend(draft) === false) return
    returnFocusToComposerRef.current = true
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
        onCloseAutoFocus={(event) => {
          // Opened from the source selection, the trigger was never focused,
          // so there is nothing to return to except the composer.
          const toComposer = returnFocusToComposerRef.current || source !== undefined
          returnFocusToComposerRef.current = false
          if (!toComposer || !props.onReturnFocus) return
          event.preventDefault()
          props.onReturnFocus()
        }}
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
              return
            }
            if (
              !shouldSubmitComposer({
                key: event.key,
                shiftKey: event.shiftKey,
                ctrlKey: event.ctrlKey,
                metaKey: event.metaKey,
                altKey: event.altKey,
                isComposing: event.nativeEvent.isComposing,
                rightCommandPressed: physicalModifiers.current.rightCommandPressed,
                physicalShiftPressed: physicalModifiers.current.shiftPressed,
                physicalAltPressed: physicalModifiers.current.altPressed,
              })
            ) {
              return
            }
            event.preventDefault()
            if ((event.metaKey || event.ctrlKey) && props.onSend && props.canSend !== false) send()
            else save()
          }}
        />
        {tooLong ? (
          <p role="status" className="pt-1 text-xs text-icon-critical-base">
            Comments can contain up to {CITATION_MAX_COMMENT_LENGTH.toLocaleString()} characters.
          </p>
        ) : null}
        <div className="mt-2 flex items-center justify-end gap-2">
          <div className="group relative">
            <button
              type="button"
              aria-label="Cancel citation comment"
              onClick={close}
              className="flex size-8 items-center justify-center rounded-full text-text-weak hover:bg-surface-weak hover:text-text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-interactive-base"
            >
              <XIcon className="size-4" aria-hidden />
            </button>
            <div
              role="tooltip"
              className="invisible pointer-events-none absolute bottom-full left-0 z-10 w-34 origin-bottom-left scale-[0.98] pb-2 opacity-0 transition-[opacity,transform] duration-100 group-hover:visible group-hover:pointer-events-auto group-hover:scale-100 group-hover:opacity-100 group-focus-within:visible group-focus-within:pointer-events-auto group-focus-within:scale-100 group-focus-within:opacity-100 motion-reduce:duration-0"
            >
              <div className="flex items-center justify-between rounded-xl border border-border-weak-base bg-surface-raised-base px-3 py-2 text-xs text-text-base shadow-lg">
                <span>Cancel</span>
                <kbd className="rounded-md bg-surface-weak px-1.5 py-0.5 font-sans text-[11px] text-text-weak">
                  Esc
                </kbd>
              </div>
            </div>
          </div>
          <div className="group relative">
            <button
              type="button"
              aria-label="Add citation comment"
              disabled={tooLong}
              onClick={save}
              className="flex size-8 items-center justify-center rounded-full bg-surface-interactive-base text-text-on-interactive-base active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-interactive-base"
            >
              <CheckIcon className="size-4" aria-hidden />
            </button>
            <div className="invisible pointer-events-none absolute right-0 bottom-full z-10 w-34 origin-bottom-right scale-[0.98] pb-2 opacity-0 transition-[opacity,transform] duration-100 group-hover:visible group-hover:pointer-events-auto group-hover:scale-100 group-hover:opacity-100 group-focus-within:visible group-focus-within:pointer-events-auto group-focus-within:scale-100 group-focus-within:opacity-100 motion-reduce:duration-0">
              <div className="rounded-xl border border-border-weak-base bg-surface-raised-base p-1.5 text-xs text-text-base shadow-lg">
                <button
                  type="button"
                  disabled={tooLong}
                  onClick={save}
                  className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left hover:bg-surface-weak disabled:cursor-not-allowed disabled:opacity-50 focus-visible:bg-surface-weak focus-visible:outline-none"
                >
                  <span>Add</span>
                  <kbd className="rounded-md bg-surface-weak px-1.5 py-0.5 font-sans text-[11px] text-text-weak">
                    ↵
                  </kbd>
                </button>
                {props.onSend ? (
                  <button
                    type="button"
                    disabled={tooLong || props.canSend === false}
                    onClick={send}
                    className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left hover:bg-surface-weak disabled:cursor-not-allowed disabled:opacity-50 focus-visible:bg-surface-weak focus-visible:outline-none"
                  >
                    <span>Send</span>
                    <kbd className="rounded-md bg-surface-weak px-1.5 py-0.5 font-sans text-[11px] text-text-weak">
                      {sendShortcut}
                    </kbd>
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
