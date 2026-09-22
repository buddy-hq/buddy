import { parseColor, type ParsedColor } from "./color"

type MermaidContrastAdjustment = {
  selector: string
  property: "fill" | "color" | "stroke"
  from: string
  to: string
  reason: string
}

type NormalizeMermaidSvgContrastInput = {
  backgroundColor: string
  candidateTextColors: string[]
  svg: string
  textFallbackColor: string
}

type StylesheetRule = {
  declarations: Map<string, string>
  selector: string
}

const CONTRAST_THRESHOLD = 4.5
const TARGET_GROUP_SELECTORS = [
  "g.node",
  "g.cluster",
  "g.edgeLabel",
  "g.label",
  "g.note",
  "g.actor",
] as const
const NODE_GEOMETRY_SELECTORS = "rect, polygon, circle, ellipse, path"
const TEXT_CLASS_MATCHERS = ["nodeLabel", "edgeLabel", "label", "actor", "noteText", "messageText"]

function parseStyleDeclaration(style: string): Map<string, string> {
  const declarations = new Map<string, string>()
  for (const chunk of style.split(";")) {
    const separatorIndex = chunk.indexOf(":")
    if (separatorIndex <= 0) {
      continue
    }
    const property = chunk.slice(0, separatorIndex).trim().toLowerCase()
    const value = chunk
      .slice(separatorIndex + 1)
      .trim()
      .replace(/\s*!important\s*$/iu, "")
    if (!property || !value) {
      continue
    }
    declarations.set(property, value)
  }
  return declarations
}

function readStyleProperty(element: Element, property: string): string | undefined {
  const style = element.getAttribute("style")
  if (!style) {
    return undefined
  }
  return parseStyleDeclaration(style).get(property)
}

function writeStyleProperty(
  element: Element,
  property: "color" | "fill" | "stroke",
  value: string,
): void {
  const declarations = parseStyleDeclaration(element.getAttribute("style") ?? "")
  declarations.set(property, value)
  element.setAttribute(
    "style",
    Array.from(declarations.entries())
      .map(([name, propertyValue]) => `${name}: ${propertyValue}`)
      .join("; "),
  )
}

function parseStylesheetRules(root: SVGSVGElement): StylesheetRule[] {
  const rules: StylesheetRule[] = []
  for (const styleElement of Array.from(root.querySelectorAll("style"))) {
    const stylesheet = styleElement.textContent ?? ""
    const ruleMatches = stylesheet.matchAll(/([^{}]+)\{([^{}]+)\}/gu)
    for (const match of ruleMatches) {
      const selectorText = match[1]?.trim()
      const declarationText = match[2]?.trim()
      if (!selectorText || !declarationText) {
        continue
      }
      const declarations = parseStyleDeclaration(declarationText)
      if (declarations.size === 0) {
        continue
      }
      for (const selector of selectorText.split(",")) {
        const trimmedSelector = selector.trim()
        if (trimmedSelector) {
          rules.push({ declarations, selector: trimmedSelector })
        }
      }
    }
  }
  return rules
}

function elementMatchesSelector(element: Element, selector: string): boolean {
  try {
    return element.matches(selector)
  } catch {
    return false
  }
}

function readStylesheetProperty(
  element: Element,
  property: "color" | "fill" | "stroke",
  rules: StylesheetRule[],
): string | undefined {
  let value: string | undefined
  for (const rule of rules) {
    if (!elementMatchesSelector(element, rule.selector)) {
      continue
    }
    value = rule.declarations.get(property) ?? value
  }
  return value
}

function blendColor(foreground: ParsedColor, background: ParsedColor): ParsedColor {
  if (foreground.alpha >= 1) {
    return foreground
  }
  const alpha = foreground.alpha
  const inverseAlpha = 1 - alpha
  return {
    alpha: 1,
    red: Math.round(foreground.red * alpha + background.red * inverseAlpha),
    green: Math.round(foreground.green * alpha + background.green * inverseAlpha),
    blue: Math.round(foreground.blue * alpha + background.blue * inverseAlpha),
  }
}

function relativeLuminance(input: ParsedColor): number {
  const channels = [input.red, input.green, input.blue].map((channel) => {
    const normalized = channel / 255
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
  })
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}

function contrastRatio(foreground: ParsedColor, background: ParsedColor): number {
  const adjustedForeground = foreground.alpha < 1 ? blendColor(foreground, background) : foreground
  const foregroundLum = relativeLuminance(adjustedForeground)
  const backgroundLum = relativeLuminance(background)
  const lighter = Math.max(foregroundLum, backgroundLum)
  const darker = Math.min(foregroundLum, backgroundLum)
  return (lighter + 0.05) / (darker + 0.05)
}

function collectTargetGroups(root: SVGSVGElement): Set<Element> {
  const groups = new Set<Element>()
  for (const selector of TARGET_GROUP_SELECTORS) {
    for (const element of Array.from(root.querySelectorAll(selector))) {
      groups.add(element)
    }
  }
  const classMatches = Array.from(root.querySelectorAll("[class]")).filter((element) => {
    const className = element.getAttribute("class") ?? ""
    return TEXT_CLASS_MATCHERS.some((matcher) => className.includes(matcher))
  })
  for (const match of classMatches) {
    const group = match.closest("g") ?? match
    groups.add(group)
  }
  return groups
}

function isForeignObjectDescendant(element: Element): boolean {
  let current: Element | null = element
  while (current) {
    if (current.tagName.toLowerCase() === "foreignobject") {
      return true
    }
    current = current.parentElement
  }
  return false
}

function resolveElementProperty(
  element: Element,
  property: "color" | "fill" | "stroke",
  rules: StylesheetRule[],
): string | undefined {
  return (
    readStyleProperty(element, property) ??
    readStylesheetProperty(element, property, rules) ??
    element.getAttribute(property) ??
    undefined
  )
}

function resolveGroupFill(group: Element, rules: StylesheetRule[]): ParsedColor | undefined {
  for (const element of Array.from(group.querySelectorAll(NODE_GEOMETRY_SELECTORS))) {
    const parsed = parseColor(resolveElementProperty(element, "fill", rules))
    if (parsed && parsed.alpha > 0) {
      return parsed
    }
  }
  return undefined
}

function resolveEnclosingBackground(
  element: Element,
  groups: Set<Element>,
  fallback: ParsedColor,
  rules: StylesheetRule[],
): ParsedColor {
  for (let current = element.parentElement; current; current = current.parentElement) {
    const fill = groups.has(current) ? resolveGroupFill(current, rules) : undefined
    if (fill) {
      return fill
    }
  }
  return fallback
}

function resolveTextElements(group: Element): Element[] {
  const elements = new Set<Element>()
  for (const element of Array.from(group.querySelectorAll("text, tspan"))) {
    elements.add(element)
  }
  for (const element of Array.from(group.querySelectorAll("foreignObject *"))) {
    if ((element.textContent ?? "").trim().length > 0) {
      elements.add(element)
    }
  }
  return Array.from(elements)
}

function resolveCurrentTextColor(
  element: Element,
  fallback: string,
  rules: StylesheetRule[],
): string {
  return (
    readStyleProperty(element, "fill") ??
    readStylesheetProperty(element, "fill", rules) ??
    readStyleProperty(element, "color") ??
    readStylesheetProperty(element, "color", rules) ??
    element.getAttribute("fill") ??
    fallback
  )
}

function pickReadableTextColor(
  background: ParsedColor,
  candidates: string[],
): { color: string; ratio: number } | undefined {
  let best: { color: string; ratio: number } | undefined
  for (const candidate of candidates) {
    const parsed = parseColor(candidate)
    if (!parsed) {
      continue
    }
    const ratio = contrastRatio(parsed, background)
    if (!best || ratio > best.ratio) {
      best = { color: candidate, ratio }
    }
  }
  return best
}

function serializeSvg(root: SVGSVGElement): string {
  return new XMLSerializer().serializeToString(root)
}

export function normalizeMermaidSvgContrast(input: NormalizeMermaidSvgContrastInput) {
  if (!("DOMParser" in globalThis) || !("XMLSerializer" in globalThis)) {
    return {
      contrastAdjustments: [],
      svg: input.svg,
    }
  }

  const document = new DOMParser().parseFromString(input.svg, "image/svg+xml")
  const root = document.documentElement
  if (!(root instanceof SVGSVGElement)) {
    return {
      contrastAdjustments: [],
      svg: input.svg,
    }
  }

  const fallbackBackground = parseColor(input.backgroundColor) ?? {
    alpha: 1,
    red: 255,
    green: 255,
    blue: 255,
  }
  const fallbackTextColor = input.textFallbackColor
  const adjustments: MermaidContrastAdjustment[] = []
  const stylesheetRules = parseStylesheetRules(root)
  let adjustmentIndex = 0

  const targetGroups = collectTargetGroups(root)
  const textElements = new Set(Array.from(targetGroups).flatMap(resolveTextElements))

  for (const element of textElements) {
    const background = resolveEnclosingBackground(
      element,
      targetGroups,
      fallbackBackground,
      stylesheetRules,
    )
    const currentColorValue = resolveCurrentTextColor(element, fallbackTextColor, stylesheetRules)
    const parsedCurrent = parseColor(currentColorValue) ?? parseColor(fallbackTextColor)
    if (!parsedCurrent) {
      continue
    }
    const ratio = contrastRatio(parsedCurrent, background)
    if (ratio >= CONTRAST_THRESHOLD) {
      continue
    }
    const best = pickReadableTextColor(background, input.candidateTextColors)
    if (!best || best.color.trim().toLowerCase() === currentColorValue.trim().toLowerCase()) {
      continue
    }
    adjustmentIndex += 1
    const selector = `[data-buddy-contrast-index="${adjustmentIndex}"]`
    element.setAttribute("data-buddy-contrast-index", String(adjustmentIndex))
    element.setAttribute("data-buddy-contrast-adjusted", "true")
    if (isForeignObjectDescendant(element)) {
      writeStyleProperty(element, "color", best.color)
      adjustments.push({
        selector,
        property: "color",
        from: currentColorValue,
        to: best.color,
        reason: `Contrast ratio ${ratio.toFixed(2)} was below ${CONTRAST_THRESHOLD}.`,
      })
    } else {
      element.setAttribute("fill", best.color)
      writeStyleProperty(element, "fill", best.color)
      adjustments.push({
        selector,
        property: "fill",
        from: currentColorValue,
        to: best.color,
        reason: `Contrast ratio ${ratio.toFixed(2)} was below ${CONTRAST_THRESHOLD}.`,
      })
    }
  }

  return {
    contrastAdjustments: adjustments,
    svg: serializeSvg(root),
  }
}

export type { MermaidContrastAdjustment, NormalizeMermaidSvgContrastInput }
