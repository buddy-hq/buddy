import { createFileRoute } from "@tanstack/react-router"
import { useTheme } from "@/theme"
import { useState, useEffect } from "react"
import { SunIcon, MoonIcon, LaptopIcon, ImageIcon } from "lucide-react"

export const Route = createFileRoute("/contrast-test")({
  component: ContrastTestPage,
})

// Color luminance and contrast utilities
const toLinearRgb = (v: number) => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)

const relativeLuminance = (rgb: { r: number; g: number; b: number }) => {
  return 0.2126 * toLinearRgb(rgb.r) + 0.7152 * toLinearRgb(rgb.g) + 0.0722 * toLinearRgb(rgb.b)
}

const hexToRgb = (hex: string) => {
  let cleanHex = hex.replace("#", "").trim()
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split("").map((c) => c + c).join("")
  }
  const match = cleanHex.match(/.{2}/g)
  if (!match) return { r: 255, g: 255, b: 255 }
  return {
    r: parseInt(match[0], 16),
    g: parseInt(match[1], 16),
    b: parseInt(match[2], 16),
  }
}

const getContrastRatio = (fgHex: string, bgHex: string) => {
  const fgL = relativeLuminance({
    r: hexToRgb(fgHex).r / 255,
    g: hexToRgb(fgHex).g / 255,
    b: hexToRgb(fgHex).b / 255,
  })
  const bgL = relativeLuminance({
    r: hexToRgb(bgHex).r / 255,
    g: hexToRgb(bgHex).g / 255,
    b: hexToRgb(bgHex).b / 255,
  })
  return ((Math.max(fgL, bgL) + 0.05) / (Math.min(fgL, bgL) + 0.05)).toFixed(2)
}

const toHex = (n: number) => {
  const hex = n.toString(16)
  return hex.length === 1 ? "0" + hex : hex
}

// Mix two colors together preserving hue
const mixColors = (color1: string, color2: string, weight: number) => {
  const c1 = hexToRgb(color1)
  const c2 = hexToRgb(color2)
  const r = Math.round(c1.r * (1 - weight) + c2.r * weight)
  const g = Math.round(c1.g * (1 - weight) + c2.g * weight)
  const b = Math.round(c1.b * (1 - weight) + c2.b * weight)
  
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

// Tune preferred color up or down based on background luminance to pass WCAG 4.5:1
const tuneColorForContrast = (preferredHex: string, backgroundHex: string, minimumRatio = 4.5) => {
  const currentRatio = parseFloat(getContrastRatio(preferredHex, backgroundHex))
  if (currentRatio >= minimumRatio) return preferredHex

  const bgRgb = hexToRgb(backgroundHex)
  const bgL = relativeLuminance({ r: bgRgb.r / 255, g: bgRgb.g / 255, b: bgRgb.b / 255 })
  
  // Mix with black if light background; mix with white if dark background
  const target = bgL > 0.5 ? "#000000" : "#ffffff"
  
  for (let weight = 0.05; weight <= 1.0; weight += 0.05) {
    const candidate = mixColors(preferredHex, target, weight)
    const ratio = parseFloat(getContrastRatio(candidate, backgroundHex))
    if (ratio >= minimumRatio) {
      return candidate
    }
  }
  return target
}

type VariantConfig = {
  name: string
  label: string
  bgVar: string
  bgVarAfter?: string
  fgVarBefore: string
  fgVarAfter?: string
  fgVarAfterHover?: string
  classesBefore: string
  classesAfter: string
  skipBoundaryAudit?: boolean
  boundaryTargetRatio?: number // Custom boundary ratio target (default 3.0)
  isTransparent?: boolean     // True if the component is transparent (no solid background fill)
}

const buttonVariants: VariantConfig[] = [
  {
    name: "default",
    label: "Default (Primary)",
    bgVar: "--button-primary-base",
    fgVarBefore: "--text-on-button-primary-base",
    fgVarAfter: "--text-on-button-primary-base",
    fgVarAfterHover: "--text-on-button-primary-hover",
    classesBefore: "bg-button-primary-base text-text-on-button-primary-base hover:bg-button-primary-hover",
    classesAfter: "bg-button-primary-base hover:bg-button-primary-hover",
  },
  {
    name: "destructive",
    label: "Destructive",
    bgVar: "--surface-critical-weak",
    fgVarBefore: "--icon-critical-base",
    fgVarAfter: "--text-on-critical-weak",
    fgVarAfterHover: "--text-on-critical-base",
    classesBefore: "bg-surface-critical-weak text-icon-critical-base hover:bg-surface-critical-weak/80",
    classesAfter: "bg-surface-critical-weak hover:bg-surface-critical-base",
    skipBoundaryAudit: true,
  },
  {
    name: "outline",
    label: "Outline",
    bgVar: "--background-base",
    fgVarBefore: "--text-base",
    classesBefore: "border border-border-base bg-background-base text-text-base hover:bg-surface-base-hover hover:text-text-strong",
    classesAfter: "border border-border-base bg-background-base hover:bg-surface-base-hover hover:text-text-strong",
  },
  {
    name: "secondary",
    label: "Secondary",
    bgVar: "--button-secondary-base",
    bgVarAfter: "--button-secondary-base",
    fgVarBefore: "--text-strong",
    fgVarAfter: "--text-on-button-secondary-base",
    fgVarAfterHover: "--text-on-button-secondary-hover",
    classesBefore: "border border-border-base bg-button-secondary-base text-text-strong hover:bg-button-secondary-hover shadow-xs",
    classesAfter: "bg-button-secondary-base hover:bg-button-secondary-hover shadow-xs",
    boundaryTargetRatio: 1.3,
  },
  {
    name: "ghost",
    label: "Ghost",
    bgVar: "--background-base",
    fgVarBefore: "--text-strong",
    classesBefore: "text-text-strong hover:bg-surface-base-hover hover:text-text-strong",
    classesAfter: "hover:bg-surface-base-hover hover:text-text-strong",
    skipBoundaryAudit: true,
    isTransparent: true,
  },
  {
    name: "link",
    label: "Link",
    bgVar: "--background-base",
    fgVarBefore: "--text-interactive-base",
    classesBefore: "text-text-interactive-base underline-offset-4 hover:underline",
    classesAfter: "underline-offset-4 hover:underline",
    skipBoundaryAudit: true,
    isTransparent: true,
  },
]

const badgeVariants: VariantConfig[] = [
  {
    name: "default",
    label: "Default",
    bgVar: "--surface-interactive-base",
    fgVarBefore: "--text-on-interactive-base",
    classesBefore: "bg-surface-interactive-base text-text-on-interactive-base",
    classesAfter: "bg-surface-interactive-base",
  },
  {
    name: "secondary",
    label: "Secondary",
    bgVar: "--button-secondary-base",
    bgVarAfter: "--button-secondary-base",
    fgVarBefore: "--text-strong",
    fgVarAfter: "--text-on-button-secondary-base",
    classesBefore: "border border-border-base bg-button-secondary-base text-text-strong",
    classesAfter: "bg-button-secondary-base text-text-strong",
    boundaryTargetRatio: 1.3,
  },
  {
    name: "destructive",
    label: "Destructive",
    bgVar: "--surface-critical-weak",
    fgVarBefore: "--text-on-critical-weak",
    fgVarAfter: "--text-on-critical-weak",
    classesBefore: "bg-surface-critical-weak text-text-on-critical-weak",
    classesAfter: "bg-surface-critical-weak",
    skipBoundaryAudit: true,
  },
  {
    name: "outline",
    label: "Outline",
    bgVar: "--background-base",
    fgVarBefore: "--text-base",
    classesBefore: "border border-border-base text-text-base",
    classesAfter: "border border-border-base",
  },
  {
    name: "ghost",
    label: "Ghost",
    bgVar: "--background-base",
    fgVarBefore: "--text-weak",
    classesBefore: "text-text-weak hover:bg-surface-weak",
    classesAfter: "hover:bg-surface-weak",
    skipBoundaryAudit: true,
    isTransparent: true,
  },
  {
    name: "link",
    label: "Link",
    bgVar: "--background-base",
    fgVarBefore: "--text-interactive-base",
    classesBefore: "text-text-interactive-base underline-offset-4 hover:underline",
    classesAfter: "underline-offset-4 hover:underline",
    skipBoundaryAudit: true,
    isTransparent: true,
  },
]

const otherComponents: VariantConfig[] = [
  {
    name: "success-indicator",
    label: "Success Tag (Onboarding)",
    bgVar: "--surface-success-weak",
    fgVarBefore: "--icon-success-base",
    fgVarAfter: "--text-on-success-weak",
    classesBefore: "border border-border-success-base/30 bg-surface-success-weak px-2.5 py-1 text-xs font-semibold text-icon-success-base rounded-full inline-flex items-center",
    classesAfter: "border border-border-success-base/30 bg-surface-success-weak px-2.5 py-1 text-xs font-semibold rounded-full inline-flex items-center",
    skipBoundaryAudit: true,
  },
  {
    name: "warning-banner",
    label: "Warning Banner (Editor)",
    bgVar: "--surface-warning-weak",
    fgVarBefore: "--text-warning-base",
    fgVarAfter: "--text-on-warning-weak",
    classesBefore: "rounded-md border border-border-warning-base/50 bg-surface-warning-weak px-3 py-2 text-xs text-text-warning-base",
    classesAfter: "rounded-md border border-border-warning-base/50 bg-surface-warning-weak px-3 py-2 text-xs",
    skipBoundaryAudit: true,
  },
  {
    name: "warning-tag",
    label: "Warning Indicator (Sidebar)",
    bgVar: "--surface-warning-weak",
    fgVarBefore: "--icon-warning-base",
    fgVarAfter: "--text-on-warning-weak",
    classesBefore: "rounded-sm bg-surface-warning-weak px-1.5 py-0.5 text-[11px] font-medium text-icon-warning-base inline-flex items-center w-fit",
    classesAfter: "rounded-sm bg-surface-warning-weak px-1.5 py-0.5 text-[11px] font-medium inline-flex items-center w-fit",
    skipBoundaryAudit: true,
  },
  {
    name: "info-icon",
    label: "Capability Icon (Dropdown)",
    bgVar: "--surface-raised-stronger-non-alpha",
    fgVarBefore: "--icon-info-base",
    fgVarAfter: "--icon-weak",
    classesBefore: "",
    classesAfter: "",
    skipBoundaryAudit: true,
    isTransparent: true,
  },
]

type ColorDetails = {
  bgBeforeNormal: string
  bgBeforeHover: string
  bgAfterNormal: string
  bgAfterHover: string
  
  fgBeforeNormal: string
  fgBeforeHover: string
  fgAfterNormal: string
  fgAfterHover: string
  
  ratioBeforeNormal: string
  ratioBeforeHover: string
  ratioAfterNormal: string
  ratioAfterHover: string
  
  hasBorderBefore: boolean
  hasBorderAfter: boolean
  
  boundaryRatioBeforeNormal: string
  boundaryRatioBeforeHover: string
  boundaryRatioAfterNormal: string
  boundaryRatioAfterHover: string
}

const renderContrastAudit = (
  normalTextRatioStr: string,
  hoverTextRatioStr: string | undefined,
  normalBoundaryRatioStr: string,
  hoverBoundaryRatioStr: string | undefined,
  isBorder: boolean,
  skipBoundary: boolean,
  isHovered: boolean,
  isInteractive: boolean,
  boundaryTargetRatio = 3.0
) => {
  const normalTextRatio = parseFloat(normalTextRatioStr || "0.00")
  const normalTextPassing = normalTextRatio >= 4.5

  const normalBoundaryRatio = parseFloat(normalBoundaryRatioStr || "0.00")
  const normalBoundaryPassing = normalBoundaryRatio >= boundaryTargetRatio

  if (!isInteractive) {
    return (
      <div className="flex flex-col gap-1.5 text-[11px] p-2 rounded-md border bg-surface-weak/5 border-border-weak-base/50 w-52 shrink-0">
        <div className="flex items-center justify-between gap-3 p-0.5 rounded">
          <span className="text-text-weak">Text vs Fill:</span>
          <span className={`font-mono font-bold px-1.5 py-0.5 rounded text-[10px] ${
            normalTextPassing ? "text-green-600 bg-green-500/10 dark:text-green-400" : "text-red-500 bg-red-500/10"
          }`}>
            {normalTextRatioStr}:1 {normalTextPassing ? "✅" : "❌"}
          </span>
        </div>
        {!skipBoundary && (
          <div className="flex items-center justify-between gap-3 p-0.5 rounded border-t border-border-weak-base/30 pt-1.5 mt-0.5">
            <span className="text-text-weak">{isBorder ? "Border vs Page:" : "Fill vs Page:"}</span>
            <span className={`font-mono font-bold px-1.5 py-0.5 rounded text-[10px] ${
              normalBoundaryPassing ? "text-green-600 bg-green-500/10 dark:text-green-400" : "text-red-500 bg-red-500/10"
            }`}>
              {normalBoundaryRatioStr}:1 ({boundaryTargetRatio.toFixed(1)}) {normalBoundaryPassing ? "✅" : "❌"}
            </span>
          </div>
        )}
      </div>
    )
  }

  const hoverTextRatio = parseFloat(hoverTextRatioStr || "0.00")
  const hoverTextPassing = hoverTextRatio >= 4.5
  const hoverBoundaryRatio = parseFloat(hoverBoundaryRatioStr || "0.00")
  const hoverBoundaryPassing = hoverBoundaryRatio >= boundaryTargetRatio

  return (
    <div className={`flex flex-col gap-1.5 text-[11px] p-2 rounded-md border w-52 shrink-0 transition-all duration-200 ${
      isHovered ? "bg-surface-interactive-weak/10 border-border-interactive-base/40 shadow-xs" : "bg-surface-weak/5 border-border-weak-base/50"
    }`}>
      <div className={`flex items-center justify-between gap-3 p-0.5 rounded transition-colors ${
        !isHovered ? "bg-surface-interactive-weak/5 font-semibold text-text-strong" : "opacity-60"
      }`}>
        <span className="text-text-weak">Text (Normal):</span>
        <span className={`font-mono font-bold px-1.5 py-0.5 rounded text-[10px] ${
          normalTextPassing ? "text-green-600 bg-green-500/10 dark:text-green-400" : "text-red-500 bg-red-500/10"
        }`}>
          {normalTextRatioStr}:1 {normalTextPassing ? "✅" : "❌"}
        </span>
      </div>
      <div className={`flex items-center justify-between gap-3 p-0.5 rounded transition-colors ${
        isHovered ? "bg-surface-interactive-weak/20 font-semibold text-text-strong" : "opacity-60"
      }`}>
        <span className="text-text-weak">Text (Hover):</span>
        <span className={`font-mono font-bold px-1.5 py-0.5 rounded text-[10px] ${
          hoverTextPassing ? "text-green-600 bg-green-500/10 dark:text-green-400" : "text-red-500 bg-red-500/10"
        }`}>
          {hoverTextRatioStr}:1 {hoverTextPassing ? "✅" : "❌"}
        </span>
      </div>
      {!skipBoundary && (
        <>
          <div className="border-t border-border-weak-base/30 my-0.5" />
          <div className={`flex items-center justify-between gap-3 p-0.5 rounded transition-colors ${
            !isHovered ? "opacity-100" : "opacity-60"
          }`}>
            <span className="text-text-weak">{isBorder ? "Border vs Page:" : "Fill vs Page (Norm):"}</span>
            <span className={`font-mono font-bold px-1.5 py-0.5 rounded text-[10px] ${
              normalBoundaryPassing ? "text-green-600 bg-green-500/10 dark:text-green-400" : "text-red-500 bg-red-500/10"
            }`}>
              {normalBoundaryRatioStr}:1 ({boundaryTargetRatio.toFixed(1)}) {normalBoundaryPassing ? "✅" : "❌"}
            </span>
          </div>
          <div className={`flex items-center justify-between gap-3 p-0.5 rounded transition-colors ${
            isHovered ? "opacity-100" : "opacity-60"
          }`}>
            <span className="text-text-weak">{isBorder ? "Border vs Page:" : "Fill vs Page (Hover):"}</span>
            <span className={`font-mono font-bold px-1.5 py-0.5 rounded text-[10px] ${
              hoverBoundaryPassing ? "text-green-600 bg-green-500/10 dark:text-green-400" : "text-red-500 bg-red-500/10"
            }`}>
              {hoverBoundaryRatioStr}:1 ({boundaryTargetRatio.toFixed(1)}) {hoverBoundaryPassing ? "✅" : "❌"}
            </span>
          </div>
        </>
      )}
    </div>
  )
}

function ContrastTestPage() {
  const { themeId, colorScheme, themes, setTheme, setColorScheme, mode } = useTheme()
  const [colorDetailsMap, setColorDetailsMap] = useState<Record<string, ColorDetails>>({})
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)

  useEffect(() => {
    const getCssVar = (name: string) => {
      if (typeof window === "undefined") return "#000000"
      const val = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
      return val || "#000000"
    }

    const raf = requestAnimationFrame(() => {
      const results: Record<string, ColorDetails> = {}

      const containerBg = getCssVar("--surface-raised-base")
      const borderBaseColor = getCssVar("--border-base")
      const borderWeakColor = getCssVar("--border-weak")

      const allConfigs = [
        ...buttonVariants.map(v => ({...v, prefix: "btn-"})), 
        ...badgeVariants.map(v => ({...v, prefix: "badge-"})),
        ...otherComponents.map(v => ({...v, prefix: "other-"})),
      ]

      for (const config of allConfigs) {
        const bgBeforeNormal = config.isTransparent ? containerBg : getCssVar(config.bgVar)
        const bgAfterNormal = config.isTransparent 
          ? containerBg 
          : (config.bgVarAfter ? getCssVar(config.bgVarAfter) : bgBeforeNormal)

        const fgBeforeNormal = getCssVar(config.fgVarBefore)
        
        let fgAfterNormal: string
        if (config.fgVarAfter) {
          fgAfterNormal = getCssVar(config.fgVarAfter)
        } else {
          fgAfterNormal = tuneColorForContrast(fgBeforeNormal, bgAfterNormal)
        }

        // Determine hover background before and after
        let bgBeforeHover = bgBeforeNormal
        let bgAfterHover = bgAfterNormal

        if (config.prefix === "btn-") {
          if (config.name === "default") {
            bgBeforeHover = getCssVar("--button-primary-hover")
            bgAfterHover = getCssVar("--button-primary-hover")
          } else if (config.name === "destructive") {
            bgBeforeHover = mixColors(bgBeforeNormal, containerBg, 0.2)
            bgAfterHover = getCssVar("--surface-critical-base")
          } else if (config.name === "outline" || config.name === "ghost") {
            bgBeforeHover = getCssVar("--surface-base-hover")
            bgAfterHover = getCssVar("--surface-base-hover")
          } else if (config.name === "secondary") {
            bgBeforeHover = getCssVar("--button-secondary-hover")
            bgAfterHover = getCssVar("--button-secondary-hover")
          }
        }

        // Determine hover foreground before and after by tuning them against hover backgrounds
        let fgBeforeHover = fgBeforeNormal
        let fgAfterHover = fgAfterNormal

        if (bgBeforeHover !== bgBeforeNormal) {
          fgBeforeHover = tuneColorForContrast(fgBeforeNormal, bgBeforeHover)
        }
        if (config.fgVarAfterHover) {
          fgAfterHover = getCssVar(config.fgVarAfterHover)
        } else if (bgAfterHover !== bgAfterNormal) {
          if (config.fgVarAfter) {
            fgAfterHover = getCssVar(config.fgVarAfter)
          } else {
            fgAfterHover = tuneColorForContrast(fgBeforeNormal, bgAfterHover)
          }
        }

        const classesBefore = config.classesBefore || ""
        const classesAfter = config.classesAfter || ""

        const hasBorderBefore = classesBefore.split(" ").some(c => c.startsWith("border") && c !== "border-transparent" && c !== "border-none")
        const hasBorderAfter = classesAfter.split(" ").some(c => c.startsWith("border") && c !== "border-transparent" && c !== "border-none")

        const borderBeforeColor = borderBaseColor
        const borderAfterColor = classesAfter.includes("border-border-weak") ? borderWeakColor : borderBaseColor

        const boundaryColorBeforeNormal = hasBorderBefore ? borderBeforeColor : bgBeforeNormal
        const boundaryColorBeforeHover = hasBorderBefore ? borderBeforeColor : bgBeforeHover
        const boundaryColorAfterNormal = hasBorderAfter ? borderAfterColor : bgAfterNormal
        const boundaryColorAfterHover = hasBorderAfter ? borderAfterColor : bgAfterHover

        results[`${config.prefix}${config.name}`] = {
          bgBeforeNormal,
          bgBeforeHover,
          bgAfterNormal,
          bgAfterHover,
          
          fgBeforeNormal,
          fgBeforeHover,
          fgAfterNormal,
          fgAfterHover,

          ratioBeforeNormal: getContrastRatio(fgBeforeNormal, bgBeforeNormal),
          ratioBeforeHover: getContrastRatio(fgBeforeHover, bgBeforeHover),
          ratioAfterNormal: getContrastRatio(fgAfterNormal, bgAfterNormal),
          ratioAfterHover: getContrastRatio(fgAfterHover, bgAfterHover),

          hasBorderBefore,
          hasBorderAfter,

          boundaryRatioBeforeNormal: getContrastRatio(boundaryColorBeforeNormal, containerBg),
          boundaryRatioBeforeHover: getContrastRatio(boundaryColorBeforeHover, containerBg),
          boundaryRatioAfterNormal: getContrastRatio(boundaryColorAfterNormal, containerBg),
          boundaryRatioAfterHover: getContrastRatio(boundaryColorAfterHover, containerBg),
        }
      }

      setColorDetailsMap(results)
    })

    return () => cancelAnimationFrame(raf)
  }, [themeId, colorScheme, mode])

  const quickThemes = ["oc-2", "dracula", "github", "everforest", "vesper"]

  return (
    <div className="min-h-screen bg-background-base p-8 text-text-base transition-colors duration-200">
      <div className="mx-auto max-w-6xl space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-border-base pb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-text-strong">
              Accessible Hue-Preservation Contrast Playground
            </h1>
            <p className="mt-1 text-sm text-text-weak">
              Tune your foreground colors to pass WCAG 4.5:1 while keeping their exact red, orange, and green hue!
            </p>
          </div>

          {/* Scheme Toggles */}
          <div className="flex items-center gap-2 rounded-lg border border-border-base bg-surface-raised-base p-1 shrink-0 w-fit">
            <button
              onClick={() => setColorScheme("light")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                colorScheme === "light" ? "bg-background-base text-text-strong shadow-xs" : "hover:text-text-strong"
              }`}
            >
              <SunIcon className="size-3.5" /> Light
            </button>
            <button
              onClick={() => setColorScheme("dark")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                colorScheme === "dark" ? "bg-background-base text-text-strong shadow-xs" : "hover:text-text-strong"
              }`}
            >
              <MoonIcon className="size-3.5" /> Dark
            </button>
            <button
              onClick={() => setColorScheme("system")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                colorScheme === "system" ? "bg-background-base text-text-strong shadow-xs" : "hover:text-text-strong"
              }`}
            >
              <LaptopIcon className="size-3.5" /> System
            </button>
          </div>
        </div>

        {/* Theme Quick Selector */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-weak">Select Active Theme</h2>
          <div className="flex flex-wrap gap-2">
            {quickThemes.map((id) => {
              const theme = themes[id]
              if (!theme) return null
              return (
                <button
                  key={id}
                  onClick={() => setTheme(id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all ${
                    themeId === id
                      ? "border-border-interactive-base bg-surface-interactive-base text-text-interactive-base shadow-xs"
                      : "border-border-base bg-surface-raised-base hover:bg-surface-base-hover hover:text-text-strong"
                  }`}
                >
                  {theme.name}
                </button>
              )
            })}
          </div>
        </div>

        {/* BUTTON VARIANTS GRID */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold tracking-tight text-text-strong">Button Variants</h2>
          <div className="rounded-xl border border-border-base bg-surface-raised-base overflow-hidden">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-border-base bg-surface-weak/30 text-text-weak text-xs">
                  <th className="p-4 font-medium">Variant</th>
                  <th className="p-4 font-medium w-64">Before (Original Style)</th>
                  <th className="p-4 font-medium">Before Contrast Audit</th>
                  <th className="p-4 font-medium w-64">After (Proposed Fix)</th>
                  <th className="p-4 font-medium">After Contrast Audit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-base">
                {buttonVariants.map((v) => {
                  const mapKey = `btn-${v.name}`
                  const details = colorDetailsMap[mapKey]
                  if (!details) return null
                  const keyBefore = `${v.name}-before`
                  const keyAfter = `${v.name}-after`
                  const isHoveredBefore = hoveredKey === keyBefore
                  const isHoveredAfter = hoveredKey === keyAfter
                  const targetRatio = v.boundaryTargetRatio ?? 3.0

                  return (
                    <tr key={v.name} className="hover:bg-surface-weak/10">
                      <td className="p-4 font-medium text-text-strong capitalize">{v.label}</td>
                      <td className="p-4">
                        <button 
                          onMouseEnter={() => setHoveredKey(keyBefore)}
                          onMouseLeave={() => setHoveredKey(null)}
                          style={{
                            transition: "all 150ms cubic-bezier(0.4, 0, 0.2, 1)",
                            ...(!v.isTransparent ? { backgroundColor: isHoveredBefore ? details.bgBeforeHover : details.bgBeforeNormal } : {})
                          }}
                          className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium h-9 px-4 py-2 cursor-pointer ${v.classesBefore}`}
                        >
                          Button <span className="text-[10px] opacity-75 font-mono">{details.fgBeforeNormal}</span>
                        </button>
                      </td>
                      <td className="p-4">
                        {renderContrastAudit(
                          details.ratioBeforeNormal,
                          details.ratioBeforeHover,
                          details.boundaryRatioBeforeNormal,
                          details.boundaryRatioBeforeHover,
                          details.hasBorderBefore,
                          !!v.skipBoundaryAudit,
                          isHoveredBefore,
                          true,
                          targetRatio
                        )}
                      </td>
                      <td className="p-4">
                        <button 
                          onMouseEnter={() => setHoveredKey(keyAfter)}
                          onMouseLeave={() => setHoveredKey(null)}
                          style={{
                            transition: "all 150ms cubic-bezier(0.4, 0, 0.2, 1)",
                            color: isHoveredAfter ? details.fgAfterHover : details.fgAfterNormal,
                            ...(!v.isTransparent ? { backgroundColor: isHoveredAfter ? details.bgAfterHover : details.bgAfterNormal } : {})
                          }}
                          className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium h-9 px-4 py-2 cursor-pointer ${v.classesAfter}`}
                        >
                          Button <span className="text-[10px] opacity-75 font-mono">{details.fgAfterNormal}</span>
                        </button>
                      </td>
                      <td className="p-4">
                        {renderContrastAudit(
                          details.ratioAfterNormal,
                          details.ratioAfterHover,
                          details.boundaryRatioAfterNormal,
                          details.boundaryRatioAfterHover,
                          details.hasBorderAfter,
                          !!v.skipBoundaryAudit,
                          isHoveredAfter,
                          true,
                          targetRatio
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* BADGE VARIANTS GRID */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold tracking-tight text-text-strong">Badge Variants</h2>
          <div className="rounded-xl border border-border-base bg-surface-raised-base overflow-hidden">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-border-base bg-surface-weak/30 text-text-weak text-xs">
                  <th className="p-4 font-medium">Variant</th>
                  <th className="p-4 font-medium w-64">Before (Original Style)</th>
                  <th className="p-4 font-medium">Before Contrast Audit</th>
                  <th className="p-4 font-medium w-64">After (Proposed Fix)</th>
                  <th className="p-4 font-medium">After Contrast Audit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-base">
                {badgeVariants.map((v) => {
                  const mapKey = `badge-${v.name}`
                  const details = colorDetailsMap[mapKey]
                  if (!details) return null
                  const targetRatio = v.boundaryTargetRatio ?? 3.0

                  return (
                    <tr key={v.name} className="hover:bg-surface-weak/10">
                      <td className="p-4 font-medium text-text-strong capitalize">{v.label}</td>
                      <td className="p-4">
                        <span 
                          style={v.isTransparent ? {} : { backgroundColor: details.bgBeforeNormal }}
                          className={`h-5 gap-1 rounded-4xl px-2 py-0.5 text-xs font-medium inline-flex items-center justify-center w-fit ${v.classesBefore}`}
                        >
                          Badge <span className="ml-1 text-[9px] opacity-75 font-mono">{details.fgBeforeNormal}</span>
                        </span>
                      </td>
                      <td className="p-4">
                        {renderContrastAudit(
                          details.ratioBeforeNormal,
                          undefined,
                          details.boundaryRatioBeforeNormal,
                          undefined,
                          details.hasBorderBefore,
                          !!v.skipBoundaryAudit,
                          false,
                          false,
                          targetRatio
                        )}
                      </td>
                      <td className="p-4">
                        <span 
                          style={{ 
                            color: details.fgAfterNormal, 
                            ...(!v.isTransparent ? { backgroundColor: details.bgAfterNormal } : {})
                          }}
                          className={`h-5 gap-1 rounded-4xl px-2 py-0.5 text-xs font-medium inline-flex items-center justify-center w-fit ${v.classesAfter}`}
                        >
                          Badge <span className="ml-1 text-[9px] opacity-75 font-mono">{details.fgAfterNormal}</span>
                        </span>
                      </td>
                      <td className="p-4">
                        {renderContrastAudit(
                          details.ratioAfterNormal,
                          undefined,
                          details.boundaryRatioAfterNormal,
                          undefined,
                          details.hasBorderAfter,
                          !!v.skipBoundaryAudit,
                          false,
                          false,
                          targetRatio
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ADDITIONAL LOW CONTRAST COMPONENTS */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold tracking-tight text-text-strong">Additional Tuned Components</h2>
          <div className="rounded-xl border border-border-base bg-surface-raised-base overflow-hidden">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-border-base bg-surface-weak/30 text-text-weak text-xs">
                  <th className="p-4 font-medium">Component</th>
                  <th className="p-4 font-medium">Before Style (Low Contrast)</th>
                  <th className="p-4 font-medium">Before Contrast Audit</th>
                  <th className="p-4 font-medium">After Style (Proposed Fix)</th>
                  <th className="p-4 font-medium">After Contrast Audit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-base">
                {otherComponents.map((v) => {
                  const mapKey = `other-${v.name}`
                  const details = colorDetailsMap[mapKey]
                  if (!details) return null
                  const targetRatio = v.boundaryTargetRatio ?? 3.0

                  return (
                    <tr key={v.name} className="hover:bg-surface-weak/10">
                      <td className="p-4 font-medium text-text-strong">{v.label}</td>
                      <td className="p-4">
                        {v.name === "info-icon" ? (
                          <div className="bg-surface-raised-stronger-non-alpha border border-border-base p-2 rounded-md flex items-center justify-between text-xs text-text-base w-48 font-medium">
                            <span>GPT-4o (Vision)</span>
                            <ImageIcon className="size-3.5 text-icon-info-base" />
                          </div>
                        ) : (
                          <div className={v.classesBefore}>
                            {v.name.includes("banner") ? "Warning: Unsaved files will be lost if you discard these changes." : "Warning Label"}
                            <span className="ml-2 text-[9px] opacity-75 font-mono">({details.fgBeforeNormal})</span>
                          </div>
                        )}
                      </td>
                      <td className="p-4">
                        {renderContrastAudit(
                          details.ratioBeforeNormal,
                          undefined,
                          details.boundaryRatioBeforeNormal,
                          undefined,
                          details.hasBorderBefore,
                          !!v.skipBoundaryAudit,
                          false,
                          false,
                          targetRatio
                        )}
                      </td>
                      <td className="p-4">
                        {v.name === "info-icon" ? (
                          <div className="bg-surface-raised-stronger-non-alpha border border-border-base p-2 rounded-md flex items-center justify-between text-xs text-text-base w-48 font-medium">
                            <span>GPT-4o (Vision)</span>
                            <ImageIcon style={{ color: details.fgAfterNormal }} className="size-3.5" />
                          </div>
                        ) : (
                          <div style={{ color: details.fgAfterNormal }} className={v.classesAfter}>
                            {v.name.includes("banner") ? "Warning: Unsaved files will be lost if you discard these changes." : "Warning Label"}
                            <span className="ml-2 text-[9px] opacity-75 font-mono">({details.fgAfterNormal})</span>
                          </div>
                        )}
                      </td>
                      <td className="p-4">
                        {renderContrastAudit(
                          details.ratioAfterNormal,
                          undefined,
                          details.boundaryRatioAfterNormal,
                          undefined,
                          details.hasBorderAfter,
                          !!v.skipBoundaryAudit,
                          false,
                          false,
                          targetRatio
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  )
}
