import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { FileTextIcon } from "lucide-react"
import { cn } from "@buddy/ui"
import { resourceCoverQueryOptions, type ResourceFileExtension } from "@/state/resources-query"

const RESOURCE_COVER_FRAME_CLASS =
  "relative aspect-[3/4] overflow-hidden rounded-xl border border-border-weaker-base bg-surface-base"
const RESOURCE_COVER_BUTTON_CLASS =
  "block text-left transition-colors hover:bg-surface-base-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60"
const RESOURCE_COVER_PLACEHOLDER_CLASS =
  "flex size-full flex-col items-center justify-center bg-surface-raised-stronger px-4 text-center"
const RESOURCE_COVER_ICON_FRAME_CLASS =
  "mb-3 flex size-12 items-center justify-center rounded-xl bg-surface-base shadow-sm ring-1 ring-border-weaker-base"
const RESOURCE_COVER_EXTENSION_CLASS =
  "mb-1 text-[10px] font-bold uppercase tracking-widest text-text-weaker"
const RESOURCE_COVER_TITLE_CLASS =
  "line-clamp-3 text-[11px] font-medium leading-relaxed text-text-stronger"

type ResourceCoverContentProps = {
  directory: string
  coverRelpath?: string
  title?: string
  extension: ResourceFileExtension
}

export type ResourceCoverProps = ResourceCoverContentProps & {
  className?: string
}

function useResourceCoverObjectUrl(directory: string, coverRelpath: string | undefined) {
  const coverQuery = useQuery({
    ...resourceCoverQueryOptions(directory, coverRelpath ?? ""),
    enabled: coverRelpath !== undefined,
  })
  const [objectUrl, setObjectUrl] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (!coverQuery.data) {
      setObjectUrl(undefined)
      return
    }

    const nextObjectUrl = URL.createObjectURL(coverQuery.data)
    setObjectUrl(nextObjectUrl)

    return () => {
      URL.revokeObjectURL(nextObjectUrl)
    }
  }, [coverQuery.data])

  return objectUrl
}

function ResourceCoverContent({
  directory,
  coverRelpath,
  title,
  extension,
}: ResourceCoverContentProps) {
  const objectUrl = useResourceCoverObjectUrl(directory, coverRelpath)
  const displayName = title || extension.toUpperCase()

  if (objectUrl) {
    return <img src={objectUrl} alt={displayName} className="size-full object-cover" />
  }

  return (
    <div className={RESOURCE_COVER_PLACEHOLDER_CLASS}>
      <div className={RESOURCE_COVER_ICON_FRAME_CLASS}>
        <FileTextIcon className="size-6 text-text-weaker" />
      </div>
      <span className={RESOURCE_COVER_EXTENSION_CLASS}>{extension}</span>
      <span className={RESOURCE_COVER_TITLE_CLASS}>{displayName}</span>
    </div>
  )
}

export function ResourceCover({ className, ...contentProps }: ResourceCoverProps) {
  return (
    <div className={cn(RESOURCE_COVER_FRAME_CLASS, className)}>
      <ResourceCoverContent {...contentProps} />
    </div>
  )
}

type ResourceCoverButtonProps = ResourceCoverContentProps & {
  onClick: () => void
  ariaLabel: string
  disabled?: boolean
  className?: string
}

/** Clickable book cover tile (library grid + chat full-text ingest). */
export function ResourceCoverButton({
  onClick,
  ariaLabel,
  disabled,
  className,
  ...coverProps
}: ResourceCoverButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        RESOURCE_COVER_FRAME_CLASS,
        RESOURCE_COVER_BUTTON_CLASS,
        className,
      )}
    >
      <ResourceCoverContent {...coverProps} />
    </button>
  )
}
