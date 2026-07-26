import { useEffect, useMemo, useRef } from "react"
import Lottie, { type LottieRefCurrentProps } from "lottie-react"
import { useReducedMotion } from "motion/react"
import { cn } from "@buddy/ui"
import {
  WHITEBOARD_OPENING_DEFAULT_SELECTION,
  buildWhiteboardOpening,
  type WhiteboardOpeningSelection,
} from "./whiteboard-opening-animation-data"

/**
 * The animation JSON is pure white, so the ink is handed over to CSS and inherits
 * `currentColor`. One asset then follows every Buddy theme instead of shipping per-theme
 * JSON. lottie-web only sets `stroke` on stroke styles and `fill` on fill styles, so
 * these selectors never cross-contaminate an outlined shape with a fill.
 */
const INK_TINT = "[&_[stroke]]:stroke-current [&_[fill]]:fill-current"

/**
 * Wide enough to occupy the bench pane rather than float in it, capped so it stays a
 * hint and does not start reading as board content.
 */
const STAGE_SIZE = "w-full max-w-[34rem]"

type WhiteboardOpeningAnimationProps = {
  selection?: WhiteboardOpeningSelection
  className?: string
}

/**
 * Shown while a board is being fetched or drawn. Carries the message on its own — a
 * diagram assembling itself previews what is about to land — so it ships without a label.
 */
export function WhiteboardOpeningAnimation({
  selection = WHITEBOARD_OPENING_DEFAULT_SELECTION,
  className,
}: WhiteboardOpeningAnimationProps) {
  const reducedMotion = useReducedMotion() === true
  const lottieRef = useRef<LottieRefCurrentProps | null>(null)
  const { data, restFrame } = useMemo(() => buildWhiteboardOpening(selection), [selection])

  useEffect(() => {
    const player = lottieRef.current
    if (!player) return
    // Reduced motion still gets the finished diagram, just never the assembly.
    if (reducedMotion) {
      player.goToAndStop(restFrame, true)
      return
    }
    player.goToAndPlay(0, true)
  }, [reducedMotion, restFrame, selection])

  return (
    <div
      data-component="whiteboard-opening-animation"
      className={cn(
        "flex h-full w-full items-center justify-center px-6 text-icon-interactive-base",
        INK_TINT,
        className,
      )}
    >
      <div className={STAGE_SIZE}>
        <Lottie
          key={`${selection}-${reducedMotion ? "rest" : "play"}`}
          lottieRef={lottieRef}
          animationData={data}
          loop={!reducedMotion}
          autoplay={!reducedMotion}
          rendererSettings={{ preserveAspectRatio: "xMidYMid meet" }}
        />
      </div>
    </div>
  )
}
