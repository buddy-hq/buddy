import { useEffect, useState } from "react"

export type TokenSample = {
  /** The requested spec, which may be a `>`-separated stack. */
  token: string
  /** The topmost layer as the browser resolved it, e.g. "rgb(24, 25, 33)". */
  css: string
  /** Effective color once the stack is composited over the page background. */
  hex: string
  /** WCAG relative luminance of {@link hex}, 0 (black) to 1 (white). */
  luminance: number
}

const PAGE_BACKGROUND_TOKEN = "background-base"

function linearize(channel: number): number {
  const value = channel / 255
  return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4)
}

function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)
}

export function contrastRatio(first: number, second: number): number {
  const light = Math.max(first, second)
  const dark = Math.min(first, second)
  return (light + 0.05) / (dark + 0.05)
}

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`
}

const STACK_SEPARATOR = ">"

/**
 * Resolves a design token to the color a viewer actually sees. Tokens can carry
 * alpha, so the value is painted over the page background before it is read —
 * that composited result is what the eye compares between layers.
 *
 * A token may also name a stack, topmost layer first: `"input-base>surface-raised-base"`
 * reads a control the way it renders on a card rather than on the bare page. Comparing an
 * alpha token against a sibling only means something when both are sampled on the surface
 * they actually sit on.
 */
function sampleTokens(tokens: readonly string[]): TokenSample[] {
  const probe = document.createElement("div")
  probe.style.position = "fixed"
  probe.style.pointerEvents = "none"
  probe.style.opacity = "0"
  probe.style.width = "1px"
  probe.style.height = "1px"
  document.body.appendChild(probe)

  const canvas = document.createElement("canvas")
  canvas.width = 1
  canvas.height = 1
  const context = canvas.getContext("2d", { willReadFrequently: true })

  function resolve(token: string): string {
    probe.style.backgroundColor = ""
    probe.style.backgroundColor = `var(--${token})`
    return window.getComputedStyle(probe).backgroundColor
  }

  try {
    if (!context) {
      return tokens.map((token) => ({
        token,
        css: resolve(token.split(STACK_SEPARATOR)[0] ?? token),
        hex: "",
        luminance: 0,
      }))
    }

    const pageBackground = resolve(PAGE_BACKGROUND_TOKEN)

    return tokens.map((token) => {
      // Topmost layer first in the spec; paint bottom-up so alpha composites as it does on screen.
      const layers = token.split(STACK_SEPARATOR).map(resolve)
      const css = layers[0] ?? ""
      context.clearRect(0, 0, 1, 1)
      // Paint the page background first so a translucent token composites the
      // same way it does on screen.
      context.fillStyle = pageBackground
      context.fillRect(0, 0, 1, 1)
      for (const layer of layers.toReversed()) {
        context.fillStyle = layer
        context.fillRect(0, 0, 1, 1)
      }

      const [r, g, b] = context.getImageData(0, 0, 1, 1).data
      return {
        token,
        css,
        hex: toHex(r, g, b),
        luminance: relativeLuminance(r, g, b),
      }
    })
  } finally {
    probe.remove()
  }
}

/**
 * Live token readings that re-sample whenever the applied theme changes — theme
 * switches land as attribute writes on the document element.
 */
export function useTokenSamples(tokens: readonly string[]): TokenSample[] {
  const [samples, setSamples] = useState<TokenSample[]>([])
  const tokenKey = tokens.join(",")

  useEffect(() => {
    const list = tokenKey.length > 0 ? tokenKey.split(",") : []
    let frame = 0

    function resample() {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setSamples(sampleTokens(list)))
    }

    resample()

    const observer = new MutationObserver(resample)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "data-theme"],
    })

    const media = window.matchMedia("(prefers-color-scheme: dark)")
    media.addEventListener("change", resample)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      media.removeEventListener("change", resample)
    }
  }, [tokenKey])

  return samples
}
