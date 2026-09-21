type ParsedColor = {
  alpha: number
  blue: number
  green: number
  red: number
}

function parseHexColor(value: string): ParsedColor | undefined {
  const match = value.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/u)
  if (!match?.[1]) {
    return undefined
  }
  const digits =
    match[1].length <= 4
      ? match[1]
          .split("")
          .map((digit) => `${digit}${digit}`)
          .join("")
      : match[1]
  const channel = (index: number) => Number.parseInt(digits.slice(index * 2, index * 2 + 2), 16)
  return {
    alpha: digits.length === 8 ? channel(3) / 255 : 1,
    red: channel(0),
    green: channel(1),
    blue: channel(2),
  }
}

function parseRgbColor(value: string): ParsedColor | undefined {
  const rgbMatch = value.match(
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(\d*\.?\d+))?\s*\)$/iu,
  )
  if (!rgbMatch) {
    return undefined
  }
  const red = Number.parseInt(rgbMatch[1] ?? "", 10)
  const green = Number.parseInt(rgbMatch[2] ?? "", 10)
  const blue = Number.parseInt(rgbMatch[3] ?? "", 10)
  const alpha = rgbMatch[4] ? Number.parseFloat(rgbMatch[4]) : 1
  if (
    [red, green, blue].some((channel) => !Number.isFinite(channel) || channel < 0 || channel > 255)
  ) {
    return undefined
  }
  if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) {
    return undefined
  }
  return {
    alpha,
    red,
    green,
    blue,
  }
}

function parseColor(value: string | undefined): ParsedColor | undefined {
  if (!value) {
    return undefined
  }
  const trimmed = value.trim().toLowerCase()
  if (trimmed === "white") {
    return { alpha: 1, red: 255, green: 255, blue: 255 }
  }
  if (trimmed === "black") {
    return { alpha: 1, red: 0, green: 0, blue: 0 }
  }
  if (trimmed === "transparent") {
    return { alpha: 0, red: 0, green: 0, blue: 0 }
  }
  return parseHexColor(trimmed) ?? parseRgbColor(trimmed)
}

export { parseColor }

export type { ParsedColor }
