import { oklchToHex, rgbToOklch } from "@/theme/color"
import type { OklchColor } from "@/theme/types"
import { parseColor, type ParsedColor } from "./color"
import type { MermaidThemeConfig, MermaidThemeTokens } from "./theme"

type MermaidColorRole = "fill" | "stroke" | "text"

type MermaidColorContext = {
  canvas: ParsedColor
  tokens: MermaidThemeTokens
}

const DARK_BACKGROUND_MAX_LIGHTNESS = 0.5
const NEUTRAL_MAX_CHROMA = 0.01
const FILL_MAX_LIGHTNESS = 0.42
const FILL_CHROMA_BOOST = 1.6
const FILL_MIN_CHROMA = 0.03
const FILL_MAX_CHROMA = 0.08
const STROKE_MIN_LIGHTNESS = 0.7
const STROKE_MAX_CHROMA = 0.14
const TEXT_MIN_LIGHTNESS = 0.86
const TEXT_MAX_CHROMA = 0.08
const MAX_CHANNEL = 255
const LIGHT_CANVAS: ParsedColor = { alpha: 1, red: MAX_CHANNEL, green: MAX_CHANNEL, blue: MAX_CHANNEL }
const COLOR_PROBE_SENTINEL = "#010203"
const STYLE_LINE_PATTERN = /^\s*(?:style|classDef|linkStyle)\s/u
const STYLE_COLOR_PATTERN =
  /(^|[\s,;])(background-color|background|fill|stroke|color)(\s*:\s*)(#[0-9a-f]{3,8}\b|(?:rgba?|hsla?)\([^)]*\)|[a-z]+)/giu
const SEQUENCE_DIAGRAM_PATTERN = /^\s*sequenceDiagram\b/mu
const SEQUENCE_RECT_PATTERN = /^(\s*rect\s+)(.+?)\s*$/u

let colorProbe: CanvasRenderingContext2D | null | undefined

function readColorProbe(): CanvasRenderingContext2D | null {
  if (colorProbe === undefined) {
    colorProbe = "document" in globalThis ? document.createElement("canvas").getContext("2d") : null
  }
  return colorProbe
}

function resolveColor(value: string): ParsedColor | undefined {
  const parsed = parseColor(value)
  if (parsed) {
    return parsed
  }
  const probe = readColorProbe()
  if (!probe) {
    return undefined
  }
  probe.fillStyle = COLOR_PROBE_SENTINEL
  probe.fillStyle = value
  const resolved = String(probe.fillStyle)
  return resolved.toLowerCase() === COLOR_PROBE_SENTINEL ? undefined : parseColor(resolved)
}

function toOklch(color: ParsedColor): OklchColor {
  return rgbToOklch(color.red / MAX_CHANNEL, color.green / MAX_CHANNEL, color.blue / MAX_CHANNEL)
}

function fromOklch(color: OklchColor): ParsedColor | undefined {
  return parseColor(oklchToHex(color))
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function adaptChromaticColor(color: OklchColor, role: MermaidColorRole): OklchColor {
  if (role === "fill") {
    if (color.l <= FILL_MAX_LIGHTNESS) {
      return color
    }
    return {
      l: FILL_MAX_LIGHTNESS,
      c: clamp(color.c * FILL_CHROMA_BOOST, FILL_MIN_CHROMA, FILL_MAX_CHROMA),
      h: color.h,
    }
  }
  if (role === "stroke") {
    return {
      l: Math.max(color.l, STROKE_MIN_LIGHTNESS),
      c: Math.min(color.c, STROKE_MAX_CHROMA),
      h: color.h,
    }
  }
  return {
    l: Math.max(color.l, TEXT_MIN_LIGHTNESS),
    c: Math.min(color.c, TEXT_MAX_CHROMA),
    h: color.h,
  }
}

function adaptNeutralFill(color: OklchColor, tokens: MermaidThemeTokens): OklchColor {
  const surface = parseColor(tokens.surfaceBase)
  const tint = surface ? toOklch(surface) : { l: 0, c: 0, h: 0 }
  const floor = Math.min(tint.l, FILL_MAX_LIGHTNESS)
  return {
    l: floor + color.l * (FILL_MAX_LIGHTNESS - floor),
    c: tint.c,
    h: tint.h,
  }
}

function adaptOpaqueColor(
  color: ParsedColor,
  role: MermaidColorRole,
  tokens: MermaidThemeTokens,
): ParsedColor | undefined {
  const oklch = toOklch(color)
  if (oklch.c >= NEUTRAL_MAX_CHROMA) {
    return fromOklch(adaptChromaticColor(oklch, role))
  }
  if (role === "fill") {
    return fromOklch(adaptNeutralFill(oklch, tokens))
  }
  return (
    parseColor(role === "stroke" ? tokens.borderBase : tokens.textBase) ??
    fromOklch(adaptChromaticColor(oklch, role))
  )
}

function compositeColor(color: ParsedColor, background: ParsedColor): ParsedColor {
  const blend = (front: number, back: number) =>
    Math.round(front * color.alpha + back * (1 - color.alpha))
  return {
    alpha: 1,
    red: blend(color.red, background.red),
    green: blend(color.green, background.green),
    blue: blend(color.blue, background.blue),
  }
}

function channelHeadroom(base: number, offset: number): number {
  if (offset > 0) {
    return (MAX_CHANNEL - base) / offset
  }
  return offset < 0 ? base / -offset : Number.POSITIVE_INFINITY
}

function solveTranslucentColor(
  target: ParsedColor,
  canvas: ParsedColor,
  alpha: number,
): ParsedColor {
  const offsets = {
    red: (target.red - canvas.red) / alpha,
    green: (target.green - canvas.green) / alpha,
    blue: (target.blue - canvas.blue) / alpha,
  }
  const scale = Math.min(
    1,
    channelHeadroom(canvas.red, offsets.red),
    channelHeadroom(canvas.green, offsets.green),
    channelHeadroom(canvas.blue, offsets.blue),
  )
  return {
    alpha,
    red: Math.round(canvas.red + offsets.red * scale),
    green: Math.round(canvas.green + offsets.green * scale),
    blue: Math.round(canvas.blue + offsets.blue * scale),
  }
}

function adaptColor(
  value: string,
  role: MermaidColorRole,
  context: MermaidColorContext,
): ParsedColor | undefined {
  const color = resolveColor(value)
  if (!color || color.alpha === 0) {
    return undefined
  }
  if (color.alpha === 1) {
    return adaptOpaqueColor(color, role, context.tokens)
  }
  const target = adaptOpaqueColor(compositeColor(color, LIGHT_CANVAS), role, context.tokens)
  return target && solveTranslucentColor(target, context.canvas, color.alpha)
}

function formatHexColor(color: ParsedColor): string {
  const channels = [color.red, color.green, color.blue]
  if (color.alpha < 1) {
    channels.push(Math.round(color.alpha * MAX_CHANNEL))
  }
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`
}

function formatRgbColor(color: ParsedColor): string {
  const channels = `${color.red}, ${color.green}, ${color.blue}`
  return color.alpha < 1 ? `rgba(${channels}, ${color.alpha})` : `rgb(${channels})`
}

function roleForProperty(property: string): MermaidColorRole {
  const normalized = property.toLowerCase()
  if (normalized === "stroke") {
    return "stroke"
  }
  return normalized === "color" ? "text" : "fill"
}

function adaptStyleLine(line: string, context: MermaidColorContext): string {
  return line.replace(
    STYLE_COLOR_PATTERN,
    (match, prefix: string, property: string, separator: string, value: string) => {
      const adapted = adaptColor(value, roleForProperty(property), context)
      return adapted ? `${prefix}${property}${separator}${formatHexColor(adapted)}` : match
    },
  )
}

function adaptSequenceRectLine(line: string, context: MermaidColorContext): string {
  const match = line.match(SEQUENCE_RECT_PATTERN)
  const adapted = match?.[2] ? adaptColor(match[2], "fill", context) : undefined
  return match && adapted ? `${match[1]}${formatRgbColor(adapted)}` : line
}

export function adaptMermaidSourceColors(source: string, theme: MermaidThemeConfig): string {
  const canvas = parseColor(theme.backgroundColor)
  if (!canvas || toOklch(canvas).l >= DARK_BACKGROUND_MAX_LIGHTNESS) {
    return source
  }
  const context: MermaidColorContext = { canvas, tokens: theme.tokens }
  const isSequenceDiagram = SEQUENCE_DIAGRAM_PATTERN.test(source)
  return source
    .split("\n")
    .map((line) => {
      if (STYLE_LINE_PATTERN.test(line)) {
        return adaptStyleLine(line, context)
      }
      return isSequenceDiagram ? adaptSequenceRectLine(line, context) : line
    })
    .join("\n")
}
