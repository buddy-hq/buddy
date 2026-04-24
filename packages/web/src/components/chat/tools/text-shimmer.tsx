import { useState, useEffect } from "react"
import "./text-shimmer.css"

const SHIMMER_SWAP_MS = 220

type TextShimmerProps = {
  text: string
  active?: boolean
  className?: string
}

/**
 * Animated shimmer sweep across text during pending/running tool states.
 *
 * Two overlapping text layers share a grid cell. While `active`, the shimmer
 * layer fades in and runs a background-clip:text sweep. When `active` turns
 * false, the shimmer lingers for 220ms to finish its current sweep before
 * fading out — avoiding an abrupt cut on completion.
 *
 * Port of vendor/opencode/packages/ui/src/components/text-shimmer.tsx.
 */
export function TextShimmer({ text, active = true, className }: TextShimmerProps) {
  const [run, setRun] = useState(active)

  useEffect(() => {
    if (active) {
      setRun(true)
      return
    }
    const timer = setTimeout(() => setRun(false), SHIMMER_SWAP_MS)
    return () => clearTimeout(timer)
  }, [active])

  return (
    <span
      data-component="text-shimmer"
      data-active={active ? "true" : "false"}
      className={className}
      aria-label={text}
    >
      <span data-slot="text-shimmer-char">
        <span data-slot="text-shimmer-char-base" aria-hidden="true">
          {text}
        </span>
        <span
          data-slot="text-shimmer-char-shimmer"
          data-run={run ? "true" : "false"}
          aria-hidden="true"
        >
          {text}
        </span>
      </span>
    </span>
  )
}
