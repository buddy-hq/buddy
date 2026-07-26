import type { AppIcon } from "@/icons/app-icons"
import type { BenchObjectKind, BenchTarget } from "@/lib/bench-targets"
import type { WorkspaceMediaKind } from "@/lib/workspace-file-media"

/**
 * One inline language for every object Buddy can point at.
 *
 * A kind contributes DATA — glyph, title, meta, an optional cheaper-or-richer
 * visual — never layout. The variant decides how much that visual is allowed
 * to cost; the call site decides which variant it can afford.
 */

export const OBJECT_VARIANT_SM = "sm"
export const OBJECT_VARIANT_MD = "md"
export const OBJECT_VARIANT_LG = "lg"
export const OBJECT_VARIANT_CARD = "card"
export const OBJECT_VARIANT_TILE = "tile"

export type ObjectRowVariant =
  | typeof OBJECT_VARIANT_SM
  | typeof OBJECT_VARIANT_MD
  | typeof OBJECT_VARIANT_LG

export type ObjectVariant =
  | ObjectRowVariant
  | typeof OBJECT_VARIANT_CARD
  | typeof OBJECT_VARIANT_TILE

/** Presentable, but not Bench objects: they open somewhere other than the Bench. */
export const OBJECT_KIND_WORKSPACE_FILE = "workspace-file"
export const OBJECT_KIND_THREAD = "thread"

export type ObjectPresentationKind =
  | BenchObjectKind
  | typeof OBJECT_KIND_WORKSPACE_FILE
  | typeof OBJECT_KIND_THREAD

export const OBJECT_STATUS_READY = "ready"
export const OBJECT_STATUS_PREPARING = "preparing"
export const OBJECT_STATUS_ERROR = "error"
export const OBJECT_STATUS_MISSING = "missing"

export type ObjectStatus =
  | typeof OBJECT_STATUS_READY
  | typeof OBJECT_STATUS_PREPARING
  | typeof OBJECT_STATUS_ERROR
  | typeof OBJECT_STATUS_MISSING

export const OBJECT_THUMBNAIL_COVER = "cover"
export const OBJECT_THUMBNAIL_IMAGE = "image"
export const OBJECT_THUMBNAIL_FILE_TYPE = "file-type"

/** Resource artwork. Carries the relpath, not a resolved URL, so descriptors stay pure. */
type ObjectCoverThumbnail = {
  source: typeof OBJECT_THUMBNAIL_COVER
  directory: string
  coverRelpath?: string
  extension: string
  fileName: string
}

type ObjectImageThumbnail = {
  source: typeof OBJECT_THUMBNAIL_IMAGE
  src: string
  alt: string
}

/**
 * A file. Carries its path rather than a resolved URL, like the cover does, so
 * descriptors stay pure — the component turns it into a type mark, or into the
 * image itself when the file is one and its directory is known.
 */
type ObjectFileTypeThumbnail = {
  source: typeof OBJECT_THUMBNAIL_FILE_TYPE
  /** Workspace-relative path where known, otherwise the bare file name. */
  path: string
  mediaKind?: WorkspaceMediaKind
  /** Present when the bytes are fetchable; an image then shows itself. */
  directory?: string
}

/** The cheap tier: an <img> or a file-type mark. Never a live render. */
export type ObjectThumbnail = ObjectCoverThumbnail | ObjectImageThumbnail | ObjectFileTypeThumbnail

export type ObjectModel = {
  /** Identity, where the thing has one. Chats and other non-Bench results do not. */
  target?: BenchTarget
  kind: ObjectPresentationKind
  /** What this reads as — "Image" or "Spreadsheet" rather than a flat "File". */
  kindLabel: string
  title: string
  /** Joined with a middot by the component. Keep parts short. */
  meta: string[]
  badge?: string
  /** Always present: the free floor, legible at every size. */
  glyph: AppIcon
  /** Present when the kind has something cheaper-to-show than a glyph. */
  thumbnail?: ObjectThumbnail
  status?: ObjectStatus
  /** Replaces meta when the object is unavailable. */
  statusMessage?: string
}

/**
 * Constant heights.
 *
 * The transcript and the workspace drawer both virtualise, so a presentation
 * MUST occupy the same box in every state — loading, ready, preparing, error.
 * These are the measurements a virtualiser can size rows with; nothing in this
 * module may use `min-h`, wrap a title, or add a state-only line.
 */
export const OBJECT_ROW_HEIGHT_PX: Record<ObjectRowVariant, number> = {
  [OBJECT_VARIANT_SM]: 36,
  [OBJECT_VARIANT_MD]: 56,
  // Tall enough for a cover to read as a cover rather than as an icon.
  [OBJECT_VARIANT_LG]: 80,
}

export const OBJECT_CARD_FOOTER_HEIGHT_PX = 72
export const OBJECT_CARD_PREVIEW_ASPECT_RATIO = 16 / 9
export const OBJECT_CARD_BORDER_PX = 1

export const OBJECT_TILE_WIDTH_PX = 152
export const OBJECT_TILE_ASPECT_RATIO = 3 / 4

/** Gutter between tiles on a shelf. Shared by the layout and the height helper. */
export const OBJECT_SHELF_GAP_PX = 12

/**
 * A shelf adds columns as it widens rather than growing its covers, so a cover
 * stays about this size in a narrow drawer and in a full-width workspace alike.
 */
export const OBJECT_TILE_MIN_WIDTH_PX = 104

/** Card height follows its column width, which is fixed wherever it is used. */
export function objectCardHeightPx(availableWidthPx: number): number {
  const preview = Math.round(availableWidthPx / OBJECT_CARD_PREVIEW_ASPECT_RATIO)
  return preview + OBJECT_CARD_FOOTER_HEIGHT_PX + OBJECT_CARD_BORDER_PX * 2
}

export function objectTileHeightPx(): number {
  return Math.round(OBJECT_TILE_WIDTH_PX / OBJECT_TILE_ASPECT_RATIO)
}

/** Mirrors the shelf's `auto-fill` track sizing so heights can be predicted. */
export function objectShelfColumns(availableWidthPx: number): number {
  const columns = Math.floor(
    (availableWidthPx + OBJECT_SHELF_GAP_PX) / (OBJECT_TILE_MIN_WIDTH_PX + OBJECT_SHELF_GAP_PX),
  )
  return Math.max(1, columns)
}

/**
 * Height of a shelf holding `tileCount` covers at this width.
 *
 * A shelf is one item to a virtualiser however many tiles it holds, so it needs
 * the height of the whole band — the same gutter runs in both directions.
 */
export function objectShelfHeightPx(availableWidthPx: number, tileCount: number): number {
  const columns = objectShelfColumns(availableWidthPx)
  const rows = Math.max(1, Math.ceil(tileCount / columns))
  const tileWidth = (availableWidthPx - OBJECT_SHELF_GAP_PX * (columns - 1)) / columns
  const tileHeight = tileWidth / OBJECT_TILE_ASPECT_RATIO
  return Math.round(tileHeight * rows + OBJECT_SHELF_GAP_PX * (rows - 1))
}

export function objectPresentationHeightPx(
  variant: ObjectVariant,
  availableWidthPx: number,
): number {
  if (variant === OBJECT_VARIANT_CARD) return objectCardHeightPx(availableWidthPx)
  if (variant === OBJECT_VARIANT_TILE) return objectTileHeightPx()
  return OBJECT_ROW_HEIGHT_PX[variant]
}
