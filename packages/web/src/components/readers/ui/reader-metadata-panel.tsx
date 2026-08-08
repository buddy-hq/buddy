import { BookOpenIcon } from "@/icons/app-icons"
import { Separator } from "@buddy/ui"
import type { ReaderSnapshot } from "../reader-types"
import { READER_EMPTY_METADATA_MESSAGE } from "./reader-ui-constants"

type ReaderMetadataPanelProps = {
  snapshot: ReaderSnapshot | null
}

export function ReaderMetadataPanel({ snapshot }: ReaderMetadataPanelProps) {
  if (!snapshot) {
    return <p className="px-1 py-4 text-sm text-text-weaker">{READER_EMPTY_METADATA_MESSAGE}</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        {snapshot.coverUrl ? (
          <img
            src={snapshot.coverUrl}
            alt={`${snapshot.title} cover`}
            className="h-24 w-16 shrink-0 rounded-md object-cover shadow-sm"
          />
        ) : (
          <div className="flex h-24 w-16 shrink-0 items-center justify-center rounded-md border bg-surface-weak text-text-weaker">
            <BookOpenIcon className="size-4" aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold leading-snug text-text-strong">
            {snapshot.title}
          </div>
          <div className="mt-1 text-sm text-text-weak">{snapshot.author}</div>
          <div className="mt-2 flex flex-col gap-0.5 text-xs text-text-weaker">
            <span>{snapshot.formatLabel}</span>
            <span>{snapshot.isFixedLayout ? "Fixed layout" : "Reflowable"}</span>
            {snapshot.pageCount !== undefined ? <span>{snapshot.pageCount} pages</span> : null}
          </div>
        </div>
      </div>

      {snapshot.metadata.length > 0 ? (
        <>
          <Separator />
          <dl className="flex flex-col gap-3">
            {snapshot.metadata.map((row) => (
              <div key={row.key}>
                <dt className="text-xs font-medium uppercase tracking-wide text-text-weaker">
                  {row.label}
                </dt>
                <dd className="mt-0.5 text-sm leading-relaxed text-text-base">{row.value}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : (
        <p className="text-sm text-text-weaker">{READER_EMPTY_METADATA_MESSAGE}</p>
      )}
    </div>
  )
}
