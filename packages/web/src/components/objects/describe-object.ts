import {
  BookOpenIcon,
  FileTextIcon,
  ImagesIcon,
  Layers3Icon,
  ListChecksIcon,
  MessageSquareTextIcon,
  PanelsTopLeftIcon,
  PresentationIcon,
  ShapesIcon,
  WorkflowIcon,
  type AppIcon,
} from "@/icons/app-icons"
import { language } from "@/context/language"
import type { BenchTarget } from "@/lib/bench-targets"
import { classifyWorkspaceMedia, type WorkspaceMediaKind } from "@/lib/workspace-file-media"
import {
  OBJECT_KIND_THREAD,
  OBJECT_KIND_WORKSPACE_FILE,
  OBJECT_THUMBNAIL_FILE_TYPE,
  type ObjectModel,
  type ObjectPresentationKind,
  type ObjectStatus,
  type ObjectThumbnail,
} from "./types"

/**
 * The only per-kind surface area in the system.
 *
 * Everything a kind contributes is data: a glyph, a label, and whether a
 * thumbnail is worth its space. No kind owns a component.
 */

const OBJECT_GLYPH: Record<ObjectPresentationKind, AppIcon> = {
  resource: BookOpenIcon,
  whiteboard: PresentationIcon,
  mermaid: WorkflowIcon,
  "html-widget": PanelsTopLeftIcon,
  figure: ShapesIcon,
  "freeform-figure": ShapesIcon,
  "media-presentation": ImagesIcon,
  "question-set": ListChecksIcon,
  "flashcard-deck": Layers3Icon,
  [OBJECT_KIND_WORKSPACE_FILE]: FileTextIcon,
  [OBJECT_KIND_THREAD]: MessageSquareTextIcon,
}

const OBJECT_KIND_LABEL_KEY: Record<ObjectPresentationKind, string> = {
  resource: "objectPresentation.kind.resource",
  whiteboard: "objectPresentation.kind.whiteboard",
  mermaid: "objectPresentation.kind.mermaid",
  "html-widget": "objectPresentation.kind.htmlWidget",
  figure: "objectPresentation.kind.figure",
  "freeform-figure": "objectPresentation.kind.freeformFigure",
  "media-presentation": "objectPresentation.kind.mediaPresentation",
  "question-set": "objectPresentation.kind.questionSet",
  "flashcard-deck": "objectPresentation.kind.flashcardDeck",
  [OBJECT_KIND_WORKSPACE_FILE]: "objectPresentation.kind.workspaceFile",
  [OBJECT_KIND_THREAD]: "objectPresentation.kind.thread",
}

/**
 * "File" is what a thing is to the filesystem, not what it is to a reader. A
 * workspace file says image, spreadsheet or PDF instead, which is both what the
 * learner is looking for and what the file icon beside it already shows.
 */
const WORKSPACE_MEDIA_LABEL_KEY: Partial<Record<WorkspaceMediaKind, string>> = {
  image: "objectPresentation.media.image",
  pdf: "objectPresentation.media.pdf",
  presentation: "objectPresentation.media.presentation",
  document: "objectPresentation.media.document",
  spreadsheet: "objectPresentation.media.spreadsheet",
  video: "objectPresentation.media.video",
  audio: "objectPresentation.media.audio",
  archive: "objectPresentation.media.archive",
}

export function objectGlyph(kind: ObjectPresentationKind): AppIcon {
  return OBJECT_GLYPH[kind]
}

export function objectKindLabel(kind: ObjectPresentationKind): string {
  return language.t(OBJECT_KIND_LABEL_KEY[kind])
}

/** The label a path earns; falls back to the kind when nothing more specific fits. */
export function objectFileLabel(path: string): string {
  const { mediaKind } = classifyWorkspaceMedia({
    path,
    mimeType: undefined,
    sizeBytes: undefined,
  })
  const key = WORKSPACE_MEDIA_LABEL_KEY[mediaKind]
  return key ? language.t(key) : objectKindLabel(OBJECT_KIND_WORKSPACE_FILE)
}

/**
 * Whether a thumbnail earns the space it costs.
 *
 * A file-type mark always does: it *is* a glyph, just a better-informed one
 * than the kind icon, and it costs nothing to draw. Photographs, figures and
 * cover artwork earn it on their own kinds — they survive downsampling, being
 * recognised by colour and composition, and cost an `<img>` at most. Diagrams
 * and widgets do not: at row scale a mermaid render is unreadable, and
 * producing it costs a main-thread render plus a render-record write.
 */
export function thumbnailEarnsItsSpace(
  thumbnail: ObjectThumbnail,
  kind: ObjectPresentationKind,
): boolean {
  if (thumbnail.source === OBJECT_THUMBNAIL_FILE_TYPE) return true
  return (
    kind === "resource" ||
    kind === "figure" ||
    kind === "freeform-figure" ||
    kind === "media-presentation"
  )
}

/**
 * Files describe themselves. Every workspace file has a name, and the file-icon
 * library already knows what a `.tsx` or a `.pptx` looks like, so no call site
 * should have to opt into a mark the descriptor can always derive.
 */
function defaultThumbnail(input: ObjectDescriptorInput): ObjectThumbnail | undefined {
  if (input.thumbnail) return input.thumbnail
  if (input.kind !== OBJECT_KIND_WORKSPACE_FILE) return undefined

  const path = input.target?.type === "workspace-file" ? input.target.path : input.title
  if (!path.trim()) return undefined

  return {
    source: OBJECT_THUMBNAIL_FILE_TYPE,
    path,
    ...(input.directory ? { directory: input.directory } : {}),
  }
}

export type ObjectDescriptorInput = {
  /** Omitted for results that do not open on the Bench, such as a chat. */
  target?: BenchTarget
  kind: ObjectPresentationKind
  title: string
  /** Omit to fall back to the label the kind or file type earns. */
  meta?: string[]
  badge?: string
  thumbnail?: ObjectThumbnail
  /** Lets a workspace file resolve its own bytes, so an image shows itself. */
  directory?: string
  status?: ObjectStatus
  statusMessage?: string
}

/**
 * Pure: hydrated object data in, presentation model out. Every call site — the
 * transcript, the drawer, present_media, ingest — goes through this so the same
 * object reads the same way wherever it appears.
 */
export function describeObject(input: ObjectDescriptorInput): ObjectModel {
  const thumbnail = defaultThumbnail(input)
  const kindLabel =
    thumbnail?.source === OBJECT_THUMBNAIL_FILE_TYPE
      ? objectFileLabel(thumbnail.path)
      : objectKindLabel(input.kind)
  const meta = (input.meta ?? [kindLabel]).filter((part) => part.trim().length > 0)

  return {
    kind: input.kind,
    kindLabel,
    title: input.title,
    meta,
    glyph: objectGlyph(input.kind),
    ...(input.target ? { target: input.target } : {}),
    ...(input.badge ? { badge: input.badge } : {}),
    ...(thumbnail ? { thumbnail } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.statusMessage ? { statusMessage: input.statusMessage } : {}),
  }
}
