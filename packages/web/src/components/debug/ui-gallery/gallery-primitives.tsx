import type { ReactNode } from "react"
import { cn } from "@buddy/ui"

/**
 * Backdrops a specimen can be rendered on. The gallery exists to prove that a
 * component reads correctly on every surface it can legitimately land on, so
 * the backdrop is a first-class axis rather than a fixed page background.
 */
export const GALLERY_SURFACES = [
  {
    id: "page",
    label: "Page",
    token: "background-base",
    className: "bg-background-base",
  },
  {
    id: "card",
    label: "Card",
    token: "surface-raised-base",
    className: "bg-surface-raised-base",
  },
  {
    id: "inset",
    label: "Inset",
    token: "surface-inset-base",
    className: "bg-surface-inset-base",
  },
  {
    id: "popover",
    label: "Popover",
    token: "surface-raised-stronger-non-alpha",
    className: "bg-surface-raised-stronger-non-alpha",
  },
] as const

export type GallerySurface = (typeof GALLERY_SURFACES)[number]
export type GallerySurfaceID = GallerySurface["id"]

export function isGallerySurfaceID(value: string): value is GallerySurfaceID {
  return GALLERY_SURFACES.some((surface) => surface.id === value)
}

export function gallerySurface(id: GallerySurfaceID): GallerySurface {
  return GALLERY_SURFACES.find((surface) => surface.id === id) ?? GALLERY_SURFACES[0]
}

export function GalleryStory(props: { children: ReactNode }) {
  return <div className="flex min-w-0 flex-col gap-7 p-4">{props.children}</div>
}

export function GallerySection(props: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="flex min-w-0 flex-col gap-2.5">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-weaker">
          {props.title}
        </h3>
        {props.description ? (
          <p className="text-[11px] leading-relaxed text-text-weak">{props.description}</p>
        ) : null}
      </div>
      {props.children}
    </section>
  )
}

/**
 * One labelled cell. Deliberately paints no background of its own — the whole
 * point is to read the specimen against the gallery's selected surface.
 */
export function Specimen(props: { label: string; note?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-[10px] font-medium uppercase tracking-[0.06em] text-text-weaker">
          {props.label}
        </span>
        {props.note ? (
          <span className="truncate text-[10px] text-text-weak">{props.note}</span>
        ) : null}
      </div>
      <div className="flex min-h-14 min-w-0 items-center rounded-lg border border-dashed border-border-weaker-base/70 px-3 py-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">{props.children}</div>
      </div>
    </div>
  )
}

export function SpecimenGrid(props: { children: ReactNode; dense?: boolean }) {
  return (
    <div
      className={cn(
        "grid min-w-0 gap-3",
        props.dense
          ? "grid-cols-[repeat(auto-fill,minmax(150px,1fr))]"
          : "grid-cols-[repeat(auto-fill,minmax(220px,1fr))]",
      )}
    >
      {props.children}
    </div>
  )
}

/** A labelled horizontal band, for matrices that read better as rows than a grid. */
export function SpecimenRow(props: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-3 border-t border-border-weaker-base/60 py-2.5 first:border-t-0">
      <span className="w-24 shrink-0 pt-1.5 text-[10px] font-medium uppercase tracking-[0.06em] text-text-weaker">
        {props.label}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{props.children}</div>
    </div>
  )
}

/** Small caption used under a specimen to name the token actually in play. */
export function TokenTag(props: { children: ReactNode }) {
  return (
    <code className="rounded bg-surface-weak px-1 py-0.5 font-mono text-[10px] text-text-weak">
      {props.children}
    </code>
  )
}
