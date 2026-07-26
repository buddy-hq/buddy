import type { ReactNode } from "react"
import { Badge, Skeleton, cn } from "@buddy/ui"
import { language } from "@/context/language"
import { FileTypeIcon } from "@/components/files/file-type-icon"
import { classifyWorkspaceMedia } from "@/lib/workspace-file-media"
import { fileExtensionFromPath } from "@/lib/workspace-file-paths"
import { buildProjectFileRawUrl } from "@/lib/project-file-raw-url"
import { resolveAssetUrl } from "@/lib/resource-url"
import { ResourceCover } from "@/components/resources/resource-cover"
import { MediaActions } from "@/components/media/media-action-bar"
import type { MediaAction } from "@/components/media/types"
import { thumbnailEarnsItsSpace } from "./describe-object"
import {
  OBJECT_STATUS_ERROR,
  OBJECT_STATUS_MISSING,
  OBJECT_SHELF_GAP_PX,
  OBJECT_STATUS_PREPARING,
  OBJECT_TILE_MIN_WIDTH_PX,
  OBJECT_THUMBNAIL_COVER,
  OBJECT_THUMBNAIL_IMAGE,
  OBJECT_VARIANT_CARD,
  OBJECT_VARIANT_SM,
  OBJECT_VARIANT_TILE,
  type ObjectModel,
  type ObjectRowVariant,
  type ObjectThumbnail,
  type ObjectVariant,
} from "./types"

/**
 * Constant height is a hard contract here: the transcript and the workspace
 * drawer both virtualise, so a presentation must occupy the same box in every
 * state. That is why this file uses fixed `h-*` rather than `min-h-*`, keeps
 * every text line to a single truncated line, and overlays the loading state
 * instead of substituting a differently-sized skeleton.
 */

const ROW_SHELL_CLASS =
  "group/object relative flex w-full min-w-0 items-center overflow-hidden rounded-xl border border-border-weaker-base bg-surface-base text-left"

const ROW_HEIGHT_CLASS: Record<ObjectRowVariant, string> = {
  sm: "h-9 gap-2.5 px-2.5",
  md: "h-14 gap-3 px-3 shadow-sm",
  lg: "h-20 gap-3.5 px-3 shadow-sm",
}

/**
 * Only a cover is portrait — that is what a book is. A file icon, an image and
 * a glyph are not, so they share one square box; letterboxing them into 3:4
 * wasted the sides and cropped wide images down to a strip.
 */
const ROW_COVER_CLASS: Record<ObjectRowVariant, string> = {
  sm: "h-6 w-[1.125rem]",
  md: "h-8 w-6",
  lg: "h-14 w-[2.625rem]",
}

const ROW_BOX_CLASS: Record<ObjectRowVariant, string> = {
  sm: "size-6",
  md: "size-8",
  lg: "size-12",
}

/**
 * Only a monochrome glyph is framed. Real artwork — a file mark, an image, a
 * cover — carries its own colour and edges, so a frame around it adds chrome
 * and steals the size it should be using. This is the rule the media file row
 * already follows: an unframed file icon, a framed fallback glyph.
 */
const ROW_BOX_SHELL_CLASS =
  "flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border-weaker-base bg-surface-raised-base text-icon-base"

const ROW_GLYPH_CLASS: Record<ObjectRowVariant, string> = {
  sm: "size-3.5",
  md: "size-4",
  lg: "size-6",
}

const ROW_TITLE_CLASS: Record<ObjectRowVariant, string> = {
  sm: "text-[13px] leading-tight",
  md: "text-sm leading-tight",
  lg: "text-[15px] leading-tight",
}

const ROW_DETAIL_CLASS: Record<ObjectRowVariant, string> = {
  sm: "text-[11px] leading-tight",
  md: "text-[11px] leading-tight",
  lg: "text-xs leading-tight",
}

const ROW_CONTENT_GAP_CLASS: Record<ObjectRowVariant, string> = {
  sm: "gap-2.5",
  md: "gap-3",
  lg: "gap-3.5",
}

const TILE_FRAME_CLASS = "w-[9.5rem] max-w-full"
const SVG_EXTENSION = "svg"

function isUnavailable(model: ObjectModel): boolean {
  return model.status === OBJECT_STATUS_ERROR || model.status === OBJECT_STATUS_MISSING
}

function detailLine(model: ObjectModel): string {
  if (isUnavailable(model)) {
    return model.statusMessage ?? language.t("objectPresentation.unavailable")
  }
  return model.meta.join(" · ")
}

function isCoverThumbnail(thumbnail: ObjectThumbnail): boolean {
  return thumbnail.source === OBJECT_THUMBNAIL_COVER
}

/**
 * The contents of a visual frame, without the frame itself. An image fills it
 * edge to edge; an icon — including an SVG, which is a drawing rather than a
 * photograph and must not be cropped — sits inside it whole.
 */
function ThumbnailContent(props: { thumbnail: ObjectThumbnail; alt: string }) {
  const { thumbnail } = props

  if (thumbnail.source === OBJECT_THUMBNAIL_COVER) {
    return (
      <ResourceCover
        className="size-full"
        directory={thumbnail.directory}
        title={props.alt}
        extension={thumbnail.extension}
        fileName={thumbnail.fileName}
        presentation="thumbnail"
        {...(thumbnail.coverRelpath ? { coverRelpath: thumbnail.coverRelpath } : {})}
      />
    )
  }

  if (thumbnail.source === OBJECT_THUMBNAIL_IMAGE) {
    return (
      <img
        src={thumbnail.src}
        alt={thumbnail.alt}
        loading="lazy"
        className="size-full object-cover"
      />
    )
  }

  const mediaKind =
    thumbnail.mediaKind ??
    classifyWorkspaceMedia({ path: thumbnail.path, mimeType: undefined, sizeBytes: undefined })
      .mediaKind

  // An image is its own best thumbnail; every other file type is better served
  // by the mark the file-icon library already has for it.
  if (mediaKind === "image" && thumbnail.directory) {
    // An SVG is a drawing, not a photograph — cropping it loses the subject.
    const drawing = fileExtensionFromPath(thumbnail.path) === SVG_EXTENSION
    return (
      <img
        src={resolveAssetUrl(
          buildProjectFileRawUrl({ directory: thumbnail.directory, path: thumbnail.path }),
        )}
        alt=""
        loading="lazy"
        className={cn("size-full", drawing ? "object-contain" : "object-cover")}
      />
    )
  }

  return (
    <FileTypeIcon
      fileName={thumbnail.path}
      mediaKind={mediaKind}
      className="size-full object-contain"
    />
  )
}

function RowVisual(props: { model: ObjectModel; variant: ObjectRowVariant }) {
  const { model } = props
  const showThumbnail =
    model.thumbnail !== undefined &&
    props.variant !== OBJECT_VARIANT_SM &&
    thumbnailEarnsItsSpace(model.thumbnail, model.kind)
  const cover = showThumbnail && model.thumbnail ? isCoverThumbnail(model.thumbnail) : false
  const slot = cover ? ROW_COVER_CLASS[props.variant] : ROW_BOX_CLASS[props.variant]

  /**
   * Preparing shimmers the visual slot alone. Skeletoning the whole row would
   * hide the title for as long as the object takes to build — minutes, for a
   * large source — when the title is the one thing already known.
   */
  if (model.status === OBJECT_STATUS_PREPARING) {
    return <Skeleton className={cn("shrink-0 rounded-md", slot)} />
  }

  if (showThumbnail && model.thumbnail) {
    return (
      <div className={cn("shrink-0 overflow-hidden", cover ? undefined : "rounded-md", slot)}>
        <ThumbnailContent thumbnail={model.thumbnail} alt={model.title} />
      </div>
    )
  }

  const Glyph = model.glyph
  return (
    <span className={cn(ROW_BOX_SHELL_CLASS, slot)}>
      <Glyph className={ROW_GLYPH_CLASS[props.variant]} aria-hidden />
    </span>
  )
}

export type ObjectRowProps = {
  model: ObjectModel
  variant?: ObjectRowVariant
  onOpen?: () => void
  actions?: MediaAction[]
  /** The object this row points at is the one currently open. */
  active?: boolean
  /** An action is in flight against this object; it must not be opened meanwhile. */
  disabled?: boolean
  loading?: boolean
  className?: string
}

/**
 * The default presentation. Fixed height, one line of title, one line of meta;
 * never mounts the object's live surface.
 */
export function ObjectRow({
  model,
  variant = "md",
  onOpen,
  actions,
  active,
  disabled,
  loading,
  className,
}: ObjectRowProps) {
  const small = variant === OBJECT_VARIANT_SM
  const unavailable = isUnavailable(model)
  const detail = detailLine(model)
  const open = disabled ? undefined : onOpen

  return (
    <div
      data-component="object-row"
      data-variant={variant}
      data-kind={model.kind}
      data-status={model.status}
      data-active={active ? "" : undefined}
      role={open ? "button" : undefined}
      tabIndex={open ? 0 : undefined}
      aria-current={active ? "page" : undefined}
      aria-disabled={disabled ? true : undefined}
      aria-label={open ? language.t("objectPresentation.open", { title: model.title }) : undefined}
      onClick={open}
      onKeyDown={(event) => {
        if (event.currentTarget !== event.target) return
        if (!open || (event.key !== "Enter" && event.key !== " ")) return
        event.preventDefault()
        open()
      }}
      className={cn(
        ROW_SHELL_CLASS,
        ROW_HEIGHT_CLASS[variant],
        open && "cursor-pointer hover:bg-surface-raised-base",
        active && "border-border-interactive-base bg-surface-interactive-weak",
        disabled && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      <div className={cn("flex min-w-0 flex-1 items-center", ROW_CONTENT_GAP_CLASS[variant])}>
        <RowVisual model={model} variant={variant} />
        <div className={cn("flex min-w-0 flex-1 flex-col", unavailable && "opacity-50")}>
          <p className={cn("truncate font-medium text-text-base", ROW_TITLE_CLASS[variant])}>
            {model.title}
          </p>
          {!small && detail ? (
            <p className={cn("mt-0.5 truncate text-text-weak", ROW_DETAIL_CLASS[variant])}>
              {detail}
            </p>
          ) : null}
        </div>
      </div>

      {small ? (
        <span className="shrink-0 text-[11px] text-text-weaker">{model.kindLabel}</span>
      ) : model.badge ? (
        <Badge variant="outline" className="shrink-0">
          {model.badge}
        </Badge>
      ) : null}

      {actions && actions.length > 0 ? (
        <div className="shrink-0">
          <MediaActions actions={actions} minimal={small} />
        </div>
      ) : null}

      {loading ? <Skeleton className="absolute inset-0 rounded-[inherit]" /> : null}
    </div>
  )
}

export type ObjectCardProps = {
  model: ObjectModel
  onOpen?: () => void
  /**
   * The live surface. Rendered only when `allowLive` is also set, so the render
   * budget stays a property of the layout rather than of this component. When
   * absent or disallowed, the thumbnail or glyph stands in.
   */
  preview?: ReactNode
  allowLive?: boolean
  loading?: boolean
  className?: string
}

/**
 * Preview area with a caption footer. The footer leads with the 16px type
 * glyph rather than the row's visual slot — the preview above already carries
 * the visual identity, so repeating a thumbnail beneath it is redundant.
 */
export function ObjectCard({
  model,
  onOpen,
  preview,
  allowLive,
  loading,
  className,
}: ObjectCardProps) {
  const Glyph = model.glyph
  const showLive = allowLive === true && preview !== undefined
  const detail = detailLine(model)

  return (
    <div
      data-component="object-card"
      data-kind={model.kind}
      data-status={model.status}
      data-live={showLive ? "" : undefined}
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      aria-label={onOpen ? language.t("objectPresentation.open", { title: model.title }) : undefined}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.currentTarget !== event.target) return
        if (!onOpen || (event.key !== "Enter" && event.key !== " ")) return
        event.preventDefault()
        onOpen()
      }}
      className={cn(
        "group/object relative flex w-full min-w-0 flex-col overflow-hidden rounded-lg border border-border-base bg-surface-raised-base text-left transition-colors",
        onOpen && "cursor-pointer hover:border-border-strong-base",
        className,
      )}
    >
      <div className="relative aspect-video w-full overflow-hidden bg-surface-base">
        {showLive ? (
          <div className="pointer-events-none size-full overflow-hidden">{preview}</div>
        ) : (
          <div className="flex size-full items-center justify-center p-3">
            {model.thumbnail ? (
              // A cover keeps its 3:4 and sits centred; cropping a book to 16:9
              // loses the part of the jacket that identifies it.
              <div
                className={cn(
                  "overflow-hidden rounded-md",
                  isCoverThumbnail(model.thumbnail) ? "h-full w-auto" : "size-full",
                )}
              >
                <ThumbnailContent thumbnail={model.thumbnail} alt={model.title} />
              </div>
            ) : (
              <Glyph className="size-8 text-icon-base" aria-hidden />
            )}
          </div>
        )}
      </div>

      {/* Fixed footer height: a two-line title would break virtual measurement. */}
      <div className="flex h-[4.5rem] shrink-0 items-start gap-2 border-t border-border-weaker-base px-2.5 py-2">
        <Glyph className="mt-0.5 size-4 shrink-0 text-icon-base" aria-hidden />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="truncate text-sm font-medium leading-snug text-text-base">{model.title}</p>
          {detail ? (
            <p className="truncate text-[11px] leading-tight text-text-weaker">{detail}</p>
          ) : null}
          {model.badge ? (
            <span className="truncate text-[11px] leading-tight text-text-weaker">
              {model.badge}
            </span>
          ) : null}
        </div>
      </div>

      {loading ? <Skeleton className="absolute inset-0 rounded-[inherit]" /> : null}
    </div>
  )
}

export type ObjectTileProps = {
  model: ObjectModel
  onOpen?: () => void
  /** The object this tile points at is the one currently open. */
  active?: boolean
  /** An action is in flight against this object; it must not be opened meanwhile. */
  disabled?: boolean
  loading?: boolean
  className?: string
}

/**
 * The 3:4 cover. Reserved for arrivals and for shelves — several at once, where
 * the artwork is the point. Resources are the only kind with real cover
 * artwork; anything else falls back to the synthesized cover.
 */
export function ObjectTile({
  model,
  onOpen,
  active,
  disabled,
  loading,
  className,
}: ObjectTileProps) {
  const cover =
    model.thumbnail?.source === OBJECT_THUMBNAIL_COVER ? model.thumbnail : undefined
  const Glyph = model.glyph
  const open = disabled ? undefined : onOpen

  return (
    <div
      data-component="object-tile"
      data-kind={model.kind}
      data-status={model.status}
      data-active={active ? "" : undefined}
      className={cn(
        "relative shrink-0",
        TILE_FRAME_CLASS,
        disabled && "opacity-60",
        className,
      )}
    >
      {cover ? (
        <ResourceCover
          className="w-full"
          directory={cover.directory}
          title={model.title}
          extension={cover.extension}
          fileName={cover.fileName}
          {...(cover.coverRelpath ? { coverRelpath: cover.coverRelpath } : {})}
        />
      ) : (
        <div className="flex aspect-[3/4] w-full flex-col overflow-hidden rounded-xl border border-border-weak-base bg-surface-raised-stronger shadow-sm">
          <div className="flex min-h-0 flex-[3] items-center justify-center bg-surface-interactive-weak">
            <Glyph className="size-10 text-icon-interactive-base" aria-hidden />
          </div>
          <div className="flex min-h-0 flex-[2] flex-col justify-center overflow-hidden border-t border-border-weaker-base bg-surface-raised-base px-3 py-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-weak">
              {model.kindLabel}
            </span>
            <span className="mt-1.5 line-clamp-2 break-words text-[11px] font-medium leading-[1.4] text-text-stronger">
              {model.title}
            </span>
          </div>
        </div>
      )}
      {/* Overlaid, so a status never changes the tile's 3:4 box. */}
      {model.badge ? (
        <Badge
          variant="outline"
          className="pointer-events-none absolute right-1.5 top-1.5 max-w-[calc(100%-0.75rem)] truncate bg-surface-base/90 backdrop-blur-sm"
        >
          {model.badge}
        </Badge>
      ) : null}
      {open ? (
        <button
          type="button"
          onClick={open}
          aria-current={active ? "page" : undefined}
          aria-label={language.t("objectPresentation.open", { title: model.title })}
          className={cn(
            "absolute inset-0 rounded-xl outline-none transition-[transform,box-shadow] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-border-focus",
            active && "ring-2 ring-border-interactive-base",
          )}
        />
      ) : null}
      {loading ? <Skeleton className="absolute inset-0 rounded-xl" /> : null}
    </div>
  )
}

export type ObjectShelfProps = {
  children: ReactNode
  className?: string
}

/**
 * A band of tiles that gains columns as it widens instead of enlarging its
 * covers. Pairs with `objectShelfHeightPx`, which a virtualiser needs to size
 * the band — both read the same gutter and minimum, so they cannot drift.
 */
export function ObjectShelf({ children, className }: ObjectShelfProps) {
  return (
    <div
      data-component="object-shelf"
      className={cn("grid w-full", className)}
      style={{
        gridTemplateColumns: `repeat(auto-fill, minmax(${OBJECT_TILE_MIN_WIDTH_PX}px, 1fr))`,
        gap: `${OBJECT_SHELF_GAP_PX}px`,
      }}
    >
      {children}
    </div>
  )
}

export type ObjectPresentationProps = {
  model: ObjectModel
  variant: ObjectVariant
  onOpen?: () => void
  actions?: MediaAction[]
  preview?: ReactNode
  allowLive?: boolean
  active?: boolean
  disabled?: boolean
  loading?: boolean
  className?: string
}

/** Single entry point for call sites whose variant is configuration. */
export function ObjectPresentation({ variant, ...props }: ObjectPresentationProps) {
  if (variant === OBJECT_VARIANT_TILE) {
    return (
      <ObjectTile
        model={props.model}
        {...(props.onOpen ? { onOpen: props.onOpen } : {})}
        {...(props.active !== undefined ? { active: props.active } : {})}
        {...(props.disabled !== undefined ? { disabled: props.disabled } : {})}
        {...(props.loading !== undefined ? { loading: props.loading } : {})}
        {...(props.className ? { className: props.className } : {})}
      />
    )
  }

  if (variant === OBJECT_VARIANT_CARD) {
    return (
      <ObjectCard
        model={props.model}
        {...(props.onOpen ? { onOpen: props.onOpen } : {})}
        {...(props.preview !== undefined ? { preview: props.preview } : {})}
        {...(props.allowLive !== undefined ? { allowLive: props.allowLive } : {})}
        {...(props.loading !== undefined ? { loading: props.loading } : {})}
        {...(props.className ? { className: props.className } : {})}
      />
    )
  }

  return (
    <ObjectRow
      model={props.model}
      variant={variant}
      {...(props.onOpen ? { onOpen: props.onOpen } : {})}
      {...(props.actions ? { actions: props.actions } : {})}
      {...(props.active !== undefined ? { active: props.active } : {})}
      {...(props.disabled !== undefined ? { disabled: props.disabled } : {})}
      {...(props.loading !== undefined ? { loading: props.loading } : {})}
      {...(props.className ? { className: props.className } : {})}
    />
  )
}
