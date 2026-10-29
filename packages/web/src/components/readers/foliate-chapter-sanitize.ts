import createDOMPurify, { type DOMPurify } from "dompurify"

const XHTML_NAMESPACE = "http://www.w3.org/1999/xhtml"
const SVG_NAMESPACE = "http://www.w3.org/2000/svg"
const MATHML_NAMESPACE = "http://www.w3.org/1998/Math/MathML"
const CHAPTER_CSP = "script-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'"
const BLOB_URL = /^blob:/iu
const SVG_PAGE_STYLE = "margin:0;width:100vw;height:100vh;overflow:hidden"
const SVG_PIXELS_PER_UNIT = new Map([
  ["", 1],
  ["px", 1],
  ["in", 96],
  ["cm", 96 / 2.54],
  ["mm", 96 / 25.4],
  ["q", 96 / 101.6],
  ["pt", 96 / 72],
  ["pc", 96 / 6],
])
const SVG_CASED_TAGS = [
  "altGlyph",
  "altGlyphDef",
  "altGlyphItem",
  "animateColor",
  "animateMotion",
  "animateTransform",
  "clipPath",
  "feBlend",
  "feColorMatrix",
  "feComponentTransfer",
  "feComposite",
  "feConvolveMatrix",
  "feDiffuseLighting",
  "feDisplacementMap",
  "feDistantLight",
  "feDropShadow",
  "feFlood",
  "feFuncA",
  "feFuncB",
  "feFuncG",
  "feFuncR",
  "feGaussianBlur",
  "feImage",
  "feMerge",
  "feMergeNode",
  "feMorphology",
  "feOffset",
  "fePointLight",
  "feSpecularLighting",
  "feSpotLight",
  "feTile",
  "feTurbulence",
  "foreignObject",
  "glyphRef",
  "linearGradient",
  "radialGradient",
  "textPath",
]
const SVG_CASED_ATTRIBUTES = [
  "attributeName",
  "attributeType",
  "baseFrequency",
  "baseProfile",
  "calcMode",
  "clipPathUnits",
  "diffuseConstant",
  "edgeMode",
  "filterUnits",
  "glyphRef",
  "gradientTransform",
  "gradientUnits",
  "kernelMatrix",
  "kernelUnitLength",
  "keyPoints",
  "keySplines",
  "keyTimes",
  "lengthAdjust",
  "limitingConeAngle",
  "markerHeight",
  "markerUnits",
  "markerWidth",
  "maskContentUnits",
  "maskUnits",
  "numOctaves",
  "pathLength",
  "patternContentUnits",
  "patternTransform",
  "patternUnits",
  "pointsAtX",
  "pointsAtY",
  "pointsAtZ",
  "preserveAlpha",
  "preserveAspectRatio",
  "primitiveUnits",
  "refX",
  "refY",
  "repeatCount",
  "repeatDur",
  "requiredExtensions",
  "requiredFeatures",
  "specularConstant",
  "specularExponent",
  "spreadMethod",
  "startOffset",
  "stdDeviation",
  "stitchTiles",
  "surfaceScale",
  "systemLanguage",
  "tableValues",
  "targetX",
  "targetY",
  "textLength",
  "viewBox",
  "viewTarget",
  "xChannelSelector",
  "yChannelSelector",
  "zoomAndPan",
]
const MATHML_CASED_ATTRIBUTES = ["definitionURL"]

type CasedNames = {
  tags: string[]
  attributes: string[]
}

let casedNames: CasedNames | undefined

function domPurifyCasedNames(): CasedNames {
  if (casedNames) return casedNames
  const allowedTags = new Set<string>()
  const allowedAttributes = new Set<string>()
  const probe = createDOMPurify(window)
  probe.addHook("uponSanitizeElement", (_node, element) => {
    for (const [name, allowed] of Object.entries(element.allowedTags))
      if (allowed) allowedTags.add(name)
  })
  probe.addHook("uponSanitizeAttribute", (_node, attribute) => {
    for (const [name, allowed] of Object.entries(attribute.allowedAttributes))
      if (allowed) allowedAttributes.add(name)
  })
  probe.sanitize('<p title="probe"></p>')
  casedNames = {
    tags: SVG_CASED_TAGS.filter((name) => allowedTags.has(name.toLowerCase())),
    attributes: [...SVG_CASED_ATTRIBUTES, ...MATHML_CASED_ATTRIBUTES].filter((name) =>
      allowedAttributes.has(name.toLowerCase()),
    ),
  }
  return casedNames
}

export function emptyFoliateChapter(): string {
  return `<html xmlns="${XHTML_NAMESPACE}"><head><meta http-equiv="Content-Security-Policy" content="${CHAPTER_CSP}"/></head><body/></html>`
}

function isBookStylesheet(element: Element): boolean {
  if (element.getAttribute("rel")?.trim().toLowerCase() !== "stylesheet") return false
  const href = element
    .getAttribute("href")
    ?.trim()
    .replace(/[\s\p{Cc}]/gu, "")
  return Boolean(
    href &&
    !href.startsWith("//") &&
    (!/^[a-z][a-z\d+.-]*:/iu.test(href) || href.startsWith("blob:")),
  )
}

function createBookPurifier(): DOMPurify | undefined {
  const purifier = createDOMPurify(window)
  if (!purifier.isSupported) return undefined
  purifier.addHook("uponSanitizeElement", (node) => {
    if (!(node instanceof Element)) return
    if (node.localName === "link" && !isBookStylesheet(node)) node.remove()
    if (node.localName === "meta" && node.getAttribute("name") !== "viewport") node.remove()
    if (node.localName === "foreignObject" && node.namespaceURI === SVG_NAMESPACE)
      node.replaceChildren()
    if (node.localName === "annotation" && node.namespaceURI === MATHML_NAMESPACE)
      node.replaceChildren(node.textContent ?? "")
  })
  purifier.addHook("uponSanitizeAttribute", (node, attribute) => {
    if (attribute.attrName === "attributeName" && attribute.attrValue.includes("href")) {
      attribute.keepAttr = false
      return
    }
    if (
      node.localName === "meta" &&
      attribute.attrName !== "name" &&
      attribute.attrName !== "content"
    ) {
      attribute.keepAttr = false
      return
    }
    if (BLOB_URL.test(attribute.attrValue) && attribute.allowedAttributes[attribute.attrName])
      attribute.forceKeepAttr = true
  })
  return purifier
}

export function sanitizeFoliateChapter(source: string, type: string): string {
  const parserType = type.split(";", 1)[0]?.trim().toLowerCase()
  if (parserType !== "text/html" && parserType !== "application/xhtml+xml")
    return emptyFoliateChapter()
  const parser = new DOMParser()
  const doc = parser.parseFromString(source, parserType)
  const root = doc.documentElement
  if (
    !root ||
    doc.querySelector("parsererror") ||
    root.localName !== "html" ||
    root.namespaceURI !== XHTML_NAMESPACE
  )
    return emptyFoliateChapter()
  const purifier = createBookPurifier()
  if (!purifier) return emptyFoliateChapter()
  const cased = domPurifyCasedNames()
  purifier.sanitize(root, {
    WHOLE_DOCUMENT: true,
    IN_PLACE: true,
    PARSER_MEDIA_TYPE: parserType,
    ADD_TAGS: ["link", "meta", "semantics", "annotation", ...cased.tags],
    ADD_ATTR: [
      "epub:type",
      "epub:prefix",
      "xmlns:epub",
      "content",
      "xml:lang",
      ...cased.attributes,
    ],
  })
  let head = Array.from(root.children).find(
    (child) => child.localName === "head" && child.namespaceURI === XHTML_NAMESPACE,
  )
  if (!head) {
    head = doc.createElementNS(XHTML_NAMESPACE, "head")
    root.insertBefore(head, root.firstChild)
  }
  const meta = doc.createElementNS(XHTML_NAMESPACE, "meta")
  meta.setAttribute("http-equiv", "Content-Security-Policy")
  meta.setAttribute("content", CHAPTER_CSP)
  head.insertBefore(meta, head.firstChild)
  const markup = new XMLSerializer().serializeToString(root)
  return parserType === "text/html" ? `<!DOCTYPE html>${markup}` : markup
}

function cleanSvg(source: string): Element | undefined {
  const root = new DOMParser().parseFromString(source, "image/svg+xml").documentElement
  if (!root || root.localName !== "svg" || root.namespaceURI !== SVG_NAMESPACE) return undefined
  const purifier = createBookPurifier()
  if (!purifier) return undefined
  const cased = domPurifyCasedNames()
  purifier.sanitize(root, {
    IN_PLACE: true,
    USE_PROFILES: { svg: true, svgFilters: true },
    NAMESPACE: SVG_NAMESPACE,
    PARSER_MEDIA_TYPE: "application/xhtml+xml",
    ADD_TAGS: cased.tags,
    ADD_ATTR: cased.attributes,
  })
  return root
}

export function sanitizeFoliateSvg(source: string): string {
  const svg = cleanSvg(source)
  return svg ? new XMLSerializer().serializeToString(svg) : ""
}

function svgPixelLength(value: string | null): number | undefined {
  const [, number, unit = ""] =
    value?.trim().match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(px|in|cm|mm|q|pt|pc)?$/iu) ?? []
  const scale = SVG_PIXELS_PER_UNIT.get(unit.toLowerCase())
  if (number === undefined || scale === undefined) return undefined
  const pixels = Number(number) * scale
  return pixels > 0 && Number.isFinite(pixels) ? Math.round(pixels) : undefined
}

function svgPageSize(svg: Element): { width: number; height: number } | undefined {
  const pixelWidth = svgPixelLength(svg.getAttribute("width"))
  const pixelHeight = svgPixelLength(svg.getAttribute("height"))
  if (pixelWidth !== undefined && pixelHeight !== undefined)
    return { width: pixelWidth, height: pixelHeight }
  const [, , width, height] =
    svg
      .getAttribute("viewBox")
      ?.trim()
      .split(/[\s,]+/u)
      .map(Number) ?? []
  if (width === undefined || height === undefined) return undefined
  if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height)))
    return undefined
  return { width, height }
}

export function sanitizeFoliateSvgPage(source: string): string {
  const svg = cleanSvg(source)
  if (!svg) return emptyFoliateChapter()
  const doc = new DOMParser().parseFromString(emptyFoliateChapter(), "application/xhtml+xml")
  const head = doc.querySelector("head")
  const body = doc.querySelector("body")
  if (!head || !body) return emptyFoliateChapter()
  const size = svgPageSize(svg)
  if (size) {
    const meta = doc.createElementNS(XHTML_NAMESPACE, "meta")
    meta.setAttribute("name", "viewport")
    meta.setAttribute("content", `width=${size.width},height=${size.height}`)
    head.append(meta)
    svg.setAttribute("width", `${size.width}px`)
    svg.setAttribute("height", `${size.height}px`)
  }
  body.setAttribute("style", SVG_PAGE_STYLE)
  body.append(doc.importNode(svg, true))
  return new XMLSerializer().serializeToString(doc.documentElement)
}
