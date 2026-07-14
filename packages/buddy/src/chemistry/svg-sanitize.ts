import { XMLParser, XMLValidator } from "fast-xml-parser"
import { ChemistryRenderError } from "./errors"
import { CHEMISTRY_SVG_MAX_BYTES } from "./limits"

const CHEMISTRY_SVG_MAX_INPUT_BYTES = CHEMISTRY_SVG_MAX_BYTES
const CHEMISTRY_SVG_MAX_NODES = 50_000
const CHEMISTRY_SVG_MAX_ATTRIBUTES = 200_000
const CHEMISTRY_SVG_MAX_DEPTH = 128
const CHEMISTRY_SVG_MAX_TEXT_BYTES = 2 * 1024 * 1024
const XML_FIRST_CONTROL_CODE_POINT = 0
const XML_FIRST_CONTROL_RANGE_END = 8
const XML_SECOND_CONTROL_RANGE_START = 14
const XML_SECOND_CONTROL_RANGE_END = 31
const XML_VERTICAL_TAB_CODE_POINT = 11
const XML_FORM_FEED_CODE_POINT = 12
const XML_DELETE_CODE_POINT = 127
const SVG_NAMESPACE = "http://www.w3.org/2000/svg"
const XLINK_NAMESPACE = "http://www.w3.org/1999/xlink"
const XML_DECLARATION_PATTERN = /^\s*<\?xml\s[^?]*\?>\s*/iu
const XML_DOCUMENT_DIRECTIVE_PATTERN = /<!\s*(?:DOCTYPE|ENTITY)\b/iu
const XML_PROCESSING_INSTRUCTION_PATTERN = /<\?/u
const SAFE_ID_PATTERN = /^[A-Za-z_][\w:.-]*$/u
const SAFE_FRAGMENT_REFERENCE_PATTERN = /^#[A-Za-z_][\w:.-]*$/u
const SAFE_FRAGMENT_URL_PATTERN = /^url\(\s*#([A-Za-z_][\w:.-]*)\s*\)$/iu
const UNSAFE_ATTRIBUTE_VALUE_PATTERN = /(?:javascript\s*:|data\s*:|vbscript\s*:)/iu

const SAFE_SVG_ELEMENTS = new Set([
  "svg",
  "g",
  "defs",
  "path",
  "use",
  "symbol",
  "clipPath",
  "mask",
  "pattern",
  "marker",
  "line",
  "polyline",
  "polygon",
  "rect",
  "circle",
  "ellipse",
  "text",
  "tspan",
  "title",
  "desc",
  "linearGradient",
  "radialGradient",
  "stop",
])

const SAFE_SVG_ATTRIBUTES = new Set([
  "id",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "fx",
  "fy",
  "fr",
  "width",
  "height",
  "viewBox",
  "preserveAspectRatio",
  "transform",
  "d",
  "pathLength",
  "points",
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-dasharray",
  "stroke-dashoffset",
  "opacity",
  "clip-path",
  "clip-rule",
  "mask",
  "marker-start",
  "marker-mid",
  "marker-end",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "text-anchor",
  "dominant-baseline",
  "xml:space",
  "href",
  "xlink:href",
  "offset",
  "stop-color",
  "stop-opacity",
  "gradientUnits",
  "gradientTransform",
  "spreadMethod",
  "patternUnits",
  "patternContentUnits",
  "patternTransform",
  "markerWidth",
  "markerHeight",
  "markerUnits",
  "refX",
  "refY",
  "orient",
  "role",
  "aria-label",
  "aria-hidden",
  "focusable",
])

const LOCAL_URL_ATTRIBUTES = new Set([
  "fill",
  "stroke",
  "clip-path",
  "mask",
  "marker-start",
  "marker-mid",
  "marker-end",
])

const SVG_XML_PARSER = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "",
  allowBooleanAttributes: false,
  processEntities: true,
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
  maxNestedTags: CHEMISTRY_SVG_MAX_DEPTH + 1,
})

type SvgAttribute = {
  name: string
  value: string
}

type SanitizedSvgNode = {
  name: string
  attributes: SvgAttribute[]
  children: SanitizedSvgChild[]
}

type SanitizedSvgChild = SanitizedSvgNode | string

type SvgReference = {
  attributes: SvgAttribute[]
  attribute: SvgAttribute
  targetID: string
}

type SanitizerState = {
  ids: Set<string>
  references: SvgReference[]
  usesXlink: boolean
}

function invalidSvg(message: string, cause?: unknown): ChemistryRenderError {
  return new ChemistryRenderError({
    code: "chemfig_invalid_svg",
    httpStatus: 422,
    message,
    ...(cause === undefined ? {} : { cause }),
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function xmlByteLength(value: string): number {
  return Buffer.byteLength(value, "utf8")
}

function containsXmlControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0)
    if (codePoint === undefined) continue
    if (
      (codePoint >= XML_FIRST_CONTROL_CODE_POINT && codePoint <= XML_FIRST_CONTROL_RANGE_END) ||
      codePoint === XML_VERTICAL_TAB_CODE_POINT ||
      codePoint === XML_FORM_FEED_CODE_POINT
    ) {
      return true
    }
    if (
      (codePoint >= XML_SECOND_CONTROL_RANGE_START && codePoint <= XML_SECOND_CONTROL_RANGE_END) ||
      codePoint === XML_DELETE_CODE_POINT
    ) {
      return true
    }
  }
  return false
}

function validateXmlComplexity(parsed: unknown): void {
  const stack: Array<{ value: unknown; depth: number }> = [{ value: parsed, depth: 0 }]
  let nodeCount = 0
  let attributeCount = 0
  let textBytes = 0

  while (stack.length > 0) {
    const current = stack.pop()
    if (!current) break

    if (Array.isArray(current.value)) {
      for (const child of current.value) {
        stack.push({ value: child, depth: current.depth })
      }
      continue
    }
    if (!isRecord(current.value)) continue

    const attributes = current.value[":@"]
    if (isRecord(attributes)) {
      attributeCount += Object.keys(attributes).length
      if (attributeCount > CHEMISTRY_SVG_MAX_ATTRIBUTES) {
        throw invalidSvg("Chemistry renderer produced an SVG with too many attributes.")
      }
    }

    for (const [name, child] of Object.entries(current.value)) {
      if (name === ":@") continue
      if (name === "#text") {
        if (typeof child === "string") {
          textBytes += xmlByteLength(child)
          if (textBytes > CHEMISTRY_SVG_MAX_TEXT_BYTES) {
            throw invalidSvg("Chemistry renderer produced an SVG with too much text.")
          }
        }
        continue
      }

      nodeCount += 1
      const childDepth = current.depth + 1
      if (nodeCount > CHEMISTRY_SVG_MAX_NODES) {
        throw invalidSvg("Chemistry renderer produced an SVG with too many elements.")
      }
      if (childDepth > CHEMISTRY_SVG_MAX_DEPTH) {
        throw invalidSvg("Chemistry renderer produced an SVG nested too deeply.")
      }
      stack.push({ value: child, depth: childDepth })
    }
  }
}

function parsedAttributeEntries(value: unknown): Array<[string, string]> {
  if (!isRecord(value)) return []
  const entries: Array<[string, string]> = []
  for (const [name, rawValue] of Object.entries(value)) {
    if (typeof rawValue === "string") entries.push([name, rawValue])
  }
  return entries
}

function registerReference(
  state: SanitizerState,
  attributes: SvgAttribute[],
  attribute: SvgAttribute,
  targetID: string,
): void {
  state.references.push({ attributes, attribute, targetID })
}

function sanitizeSvgAttributes(
  rawAttributes: unknown,
  elementName: string,
  state: SanitizerState,
): SvgAttribute[] {
  const attributes: SvgAttribute[] = []
  for (const [name, rawValue] of parsedAttributeEntries(rawAttributes)) {
    if (!SAFE_SVG_ATTRIBUTES.has(name)) continue
    if (containsXmlControlCharacter(rawValue)) continue
    if (UNSAFE_ATTRIBUTE_VALUE_PATTERN.test(rawValue)) continue

    if (name === "id") {
      if (!SAFE_ID_PATTERN.test(rawValue) || state.ids.has(rawValue)) {
        throw invalidSvg("Chemistry renderer produced an SVG with an invalid or duplicate id.")
      }
      state.ids.add(rawValue)
    }

    if (name === "href" || name === "xlink:href") {
      if (elementName !== "use" || !SAFE_FRAGMENT_REFERENCE_PATTERN.test(rawValue)) continue
      const attribute = { name, value: rawValue }
      attributes.push(attribute)
      registerReference(state, attributes, attribute, rawValue.slice(1))
      if (name === "xlink:href") state.usesXlink = true
      continue
    }

    if (LOCAL_URL_ATTRIBUTES.has(name) && /url\s*\(/iu.test(rawValue)) {
      const match = SAFE_FRAGMENT_URL_PATTERN.exec(rawValue)
      const targetID = match?.[1]
      if (!targetID) continue
      const attribute = { name, value: `url(#${targetID})` }
      attributes.push(attribute)
      registerReference(state, attributes, attribute, targetID)
      continue
    }

    attributes.push({ name, value: rawValue })
  }
  return attributes
}

function sanitizeOrderedNode(
  value: unknown,
  state: SanitizerState,
  depth: number,
): SanitizedSvgChild | undefined {
  if (!isRecord(value)) throw invalidSvg("Chemistry renderer produced malformed SVG XML.")
  const names = Object.keys(value).filter((name) => name !== ":@")
  if (names.length !== 1) {
    throw invalidSvg("Chemistry renderer produced malformed SVG XML.")
  }

  const name = names[0]
  if (!name) throw invalidSvg("Chemistry renderer produced malformed SVG XML.")
  const rawChildren = value[name]
  if (name === "#text") {
    if (typeof rawChildren !== "string") {
      throw invalidSvg("Chemistry renderer produced malformed SVG text.")
    }
    if (containsXmlControlCharacter(rawChildren)) {
      throw invalidSvg("Chemistry renderer produced invalid SVG text.")
    }
    return rawChildren
  }

  if (!SAFE_SVG_ELEMENTS.has(name)) return undefined
  if (!Array.isArray(rawChildren)) {
    throw invalidSvg("Chemistry renderer produced malformed SVG children.")
  }
  if (depth > CHEMISTRY_SVG_MAX_DEPTH) {
    throw invalidSvg("Chemistry renderer produced an SVG nested too deeply.")
  }

  const children: SanitizedSvgChild[] = []
  for (const rawChild of rawChildren) {
    const child = sanitizeOrderedNode(rawChild, state, depth + 1)
    if (child !== undefined) children.push(child)
  }

  return {
    name,
    attributes: sanitizeSvgAttributes(value[":@"], name, state),
    children,
  }
}

function removeDanglingReferences(state: SanitizerState): void {
  for (const reference of state.references) {
    if (state.ids.has(reference.targetID)) continue
    const attributeIndex = reference.attributes.indexOf(reference.attribute)
    if (attributeIndex >= 0) reference.attributes.splice(attributeIndex, 1)
  }
}

function escapeXmlText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
}

function escapeXmlAttribute(value: string): string {
  return escapeXmlText(value).replaceAll('"', "&quot;")
}

function serializeSvgNode(node: SanitizedSvgNode): string {
  const attributes = node.attributes
    .map((attribute) => ` ${attribute.name}="${escapeXmlAttribute(attribute.value)}"`)
    .join("")
  if (node.children.length === 0) return `<${node.name}${attributes}/>`
  const children = node.children
    .map((child) => (typeof child === "string" ? escapeXmlText(child) : serializeSvgNode(child)))
    .join("")
  return `<${node.name}${attributes}>${children}</${node.name}>`
}

function sanitizeChemistrySvg(source: string): string {
  if (xmlByteLength(source) > CHEMISTRY_SVG_MAX_INPUT_BYTES) {
    throw invalidSvg("Chemistry renderer produced an SVG that exceeds the input size limit.")
  }
  if (XML_DOCUMENT_DIRECTIVE_PATTERN.test(source)) {
    throw invalidSvg("Chemistry renderer produced an SVG containing an XML document directive.")
  }

  const xml = source.replace(XML_DECLARATION_PATTERN, "")
  if (XML_PROCESSING_INSTRUCTION_PATTERN.test(xml)) {
    throw invalidSvg("Chemistry renderer produced an SVG containing a processing instruction.")
  }
  const validation = XMLValidator.validate(xml, { allowBooleanAttributes: false })
  if (validation !== true) {
    throw invalidSvg("Chemistry renderer did not produce a valid SVG document.", validation)
  }

  let parsed: unknown
  try {
    parsed = SVG_XML_PARSER.parse(xml)
  } catch (error) {
    throw invalidSvg("Chemistry renderer did not produce a valid SVG document.", error)
  }
  validateXmlComplexity(parsed)
  if (!Array.isArray(parsed)) {
    throw invalidSvg("Chemistry renderer did not produce a valid SVG document.")
  }

  const state: SanitizerState = {
    ids: new Set<string>(),
    references: [],
    usesXlink: false,
  }
  const roots: SanitizedSvgNode[] = []
  for (const rawRoot of parsed) {
    const root = sanitizeOrderedNode(rawRoot, state, 1)
    if (typeof root === "string") {
      if (root.trim().length > 0) {
        throw invalidSvg("Chemistry renderer produced text outside the SVG root.")
      }
      continue
    }
    if (root !== undefined) roots.push(root)
  }
  if (roots.length !== 1 || roots[0]?.name !== "svg") {
    throw invalidSvg("Chemistry renderer did not produce exactly one valid SVG root.")
  }

  removeDanglingReferences(state)
  const root = roots[0]
  root.attributes = root.attributes.filter(
    (attribute) => attribute.name !== "xmlns" && attribute.name !== "xmlns:xlink",
  )
  root.attributes.unshift({ name: "xmlns", value: SVG_NAMESPACE })
  if (state.usesXlink) {
    root.attributes.splice(1, 0, { name: "xmlns:xlink", value: XLINK_NAMESPACE })
  }

  const sanitized = serializeSvgNode(root)
  if (xmlByteLength(sanitized) > CHEMISTRY_SVG_MAX_INPUT_BYTES) {
    throw invalidSvg("Sanitized chemistry SVG exceeds the output size limit.")
  }
  return sanitized
}

export {
  CHEMISTRY_SVG_MAX_ATTRIBUTES,
  CHEMISTRY_SVG_MAX_DEPTH,
  CHEMISTRY_SVG_MAX_INPUT_BYTES,
  CHEMISTRY_SVG_MAX_NODES,
  sanitizeChemistrySvg,
}
