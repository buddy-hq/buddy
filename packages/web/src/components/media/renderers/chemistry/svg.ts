import { sanitizeGeneratedSvg } from "@/components/media/renderers/generated-svg-sanitize"

const SVG_ROOT_PATTERN = /^<svg(?:\s|>)/iu
const CHEMISTRY_UNSAFE_ELEMENT_NAMES = [
  "a",
  "animate",
  "animateMotion",
  "animateTransform",
  "feImage",
  "foreignObject",
  "image",
  "link",
  "set",
  "style",
] as const
const CHEMISTRY_BLOCKED_RESOURCE_ATTRIBUTE_NAMES: ReadonlySet<string> = new Set([
  "data",
  "poster",
  "src",
])
const CHEMISTRY_FRAGMENT_REFERENCE_ATTRIBUTE_NAMES: ReadonlySet<string> = new Set([
  "href",
  "xlink:href",
])
const SVG_ATTRIBUTE_PATTERN = /\s+([A-Za-z_][\w:.-]*)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gu
const CSS_URL_PATTERN = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/giu
const CSS_FRAGMENT_URL_PATTERN = /url\(\s*(['"]?)#([A-Za-z_][\w:.-]*)\1\s*\)/giu
const SAFE_FRAGMENT_REFERENCE_PATTERN = /^#[A-Za-z_][\w:.-]*$/u
const XML_DECLARATION_PATTERN = /^\s*<\?xml\b[\s\S]*?\?>\s*/iu
const THEME_FOREGROUND_COLORS = new Set([
  "#000",
  "#000000",
  "#000000ff",
  "black",
  "rgb(0,0,0)",
  "rgb(0, 0, 0)",
  "rgb(0 0 0)",
  "rgb(0%,0%,0%)",
  "rgb(0%, 0%, 0%)",
  "rgb(0% 0% 0%)",
])
const BLACK_STYLE_COLOR_PATTERN =
  /#000000ff|#000000|#000(?![\da-f])|rgb\(\s*0(?:\s*,\s*|\s+)0(?:\s*,\s*|\s+)0\s*\)|rgb\(\s*0%\s*(?:,\s*|\s+)0%\s*(?:,\s*|\s+)0%\s*\)|\bblack\b/giu

function normalizeThemeColor(value: string): string {
  return THEME_FOREGROUND_COLORS.has(value.trim().toLowerCase()) ? "currentColor" : value
}

function stripUnsafeChemistryElements(svg: string): string {
  let stripped = svg
  for (const name of CHEMISTRY_UNSAFE_ELEMENT_NAMES) {
    stripped = stripped.replace(
      new RegExp(`<${name}\\b[^>]*>[\\s\\S]*?<\\/${name}\\s*>`, "giu"),
      "",
    )
    stripped = stripped.replace(new RegExp(`<${name}\\b[^>]*/>`, "giu"), "")
  }
  return stripped
}

function hasExternalCssUrl(value: string): boolean {
  for (const match of value.matchAll(CSS_URL_PATTERN)) {
    const reference = (match[1] ?? match[2] ?? match[3] ?? "").trim()
    if (!reference.startsWith("#")) {
      return true
    }
  }
  return false
}

function shouldStripResourceAttribute(name: string, value: string): boolean {
  if (CHEMISTRY_BLOCKED_RESOURCE_ATTRIBUTE_NAMES.has(name)) {
    return true
  }
  if (CHEMISTRY_FRAGMENT_REFERENCE_ATTRIBUTE_NAMES.has(name)) {
    return !SAFE_FRAGMENT_REFERENCE_PATTERN.test(value.trim())
  }
  return hasExternalCssUrl(value)
}

function hasMissingLocalCssReference(value: string, localIDs: ReadonlySet<string>): boolean {
  for (const match of value.matchAll(CSS_FRAGMENT_URL_PATTERN)) {
    const id = match[2]
    if (id && !localIDs.has(id)) return true
  }
  return false
}

function stripUnsafeChemistryAttributes(svg: string): string {
  return svg.replace(/<([A-Za-z_][\w:.-]*)(\s[^<>]*?)?(\/?)>/gu, (fullMatch: string) => {
    if (fullMatch.startsWith("</")) {
      return fullMatch
    }
    return fullMatch.replace(
      SVG_ATTRIBUTE_PATTERN,
      (attribute: string, rawName: string, rawValue: string) => {
        const name = rawName.toLowerCase()
        const value = rawValue.replace(/^['"]|['"]$/gu, "")
        if (shouldStripResourceAttribute(name, value)) {
          return ""
        }
        return attribute
      },
    )
  })
}

export function prepareChemistrySvg(rawSvg: string): string {
  const sanitized = stripUnsafeChemistryAttributes(
    sanitizeGeneratedSvg(stripUnsafeChemistryElements(rawSvg.replace(XML_DECLARATION_PATTERN, ""))),
  ).trim()
  if (!SVG_ROOT_PATTERN.test(sanitized)) {
    throw new Error("Chemistry renderer returned an invalid SVG document.")
  }
  if (!("DOMParser" in globalThis) || !("XMLSerializer" in globalThis)) {
    return sanitized
  }

  const document = new DOMParser().parseFromString(sanitized, "image/svg+xml")
  const root = document.documentElement
  if (root.localName.toLowerCase() !== "svg") {
    throw new Error("Chemistry renderer returned an invalid SVG document.")
  }

  root.setAttribute(
    "preserveAspectRatio",
    root.getAttribute("preserveAspectRatio") ?? "xMidYMid meet",
  )
  root.setAttribute("color", "currentColor")
  root.setAttribute("fill", normalizeThemeColor(root.getAttribute("fill") ?? "currentColor"))
  const localIDs = new Set(
    [root, ...Array.from(root.querySelectorAll("[id]"))].flatMap((element) => {
      const id = element.getAttribute("id")
      return id ? [id] : []
    }),
  )
  for (const element of Array.from(
    root.querySelectorAll(CHEMISTRY_UNSAFE_ELEMENT_NAMES.join(",")),
  )) {
    element.remove()
  }
  for (const element of [root, ...Array.from(root.querySelectorAll("*"))]) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase()
      if (
        shouldStripResourceAttribute(name, attribute.value) ||
        hasMissingLocalCssReference(attribute.value, localIDs) ||
        (CHEMISTRY_FRAGMENT_REFERENCE_ATTRIBUTE_NAMES.has(name) &&
          !localIDs.has(attribute.value.trim().slice(1)))
      ) {
        element.removeAttribute(attribute.name)
      }
    }
    for (const attributeName of ["color", "fill", "stroke", "stop-color"] as const) {
      const value = element.getAttribute(attributeName)
      if (value !== null) {
        element.setAttribute(attributeName, normalizeThemeColor(value))
      }
    }
    const style = element.getAttribute("style")
    if (style) {
      element.setAttribute("style", style.replace(BLACK_STYLE_COLOR_PATTERN, "currentColor"))
    }
  }

  return new XMLSerializer().serializeToString(root).trim()
}

export function scopeChemistrySvgIDs(svg: string, rawPrefix: string): string {
  if (!("DOMParser" in globalThis) || !("XMLSerializer" in globalThis)) {
    return svg
  }
  const document = new DOMParser().parseFromString(svg, "image/svg+xml")
  const root = document.documentElement
  if (root.localName.toLowerCase() !== "svg") {
    throw new Error("Chemistry renderer returned an invalid SVG document.")
  }

  const prefix = rawPrefix.replace(/[^A-Za-z0-9_.-]/gu, "_") || "chemistry"
  const scopedIDs = new Map<string, string>()
  let idIndex = 0
  for (const element of [root, ...Array.from(root.querySelectorAll("[id]"))]) {
    const id = element.getAttribute("id")
    if (!id) continue
    const existing = scopedIDs.get(id)
    if (existing) {
      element.removeAttribute("id")
      continue
    }
    const scopedID = `${prefix}-${idIndex}`
    idIndex += 1
    scopedIDs.set(id, scopedID)
    element.setAttribute("id", scopedID)
  }

  for (const element of [root, ...Array.from(root.querySelectorAll("*"))]) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase()
      if (CHEMISTRY_FRAGMENT_REFERENCE_ATTRIBUTE_NAMES.has(name)) {
        const value = attribute.value.trim()
        const scopedID = value.startsWith("#") ? scopedIDs.get(value.slice(1)) : undefined
        if (scopedID) {
          element.setAttribute(attribute.name, `#${scopedID}`)
        } else {
          element.removeAttribute(attribute.name)
        }
        continue
      }
      const scopedValue = attribute.value.replace(
        CSS_FRAGMENT_URL_PATTERN,
        (match: string, _quote: string, id: string) => {
          const scopedID = scopedIDs.get(id)
          return scopedID ? `url(#${scopedID})` : match
        },
      )
      if (scopedValue !== attribute.value) {
        element.setAttribute(attribute.name, scopedValue)
      }
    }
  }

  return new XMLSerializer().serializeToString(root).trim()
}
