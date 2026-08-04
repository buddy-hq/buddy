/**
 * The platform glyphs from the site's download buttons, so the video and the
 * download page say "Mac and Windows" with the same marks.
 *
 * Source of truth: packages/site/src/components/InstallSection.astro — the
 * paths are copied verbatim from the `.download-btn` icons.
 */

const VIEW_BOX = "0 0 24 24"

const APPLE_PATH =
  "M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.08 1.85-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"

const WINDOWS_PATH = "M0 0h11v11H0zM13 0h11v11H13zM0 13h11v11H0zM13 13h11v11H13z"

/** The Windows squares read heavier than the Apple mark at the same box. */
const WINDOWS_SIZE_RATIO = 0.82

export type PlatformMarkKind = "mac" | "windows"

export type PlatformMarkProps = {
  readonly ink: string
  readonly kind: PlatformMarkKind
  readonly size: number
}

export const PlatformMark = ({ ink, kind, size }: PlatformMarkProps) => {
  const isMac = kind === "mac"
  const box = isMac ? size : size * WINDOWS_SIZE_RATIO

  return (
    <svg fill={ink} height={box} viewBox={VIEW_BOX} width={box}>
      <path d={isMac ? APPLE_PATH : WINDOWS_PATH} />
    </svg>
  )
}
