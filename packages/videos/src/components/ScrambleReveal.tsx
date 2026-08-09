import type { CSSProperties } from "react"
import { random } from "remotion"

/**
 * The onboarding `EncryptedText` reveal, ported for video.
 *
 * Source of truth:
 * packages/web/src/components/onboarding/cinematic/primitives.tsx
 *
 * The app scrambles with `Math.random()` on a rAF loop. A video frame has to
 * be reproducible — Remotion renders frames out of order and in parallel — so
 * the scramble is seeded off the character index and the flip tick instead,
 * which gives the same noise every time the same frame is drawn.
 */

const CHARSET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-={}[];:,.<>/?"
const SPACE = " "
const NOTHING_REVEALED = 0

export type ScrambleRevealProps = {
  /** Style for characters that haven't resolved yet. */
  readonly encryptedStyle: CSSProperties
  /** How long a scrambled character holds before it re-rolls. */
  readonly flipFrames: number
  /** Frames since the reveal began. Negative means nothing has resolved. */
  readonly frame: number
  /** How long each character waits before resolving, in frames. */
  readonly framesPerCharacter: number
  readonly revealedStyle: CSSProperties
  readonly text: string
}

const scrambleCharacter = (index: number, flipTick: number): string =>
  CHARSET.charAt(Math.floor(random(`${index}-${flipTick}`) * CHARSET.length))

export const ScrambleReveal = ({
  encryptedStyle,
  flipFrames,
  frame,
  framesPerCharacter,
  revealedStyle,
  text,
}: ScrambleRevealProps) => {
  const revealCount = Math.max(NOTHING_REVEALED, Math.floor(frame / framesPerCharacter))
  const flipTick = Math.floor(frame / flipFrames)

  // Characters resolve left to right, so the revealed run is always a prefix
  // and the whole word needs exactly two spans.
  const scrambled = text
    .slice(revealCount)
    .split("")
    .map((character, offset) =>
      character === SPACE ? SPACE : scrambleCharacter(revealCount + offset, flipTick),
    )
    .join("")

  return (
    <span aria-label={text}>
      <span style={revealedStyle}>{text.slice(0, revealCount)}</span>
      <span style={encryptedStyle}>{scrambled}</span>
    </span>
  )
}
