import { useEffect, useMemo, useState } from "react"
import { Input, toast } from "@buddy/ui"
import { useTheme } from "@/theme"
import { ThemeSelectors } from "./theme-selectors"

type ColorToken = {
  name: string
  token: string
  value: string
}

type HslColor = {
  h: number
  s: number
  l: number
  a: number
  isMonochrome: boolean
}

type EnrichedColorToken = ColorToken & {
  hsl: HslColor
  colorFamily: string
}

type GroupMode = "category" | "shades" | "spectrum"

function parseColorToRgb(colorStr: string) {
  const trimmed = colorStr.trim()

  if (/^#([0-9a-f]{3,8})$/i.test(trimmed)) {
    const hex = trimmed.slice(1)
    if (hex.length === 3 || hex.length === 4) {
      const r = parseInt(hex[0] + hex[0], 16)
      const g = parseInt(hex[1] + hex[1], 16)
      const b = parseInt(hex[2] + hex[2], 16)
      const a = hex.length === 4 ? parseInt(hex[3] + hex[3], 16) / 255 : 1
      return { r, g, b, a }
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16)
      const g = parseInt(hex.slice(2, 4), 16)
      const b = parseInt(hex.slice(4, 6), 16)
      const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1
      return { r, g, b, a }
    }
  }

  if (typeof document !== "undefined") {
    try {
      const canvas = document.createElement("canvas")
      canvas.width = 1
      canvas.height = 1
      const ctx = canvas.getContext("2d", { willReadFrequently: true })
      if (ctx) {
        ctx.fillStyle = trimmed
        ctx.fillRect(0, 0, 1, 1)
        const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
        return { r, g, b, a: a / 255 }
      }
    } catch {
      // Ignore canvas error
    }
  }

  return { r: 0, g: 0, b: 0, a: 1 }
}

function rgbToHsl({ r, g, b, a }: { r: number; g: number; b: number; a: number }): HslColor {
  const rNorm = r / 255
  const gNorm = g / 255
  const bNorm = b / 255

  const max = Math.max(rNorm, gNorm, bNorm)
  const min = Math.min(rNorm, gNorm, bNorm)
  const delta = max - min

  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (delta !== 0) {
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min)
    switch (max) {
      case rNorm:
        h = (gNorm - bNorm) / delta + (gNorm < bNorm ? 6 : 0)
        break
      case gNorm:
        h = (bNorm - rNorm) / delta + 2
        break
      case bNorm:
        h = (rNorm - gNorm) / delta + 4
        break
    }
    h *= 60
  }

  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
    a: Math.round(a * 100) / 100,
    isMonochrome: s < 0.12 || delta < 0.08,
  }
}

function getColorFamily(hsl: HslColor): string {
  if (hsl.isMonochrome) return "Neutrals & Grays"
  const h = hsl.h
  if (h >= 345 || h < 15) return "Reds & Pinks"
  if (h >= 15 && h < 45) return "Oranges & Browns"
  if (h >= 45 && h < 70) return "Yellows & Warm Tones"
  if (h >= 70 && h < 165) return "Greens"
  if (h >= 165 && h < 205) return "Cyans & Teals"
  if (h >= 205 && h < 265) return "Blues"
  if (h >= 265 && h < 345) return "Purples & Violets"
  return "Neutrals & Grays"
}

const COLOR_FAMILY_ORDER = new Map(Object.entries({
  "Neutrals & Grays": 0,
  "Reds & Pinks": 1,
  "Oranges & Browns": 2,
  "Yellows & Warm Tones": 3,
  Greens: 4,
  "Cyans & Teals": 5,
  Blues: 6,
  "Purples & Violets": 7,
}))
const UNKNOWN_COLOR_FAMILY_ORDER = COLOR_FAMILY_ORDER.size

function getColorTokens(): EnrichedColorToken[] {
  if (typeof document === "undefined") return []

  const computedStyle = getComputedStyle(document.documentElement)
  const tokens: EnrichedColorToken[] = []

  const colorTokenRegex = /^--color-/

  for (const property of computedStyle) {
    if (colorTokenRegex.test(property)) {
      const value = computedStyle.getPropertyValue(property).trim()
      if (value && value !== "initial") {
        const rgb = parseColorToRgb(value)
        const hsl = rgbToHsl(rgb)
        const colorFamily = getColorFamily(hsl)
        tokens.push({
          name: property.replace("--color-", "").replace(/-/g, " "),
          token: property,
          value,
          hsl,
          colorFamily,
        })
      }
    }
  }

  return tokens.toSorted((a, b) => a.name.localeCompare(b.name))
}

function ColorSwatch({ token }: { token: EnrichedColorToken }) {
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(token.token).then(() => {
          toast.success(`Copied ${token.token}`)
        })
      }}
      className="group relative flex items-center gap-3 rounded-md border border-border-base/50 p-2 text-left hover:bg-surface-weak/50 transition-colors cursor-pointer"
    >
      <div
        className="size-10 shrink-0 rounded-md border border-border-base/30 shadow-sm"
        style={{ backgroundColor: token.value }}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-text-base">{token.name}</p>
        <p className="truncate text-[10px] text-text-weak font-mono">{token.token}</p>
        <div className="flex items-center gap-1.5 truncate text-[10px] text-text-weaker font-mono">
          <span>{token.value}</span>
          <span className="text-text-weakest">•</span>
          <span>
            L:{token.hsl.l}% H:{token.hsl.h}°
          </span>
        </div>
      </div>
    </button>
  )
}

type PalettePanelProps = {
  className?: string
}

export function PalettePanel({ className }: PalettePanelProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [groupMode, setGroupMode] = useState<GroupMode>("category")
  const [familyFilter, setFamilyFilter] = useState("all")
  const { themeId, mode } = useTheme()

  const [tokens, setTokens] = useState<EnrichedColorToken[]>(() => getColorTokens())

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setTokens(getColorTokens())
    })
    return () => cancelAnimationFrame(raf)
  }, [themeId, mode])

  const filteredTokens = useMemo(() => {
    let result = tokens

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(query) ||
          t.token.toLowerCase().includes(query) ||
          t.value.toLowerCase().includes(query) ||
          t.colorFamily.toLowerCase().includes(query),
      )
    }

    if (familyFilter !== "all") {
      result = result.filter((t) => t.colorFamily === familyFilter)
    }

    return result
  }, [tokens, searchQuery, familyFilter])

  const groupedTokens = useMemo(() => {
    const groups = new Map<string, EnrichedColorToken[]>()

    if (groupMode === "category") {
      for (const token of filteredTokens) {
        const category = token.name.split(" ")[0]
        if (!groups.has(category)) {
          groups.set(category, [])
        }
        groups.get(category)!.push(token)
      }
    } else if (groupMode === "shades") {
      for (const token of filteredTokens) {
        const category = token.colorFamily
        if (!groups.has(category)) {
          groups.set(category, [])
        }
        groups.get(category)!.push(token)
      }
      // Sort groups by color family order and sort tokens inside by Lightness progression
      const sortedEntries = Array.from(groups.entries()).sort(
        (a, b) =>
          (COLOR_FAMILY_ORDER.get(a[0]) ?? UNKNOWN_COLOR_FAMILY_ORDER) -
          (COLOR_FAMILY_ORDER.get(b[0]) ?? UNKNOWN_COLOR_FAMILY_ORDER),
      )
      const sortedMap = new Map<string, EnrichedColorToken[]>()
      for (const [cat, list] of sortedEntries) {
        sortedMap.set(
          cat,
          list.toSorted((a, b) => a.hsl.l - b.hsl.l || a.hsl.h - b.hsl.h),
        )
      }
      return sortedMap
    } else {
      // Spectrum: single group sorted smoothly by Hue & Lightness
      const spectrumTokens = filteredTokens.toSorted((a, b) => {
        const famA = COLOR_FAMILY_ORDER.get(a.colorFamily) ?? UNKNOWN_COLOR_FAMILY_ORDER
        const famB = COLOR_FAMILY_ORDER.get(b.colorFamily) ?? UNKNOWN_COLOR_FAMILY_ORDER
        if (famA !== famB) return famA - famB
        return a.hsl.l - b.hsl.l || a.hsl.h - b.hsl.h
      })
      groups.set("Spectrum Progression", spectrumTokens)
    }

    return groups
  }, [filteredTokens, groupMode])

  return (
    <div className={`flex h-full min-h-0 flex-col gap-3 p-3 ${className ?? ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-text-weak leading-none">
            Theme Palette
          </p>
          <p className="text-xs text-text-weak line-clamp-2">
            {tokens.length} color tokens from theme-tokens.css
          </p>
        </div>
      </div>

      <ThemeSelectors />

      <div className="flex flex-col gap-2">
        <Input
          placeholder="Search colors, tokens, hex values..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-8 text-xs"
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-[11px] font-medium text-text-weak">View:</span>
            <div className="inline-flex rounded-md bg-surface-weak/40 p-0.5 border border-border-base/40">
              <button
                type="button"
                onClick={() => setGroupMode("category")}
                className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  groupMode === "category"
                    ? "bg-surface-raised-base text-text-strong shadow-xs"
                    : "text-text-weak hover:text-text-base"
                }`}
              >
                Category
              </button>
              <button
                type="button"
                onClick={() => setGroupMode("shades")}
                className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  groupMode === "shades"
                    ? "bg-surface-raised-base text-text-strong shadow-xs"
                    : "text-text-weak hover:text-text-base"
                }`}
              >
                Shades
              </button>
              <button
                type="button"
                onClick={() => setGroupMode("spectrum")}
                className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  groupMode === "spectrum"
                    ? "bg-surface-raised-base text-text-strong shadow-xs"
                    : "text-text-weak hover:text-text-base"
                }`}
              >
                Spectrum
              </button>
            </div>
          </div>

          <select
            value={familyFilter}
            onChange={(e) => setFamilyFilter(e.target.value)}
            className="h-7 rounded-md border border-border-base/50 bg-background-base px-2 text-[11px] text-text-weak focus:outline-none focus:ring-1 focus:ring-border-interactive-base"
          >
            <option value="all">All Shade Families</option>
            <option value="Neutrals & Grays">Neutrals & Grays</option>
            <option value="Reds & Pinks">Reds & Pinks</option>
            <option value="Oranges & Browns">Oranges & Browns</option>
            <option value="Yellows & Warm Tones">Yellows & Warm Tones</option>
            <option value="Greens">Greens</option>
            <option value="Cyans & Teals">Cyans & Teals</option>
            <option value="Blues">Blues</option>
            <option value="Purples & Violets">Purples & Violets</option>
          </select>
        </div>
      </div>

      <div
        className="palette-container min-h-0 flex-1 overflow-y-auto"
        style={{ containerType: "inline-size" }}
      >
        <style>{`
          .palette-container { container-type: inline-size; }
          .palette-grid { grid-template-columns: repeat(1, 1fr); }
          @container (min-width: 420px) { .palette-grid { grid-template-columns: repeat(2, 1fr); } }
          @container (min-width: 640px) { .palette-grid { grid-template-columns: repeat(3, 1fr); } }
        `}</style>
        {Array.from(groupedTokens.entries()).map(([category, categoryTokens]) => (
          <div key={category} className="mb-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-text-weaker">
                {category}
              </p>
              <span className="text-[10px] text-text-weakest font-mono">
                {categoryTokens.length} tokens
              </span>
            </div>
            <div className="palette-grid grid gap-1.5">
              {categoryTokens.map((token) => (
                <ColorSwatch key={token.token} token={token} />
              ))}
            </div>
          </div>
        ))}
        {filteredTokens.length === 0 && (
          <p className="py-4 text-center text-xs text-text-weak">
            No color tokens match your search or filter.
          </p>
        )}
      </div>
    </div>
  )
}
