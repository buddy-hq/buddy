import { NoteIcon } from "@/icons/app-icons"
import { language } from "@/context/language"

/**
 * Quotes the message into the composer and puts it in note mode, rather than
 * opening a second place to type. One note-taking surface, and the quote can be
 * dismissed like any other selection clip.
 */
export function MessageNoteAction(props: { className?: string; onQuote: () => void }) {
  return (
    <button
      type="button"
      data-action="message-add-note"
      className={props.className}
      aria-label={language.t("notes.action.add")}
      title={language.t("notes.action.add")}
      onClick={(event) => {
        event.stopPropagation()
        props.onQuote()
      }}
    >
      <NoteIcon className="h-4 w-4" aria-hidden />
    </button>
  )
}
