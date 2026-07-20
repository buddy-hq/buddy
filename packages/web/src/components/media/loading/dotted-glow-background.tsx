import { useEffect, useRef, useState } from "react"
import { cn } from "@buddy/ui"

type DottedGlowBackgroundProps = {
  className?: string
  /** distance between dot centers in pixels */
  gap?: number
  /** base radius of each dot in CSS px */
  radius?: number
  /** semantic CSS variable used for the base dots */
  colorVar?: string
  /** semantic CSS variable used for bright dot glows */
  glowColorVar?: string
  /** global opacity for the whole layer */
  opacity?: number
  /** background radial fade opacity (0 = transparent background) */
  backgroundOpacity?: number
  /** minimum per-dot speed in rad/s */
  speedMin?: number
  /** maximum per-dot speed in rad/s */
  speedMax?: number
  /** global speed multiplier for all dots */
  speedScale?: number
}

const DOTTED_GLOW_COLOR_VAR = "--border-weaker-base"
const DOTTED_GLOW_HIGHLIGHT_COLOR_VAR = "--icon-interactive-base"
const TRANSPARENT_CANVAS_COLOR = "transparent"

function resolveCssVariable(element: Element, variableName?: string): string | null {
  if (!variableName) return null
  const normalized = variableName.startsWith("--") ? variableName : `--${variableName}`
  const fromElement = getComputedStyle(element).getPropertyValue(normalized).trim()
  if (fromElement) return fromElement
  const fromRoot = getComputedStyle(document.documentElement).getPropertyValue(normalized).trim()
  return fromRoot || null
}

/**
 * Canvas-based dotted background that randomly glows and dims.
 * - Uses a stable grid of dots.
 * - Each dot gets its own phase + speed producing organic shimmering.
 * - Handles high-DPI and resizes via ResizeObserver.
 *
 * Adapted from Aceternity UI's DottedGlowBackground.
 */
function DottedGlowBackground({
  className,
  gap = 12,
  radius = 2,
  colorVar = DOTTED_GLOW_COLOR_VAR,
  glowColorVar = DOTTED_GLOW_HIGHLIGHT_COLOR_VAR,
  opacity = 0.6,
  backgroundOpacity = 0,
  speedMin = 0.25,
  speedMax = 0.8,
  speedScale = 0.6,
}: DottedGlowBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [resolvedColor, setResolvedColor] = useState(TRANSPARENT_CANVAS_COLOR)
  const [resolvedGlowColor, setResolvedGlowColor] = useState(TRANSPARENT_CANVAS_COLOR)

  useEffect(() => {
    const container = containerRef.current ?? document.documentElement

    const compute = () => {
      const nextColor = resolveCssVariable(container, colorVar) ?? TRANSPARENT_CANVAS_COLOR
      const nextGlow = resolveCssVariable(container, glowColorVar) ?? nextColor

      setResolvedColor(nextColor)
      setResolvedGlowColor(nextGlow)
    }

    compute()

    const mql = window.matchMedia?.("(prefers-color-scheme: dark)") ?? null
    const handleMql = () => compute()
    mql?.addEventListener("change", handleMql)

    const mo = new MutationObserver(() => compute())
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "data-theme", "data-color-scheme"],
    })

    return () => {
      mql?.removeEventListener("change", handleMql)
      mo.disconnect()
    }
  }, [colorVar, glowColorVar])

  useEffect(() => {
    const el = canvasRef.current
    const container = containerRef.current
    if (!el || !container) return

    const ctx = el.getContext("2d")
    if (!ctx) return

    let raf = 0
    let stopped = false
    let isVisible = true

    const dpr = Math.min(Math.max(1, window.devicePixelRatio || 1), 2)

    const resize = () => {
      const { width, height } = container.getBoundingClientRect()
      el.width = Math.max(1, Math.floor(width * dpr))
      el.height = Math.max(1, Math.floor(height * dpr))
      el.style.width = `${Math.floor(width)}px`
      el.style.height = `${Math.floor(height)}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const ro = new ResizeObserver(resize)
    ro.observe(container)
    resize()

    type Dot = { x: number; y: number; phase: number; speed: number }
    let dots: Dot[] = []

    const regenDots = () => {
      dots = []
      const { width, height } = container.getBoundingClientRect()
      const cols = Math.ceil(width / gap) + 2
      const rows = Math.ceil(height / gap) + 2
      const min = Math.min(speedMin, speedMax)
      const max = Math.max(speedMin, speedMax)
      for (let i = -1; i < cols; i++) {
        for (let j = -1; j < rows; j++) {
          const x = i * gap + (j % 2 === 0 ? 0 : gap * 0.5)
          const y = j * gap
          const phase = Math.random() * Math.PI * 2
          const span = Math.max(max - min, 0)
          const speed = min + Math.random() * span
          dots.push({ x, y, phase, speed })
        }
      }
    }

    regenDots()

    const draw = (now: number) => {
      if (stopped) return
      if (!isVisible) {
        raf = requestAnimationFrame(draw)
        return
      }
      const { width, height } = container.getBoundingClientRect()

      ctx.clearRect(0, 0, el.width, el.height)
      ctx.globalAlpha = opacity

      if (backgroundOpacity > 0) {
        const grad = ctx.createRadialGradient(
          width * 0.5,
          height * 0.4,
          Math.min(width, height) * 0.1,
          width * 0.5,
          height * 0.5,
          Math.max(width, height) * 0.7,
        )
        grad.addColorStop(0, "rgba(0,0,0,0)")
        grad.addColorStop(1, `rgba(0,0,0,${Math.min(Math.max(backgroundOpacity, 0), 1)})`)
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, width, height)
      }

      ctx.save()
      ctx.fillStyle = resolvedColor

      const time = (now / 1000) * Math.max(speedScale, 0)
      for (let i = 0; i < dots.length; i++) {
        const d = dots[i]
        const mod = (time * d.speed + d.phase) % 2
        const lin = mod < 1 ? mod : 2 - mod
        const a = 0.25 + 0.55 * lin

        if (a > 0.6) {
          const glow = (a - 0.6) / 0.4
          ctx.shadowColor = resolvedGlowColor
          ctx.shadowBlur = 6 * glow
        } else {
          ctx.shadowColor = "transparent"
          ctx.shadowBlur = 0
        }

        ctx.globalAlpha = a * opacity
        ctx.beginPath()
        ctx.arc(d.x, d.y, radius, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()

      raf = requestAnimationFrame(draw)
    }

    const handleResize = () => {
      resize()
      regenDots()
    }

    const observer = new IntersectionObserver(
      (entries) => {
        isVisible = entries[0]?.isIntersecting ?? true
      },
      { threshold: 0.1 },
    )
    observer.observe(container)

    window.addEventListener("resize", handleResize)
    raf = requestAnimationFrame(draw)

    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", handleResize)
      observer.disconnect()
      ro.disconnect()
    }
  }, [
    gap,
    radius,
    resolvedColor,
    resolvedGlowColor,
    opacity,
    backgroundOpacity,
    speedMin,
    speedMax,
    speedScale,
  ])

  return (
    <div
      ref={containerRef}
      className={cn("bg-background-base", className)}
      style={{ position: "absolute", inset: 0 }}
    >
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
    </div>
  )
}

export { DottedGlowBackground }
