import { BookOpenIcon } from "@/icons/app-icons"
import { Separator } from "@buddy/ui"
import { DETAILS_EMPTY_MESSAGE } from "../foliate-reader-constants"
import type { FoliateReaderSnapshot } from "../foliate-reader-types"
import { buildMetadataRows } from "../utils/foliate-helpers"

export interface FoliateMetadataPanelProps {
  snapshot: FoliateReaderSnapshot | null
}

export function FoliateMetadataPanel({ snapshot }: FoliateMetadataPanelProps) {
  if (!snapshot) {
    return <p className="px-1 py-4 text-[12px] text-text-weaker">{DETAILS_EMPTY_MESSAGE}</p>
  }

  const metadataRows = buildMetadataRows(snapshot.metadata)
  const title = snapshot.title
  const author = snapshot.author

  return (
    <div className="space-y-4">
      {/* Cover + basic info */}
      <div className="flex items-start gap-3">
        {snapshot.coverUrl ? (
          <img
            src={snapshot.coverUrl}
            alt={`${title} cover`}
            className="h-24 w-16 shrink-0 rounded object-cover shadow-sm"
          />
        ) : (
          <div className="flex h-24 w-16 shrink-0 items-center justify-center rounded border border-border-base/40 bg-surface-weak/50 text-text-weaker">
            <BookOpenIcon className="size-4" />
          </div>
        )}
        <div className="min-w-0 space-y-1">
          <div className="text-[13px] font-semibold leading-snug text-text-strong">{title}</div>
          <div className="text-[12px] text-text-weak">{author}</div>
          <div className="mt-1 space-y-0.5">
            <div className="text-[10px] text-text-weaker">{snapshot.formatLabel}</div>
            <div className="text-[10px] text-text-weaker">
              {snapshot.isFixedLayout ? "Fixed layout" : "Reflowable"}
            </div>
          </div>
        </div>
      </div>

      {metadataRows.length > 0 ? (
        <>
          <Separator className="opacity-40" />
          <div className="space-y-3">
            {metadataRows.map((row) => (
              <div key={row.key}>
                <div className="text-[10px] font-medium uppercase tracking-[0.1em] text-text-weaker">
                  {row.label}
                </div>
                <div className="mt-0.5 text-[12px] leading-relaxed text-text-base">{row.value}</div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="text-[12px] text-text-weaker">{DETAILS_EMPTY_MESSAGE}</p>
      )}
    </div>
  )
}
