import { useState } from "react"
import { cn } from "@buddy/ui"
import { resolveSkillIconURL } from "./skill-icon-assets"

/**
 * The identity mark for a skill.
 *
 * Every surface that shows a skill shows this — list rows and the detail
 * dialog — so a skill looks like the same object wherever you meet it. Size is
 * the caller's decision, not the row's, which is why this scale is its own
 * thing and not the list's density scale.
 */

export const SKILL_VISUAL_SIZE_SM = "sm"
export const SKILL_VISUAL_SIZE_MD = "md"
export const SKILL_VISUAL_SIZE_LG = "lg"

export type SkillVisualSize =
  | typeof SKILL_VISUAL_SIZE_SM
  | typeof SKILL_VISUAL_SIZE_MD
  | typeof SKILL_VISUAL_SIZE_LG

/**
 * These are rendered icon assets, not glyphs — below about 44px they stop
 * reading as objects, so `md` sits on that floor. It is not larger because in a
 * drawer row every pixel it takes comes out of the name beside it.
 */
const BOX_CLASS = {
  [SKILL_VISUAL_SIZE_SM]: "size-8 rounded-md",
  [SKILL_VISUAL_SIZE_MD]: "size-11 rounded-xl",
  [SKILL_VISUAL_SIZE_LG]: "size-14 rounded-2xl",
} satisfies Record<SkillVisualSize, string>

const MONOGRAM_TEXT_CLASS = {
  [SKILL_VISUAL_SIZE_SM]: "text-[11px]",
  [SKILL_VISUAL_SIZE_MD]: "text-base",
  [SKILL_VISUAL_SIZE_LG]: "text-lg",
} satisfies Record<SkillVisualSize, string>

type AvatarFamily = "purple" | "cyan" | "mint" | "orange" | "lime" | "pink"

const AVATAR_FAMILIES: AvatarFamily[] = ["purple", "cyan", "mint", "orange", "lime", "pink"]

const AVATAR_SURFACE = {
  purple: "bg-avatar-background-purple text-avatar-text-purple",
  cyan: "bg-avatar-background-cyan text-avatar-text-cyan",
  mint: "bg-avatar-background-mint text-avatar-text-mint",
  orange: "bg-avatar-background-orange text-avatar-text-orange",
  lime: "bg-avatar-background-lime text-avatar-text-lime",
  pink: "bg-avatar-background-pink text-avatar-text-pink",
} satisfies Record<AvatarFamily, string>

function avatarFamily(id: string): AvatarFamily {
  let hash = 0
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) | 0
  return AVATAR_FAMILIES[Math.abs(hash) % AVATAR_FAMILIES.length] ?? "purple"
}

function initials(title: string): string {
  const words = title.trim().split(/\s+/u).filter(Boolean)
  if (words.length === 0) return "?"
  if (words.length === 1) return words[0]?.slice(0, 2).toLocaleUpperCase() ?? "?"
  return `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`.toLocaleUpperCase()
}

export type SkillVisualProps = {
  /** Identity for the artwork and the fallback colour — stable per skill. */
  id: string
  title: string
  icon?: string
  /** Changes when the caller explicitly wants failed artwork retried. */
  retryToken?: number
  size: SkillVisualSize
  /** Installed but switched off. */
  dimmed?: boolean
  /** In the library, not installed here. */
  muted?: boolean
}

/**
 * A packaged or remote icon when the skill's metadata names one. Otherwise
 * initials in a hash-picked colour: deterministic, works for any skill that will
 * ever exist, and needs nobody to maintain a per-skill lookup table.
 */
export function SkillVisual(props: SkillVisualProps) {
  const box = BOX_CLASS[props.size]
  const iconURL = resolveSkillIconURL(props.icon)
  const iconRequestKey = iconURL ? `${iconURL}:${props.retryToken ?? 0}` : undefined
  const [failedRequestKey, setFailedRequestKey] = useState<string>()
  // Switched off is deliberately disabled, so it greys out like any disabled
  // control. Not-installed is not disabled — it is simply not here yet — so it
  // keeps its colour and only softens.
  const tone = props.dimmed ? "opacity-40 grayscale" : props.muted ? "opacity-75" : undefined

  if (iconURL && iconRequestKey !== failedRequestKey) {
    return (
      <img
        key={iconRequestKey}
        src={iconURL}
        alt=""
        loading="lazy"
        decoding="async"
        className={cn("shrink-0 object-contain", box, tone)}
        onError={() => setFailedRequestKey(iconRequestKey)}
      />
    )
  }

  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center font-semibold",
        AVATAR_SURFACE[avatarFamily(props.id)],
        box,
        tone,
      )}
    >
      <span className={MONOGRAM_TEXT_CLASS[props.size]}>{initials(props.title)}</span>
    </span>
  )
}
