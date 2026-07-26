import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { cn } from "@buddy/ui"
import { FileTypeIcon } from "@/components/files/file-type-icon"
import { resourceCoverQueryOptions } from "@/state/resources-query"
import { classifyWorkspaceMedia, type WorkspaceMediaKind } from "@/lib/workspace-file-media"

const RESOURCE_COVER_FRAME_CLASS =
  "relative aspect-[3/4] overflow-hidden rounded-xl border border-border-weak-base bg-surface-raised-stronger shadow-sm"
const RESOURCE_COVER_BUTTON_CLASS =
  "block w-full text-left transition-[transform,background-color] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] hover:bg-surface-raised-base-hover active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60"
const RESOURCE_COVER_PLACEHOLDER_CLASS =
  "grid size-full grid-rows-[minmax(0,3fr)_minmax(0,2fr)] bg-surface-raised-stronger"
const RESOURCE_COVER_ICON_CLASS = "size-14 drop-shadow-sm"
const RESOURCE_COVER_EXTENSION_CLASS =
  "text-[10px] font-semibold uppercase tracking-[0.16em]"
const RESOURCE_COVER_TITLE_CLASS =
  "mt-1.5 line-clamp-2 break-words text-[11px] font-medium leading-[1.4] text-text-stronger"
const RESOURCE_COVER_PRESENTATION_TILE = "tile"
const RESOURCE_COVER_PRESENTATION_THUMBNAIL = "thumbnail"

type ResourceCoverPalette = {
  accentClass: string
  heroClass: string
}

const RESOURCE_COVER_DEFAULT_PALETTE: ResourceCoverPalette = {
  accentClass: "text-icon-interactive-base",
  heroClass: "bg-surface-interactive-weak",
}

const RESOURCE_COVER_PALETTE_BY_MEDIA_KIND: Partial<
  Record<WorkspaceMediaKind, ResourceCoverPalette>
> = {
  document: {
    accentClass: "text-icon-info-base",
    heroClass: "bg-surface-info-weak",
  },
  spreadsheet: {
    accentClass: "text-icon-success-base",
    heroClass: "bg-surface-success-weak",
  },
  presentation: {
    accentClass: "text-icon-warning-base",
    heroClass: "bg-surface-warning-weak",
  },
  pdf: {
    accentClass: "text-icon-critical-base",
    heroClass: "bg-surface-critical-weak",
  },
}

type ResourceCoverPresentation =
  | typeof RESOURCE_COVER_PRESENTATION_TILE
  | typeof RESOURCE_COVER_PRESENTATION_THUMBNAIL

type ResourceCoverContentProps = {
  directory: string
  coverRelpath?: string
  title?: string
  extension: string
  fileName?: string
  presentation?: ResourceCoverPresentation
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
  fileName,
  presentation = RESOURCE_COVER_PRESENTATION_TILE,
}: ResourceCoverContentProps) {
  const objectUrl = useResourceCoverObjectUrl(directory, coverRelpath)
  const displayName = title || extension.toUpperCase()
  const thumbnail = presentation === RESOURCE_COVER_PRESENTATION_THUMBNAIL

  if (objectUrl) {
    return (
      <img src={objectUrl} alt={thumbnail ? "" : displayName} className="size-full object-cover" />
    )
  }

  const resolvedFileName = fileName ?? `${title || "resource"}.${extension}`
  if (thumbnail) {
    return (
      <div className="flex size-full items-center justify-center bg-surface-raised-stronger">
        <FileTypeIcon fileName={resolvedFileName} className="size-4" />
      </div>
    )
  }

  const mediaKind = classifyWorkspaceMedia({
    path: resolvedFileName,
    mimeType: undefined,
    sizeBytes: undefined,
  }).mediaKind
  const palette =
    RESOURCE_COVER_PALETTE_BY_MEDIA_KIND[mediaKind] ?? RESOURCE_COVER_DEFAULT_PALETTE

  return (
    <div
      className={RESOURCE_COVER_PLACEHOLDER_CLASS}
      data-resource-format={extension}
      data-resource-media-kind={mediaKind}
    >
      <div
        className={cn(
          "flex min-h-0 items-center justify-center px-4 py-3",
          palette.heroClass,
        )}
      >
        <FileTypeIcon fileName={resolvedFileName} className={RESOURCE_COVER_ICON_CLASS} />
      </div>
      <div className="flex min-h-0 flex-col justify-center overflow-hidden border-t border-border-weaker-base bg-surface-raised-base px-3 py-2 text-left">
        <span className={cn(RESOURCE_COVER_EXTENSION_CLASS, palette.accentClass)}>
          {extension}
        </span>
        <span className={RESOURCE_COVER_TITLE_CLASS}>{displayName}</span>
      </div>
    </div>
  )
}

export function ResourceCover({ className, ...contentProps }: ResourceCoverProps) {
  return (
    <div
      className={cn(
        RESOURCE_COVER_FRAME_CLASS,
        contentProps.presentation === RESOURCE_COVER_PRESENTATION_THUMBNAIL && "rounded-md",
        className,
      )}
    >
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

/** Clickable book cover tile used by full-size resource presentations. */
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
      className={cn(RESOURCE_COVER_FRAME_CLASS, RESOURCE_COVER_BUTTON_CLASS, className)}
    >
      <ResourceCoverContent {...coverProps} />
    </button>
  )
}
