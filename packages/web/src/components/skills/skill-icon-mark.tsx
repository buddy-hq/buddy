import { useState, type ReactNode } from "react"
import { cn } from "@buddy/ui"
import { resolveSkillIconURL } from "./skill-icon-assets"

/**
 * A skill's artwork at glyph scale, for surfaces whose rows are shared with
 * non-skill entries — the slash menu, the composer pill.
 *
 * Unlike {@link SkillVisual}, which owns the whole mark and falls back to a
 * monogram tile, this renders nothing when there is no artwork so the caller can
 * fall back to whatever glyph its row already uses. Both the React and the DOM
 * form live here so an inline pill and a menu row resolve the same URL.
 */

export type SkillIconMarkProps = {
  icon?: string
  className?: string
  /** The row's own glyph, shown when the skill has no usable artwork. */
  fallback?: ReactNode
}

export function SkillIconMark(props: SkillIconMarkProps) {
  const iconURL = resolveSkillIconURL(props.icon)
  const [failedIconURL, setFailedIconURL] = useState<string>()

  if (!iconURL || failedIconURL === iconURL) return <>{props.fallback ?? null}</>

  return (
    <img
      src={iconURL}
      alt=""
      loading="lazy"
      decoding="async"
      className={cn("shrink-0 object-contain", props.className)}
      onError={() => setFailedIconURL(iconURL)}
    />
  )
}

export function createSkillIconMarkElement(
  icon: string | undefined,
  className: string,
  fallback?: Element,
): HTMLImageElement | undefined {
  const iconURL = resolveSkillIconURL(icon)
  if (!iconURL) return undefined

  const image = document.createElement("img")
  image.src = iconURL
  image.alt = ""
  image.loading = "lazy"
  image.decoding = "async"
  image.className = cn("shrink-0 object-contain", className)
  if (fallback) {
    image.addEventListener("error", () => image.replaceWith(fallback), { once: true })
  }
  return image
}
