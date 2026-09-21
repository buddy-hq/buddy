import type { UpdateReleaseNote } from "@buddy/update-contract"
import { Separator } from "@buddy/ui"
import { language } from "@/context/language"

type UpdateReleaseNotesProps = {
  notes: readonly UpdateReleaseNote[]
  onOpenRelease: (url: string) => void
}

function releaseLinkLabel(note: UpdateReleaseNote): string {
  const omitted = note.totalItems - note.items.length
  if (omitted <= 0) return language.t("updates.releaseNotes.viewRelease")
  if (omitted === 1) return language.t("updates.releaseNotes.moreChangesOne")
  return language.t("updates.releaseNotes.moreChanges", { count: omitted })
}

export function UpdateReleaseNotes(props: UpdateReleaseNotesProps) {
  if (props.notes.length === 0) return null

  return (
    <div className="flex max-h-80 flex-col gap-3 overflow-y-auto">
      {props.notes.map((note, index) => (
        <section key={note.version} className="flex flex-col gap-2">
          {index > 0 ? <Separator /> : null}
          <h3 className="text-xs font-medium text-text-strong">
            {index === 0
              ? language.t("updates.releaseNotes.title")
              : language.t("updates.releaseNotes.versionTitle", { version: note.version })}
          </h3>
          <ul className="flex list-disc flex-col gap-1 pl-4 text-xs text-text-base">
            {note.items.map((item) => (
              <li key={item} className="break-words">
                {item}
              </li>
            ))}
          </ul>
          <button
            type="button"
            data-action="update-release-notes-open"
            className="self-start text-xs text-text-weak underline decoration-dotted underline-offset-4 hover:text-text-strong focus-visible:text-text-strong"
            onClick={() => props.onOpenRelease(note.url)}
          >
            {releaseLinkLabel(note)}
          </button>
        </section>
      ))}
    </div>
  )
}
