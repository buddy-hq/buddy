import { fromMarkdown } from "mdast-util-from-markdown"
import { mathFromMarkdown } from "mdast-util-math"
import { math } from "micromark-extension-math"
import type { Definition, Nodes, Root } from "mdast"
import { matchBuddyBlockMath, matchBuddyInlineMath } from "@/components/markdown/markdown-math"
import { prepareObsidianCalloutsForMdxEditor } from "@/components/bench/markdown/obsidian-callouts"
import {
  rawHtmlBlockInfo,
  rawHtmlInlineCarrier,
} from "@/components/bench/markdown/plugins/raw-html-carrier"

type TMarkdownPoint = {
  line: number
  column: number
  offset?: number
}

type TMarkdownPosition = {
  start: TMarkdownPoint
  end: TMarkdownPoint
}

type MarkdownReplacement = {
  start: number
  end: number
  value: string
}

type MarkdownRange = {
  start: number
  end: number
}

const LEGACY_BUDDY_DISPLAY_MATH_MARKER = "%__BUDDY_DISPLAY_MATH__\n"
const MARKDOWN_INSERTED_ANGLE_ESCAPE_MARKER = "\u2060"
const MARKDOWN_MARKED_ESCAPED_BRACKET = `${MARKDOWN_INSERTED_ANGLE_ESCAPE_MARKER}\\[`
const MARKDOWN_MARKED_BRACKET = `${MARKDOWN_INSERTED_ANGLE_ESCAPE_MARKER}[`
const MARKDOWN_ASCII_PUNCTUATION_PATTERN = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/gu
const MARKDOWN_MARKED_COMMENT_OPEN_PATTERN = /^\\?!\\?-\\?-/u
const MARKDOWN_MARKED_COMMENT_CLOSE_PATTERN = /\\?-\\?-\\?>/gu
const MARKDOWN_TAG_LIKE_START_PATTERN = /^[A-Za-z/!?]/u
const MARKDOWN_FRONTMATTER_OPEN_PATTERN = /^\uFEFF?---[\t ]*\r?\n/u
const MARKDOWN_FRONTMATTER_CLOSE_PATTERN = /^---[\t ]*(?:\r?\n|$)/gmu
const MARKDOWN_BLANK_LINE_PATTERN = /\r?\n[\t ]*\r?\n/gu
const OBSIDIAN_CALLOUT_DIRECTIVE_LINE_PATTERN = /^[\t ]*:{3,}obsidian-callout\{.*\}[\t ]*$/gmu
const MARKDOWN_ANGLE_DESTINATION_PATTERN = /\]\([\t ]*</gu
const MARKDOWN_LINK_DESTINATION_NEEDS_ANGLES_PATTERN = /[\s()<>]/u
const FOOTNOTE_IDENTIFIER_PREFIX = "^"
const MARKDOWN_MARKED_ENTITY_ANGLE_PLACEHOLDER_PATTERN = /\u2060&lt;([^<>&\r\n]+)&gt;/gu
const MARKDOWN_MARKED_ESCAPED_ANGLE_PREFIX = `${MARKDOWN_INSERTED_ANGLE_ESCAPE_MARKER}\\<`
const MARKDOWN_ESCAPED_ASCII_PUNCTUATION_PATTERN = /\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/gu
const MARKDOWN_HTML_ELEMENT_NAMES = new Set(
  "a abbr address area article aside audio b base bdi bdo blockquote body br button canvas caption cite code col colgroup data datalist dd del details dfn dialog div dl dt em embed fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 head header hgroup hr html i iframe img input ins kbd label legend li link main map mark menu meta meter nav noscript object ol optgroup option output p picture pre progress q rp rt ruby s samp script search section select slot small source span strong style sub summary sup table tbody td template textarea tfoot th thead time title tr track u ul var video wbr".split(
    " ",
  ),
)
const MARKDOWN_SVG_ELEMENT_NAMES = new Set(
  "svg animate circle clipPath defs ellipse feBlend feColorMatrix feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap feDistantLight feDropShadow feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur feImage feMerge feMergeNode feMorphology feOffset fePointLight feSpecularLighting feSpotLight feTile feTurbulence filter foreignObject g image line linearGradient marker mask path pattern polygon polyline radialGradient rect stop symbol text textPath tspan use view".split(
    " ",
  ),
)
const MARKDOWN_HTML_TAG_NAMES = new Set([
  ...MARKDOWN_HTML_ELEMENT_NAMES,
  ...MARKDOWN_SVG_ELEMENT_NAMES,
])
const MARKDOWN_EDITOR_UNSUPPORTED_HTML_TAG_NAMES = new Set(["img", "menu", "search", "slot"])
const MARKDOWN_EDITOR_INLINE_TAG_NAMES = new Set(
  [...MARKDOWN_HTML_TAG_NAMES].filter(
    (name) => !MARKDOWN_EDITOR_UNSUPPORTED_HTML_TAG_NAMES.has(name),
  ),
)
const MARKDOWN_SVG_CHILD_TAG_NAMES_LOWERCASE = new Set(
  Array.from(MARKDOWN_SVG_ELEMENT_NAMES, (name) => name.toLocaleLowerCase()).filter(
    (name) => name !== "svg",
  ),
)
const MARKDOWN_HTML_TAG_NAMES_LOWERCASE = new Set(
  Array.from(MARKDOWN_HTML_TAG_NAMES, (name) => name.toLocaleLowerCase()),
)
const MARKDOWN_COMPLETE_HTML_TAG_PATTERN = /<\/?([A-Za-z][A-Za-z0-9-]*)(?:[ \t][^<>\r\n]*)?>/gu
const MARKDOWN_HTML_COMMENT_PATTERN = /<!--[\s\S]*?-->/gu
const MARKDOWN_HTML_DECLARATION_PATTERN = /<![A-Za-z][^<>\r\n]*>/gu
const MARKDOWN_BLOCK_BOUNDARY_PATTERN = /\r?\n[ \t]*(?:[-+*]|\d+[.)])[ \t]+/u
const MARKDOWN_CONTAINER_PREFIX_PATTERN = /^(?:[ \t]*(?:>|(?:[-+*]|\d{1,9}[.)])(?=[ \t])))*[ \t]*$/u
const MARKDOWN_CONTAINER_LIST_MARKER_PATTERN = /(?<=^|[ \t>])(?:[-+*]|\d{1,9}[.)])(?=[ \t])/gu
const MDX_ESM_START_PATTERN = /^(?:import|export)[\t {*]/u
const MARKDOWN_CLOSING_MATH_FENCE_LINE_PATTERN = /^[\t >]*\$\$[\t ]*$/u
const MARKDOWN_FENCED_CODE_START_PATTERN = /^ {0,3}(?:`{3,}|~{3,})/u
const MARKDOWN_BACKTICK_RUN_PATTERN = /`+/gu
const MARKDOWN_LINE_ENDING_PATTERN = /\r?\n/u
const MARKDOWN_MATH_FLOW_OPENING_LINE_PATTERN = /^[\t >]*\${2,}[^$]*$/u
const MINIMUM_CODE_FENCE_LENGTH = 3
const MARKDOWN_DIRECTIVE_FENCE_LINE_PATTERN = /^[\t ]*:{3,}.*$/gmu
const MARKDOWN_HTML_TAG_NAME_PATTERN = /^[\t ]*<\/?([A-Za-z][A-Za-z0-9-]*)/u
const MARKDOWN_JSX_COMPATIBLE_HTML_TAG_PATTERN =
  /^<\/?[A-Za-z][A-Za-z0-9-]*(?:[\t ]+[A-Za-z_$][\w$-]*(?::[A-Za-z_$][\w$-]*)?(?:[\t ]*=[\t ]*(?:"[^"]*"|'[^']*'))?)*[\t ]*\/?>$/u
const MARKDOWN_RAW_INLINE_HTML_TAG_NAMES = new Set(["br", "img", "wbr"])
const MARKDOWN_FLOW_CONTAINER_TYPES = new Set(["root", "blockquote", "listItem"])
const OBSIDIAN_WIKILINK_PATTERN = /!?\[\[[^\]\r\n]+\]\]/gu

function markdownAstChildren(node: Nodes): readonly Nodes[] {
  return "children" in node ? node.children : []
}

function readStartOffset(position: TMarkdownPosition | undefined): number | undefined {
  return position?.start.offset
}

function readEndOffset(position: TMarkdownPosition | undefined): number | undefined {
  return position?.end.offset
}

function readOffset(position: TMarkdownPosition | undefined): number | undefined {
  const start = readStartOffset(position)
  const end = readEndOffset(position)
  if (start === undefined || end === undefined) return undefined
  return start <= end ? start : undefined
}

function escapeLinkLabel(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("[", "\\[").replaceAll("]", "\\]")
}

function applyReplacements(markdown: string, replacements: MarkdownReplacement[]): string {
  let result = markdown
  for (const replacement of replacements.toSorted((left, right) => right.start - left.start)) {
    result = result.slice(0, replacement.start) + replacement.value + result.slice(replacement.end)
  }
  return result
}

function collectAutolinkReplacements(
  node: Nodes,
  markdown: string,
  replacements: MarkdownReplacement[],
): void {
  if (node.type === "link") {
    const start = readOffset(node.position)
    const end = readEndOffset(node.position)
    if (start !== undefined && end !== undefined) {
      const raw = markdown.slice(start, end)
      if (raw.startsWith("<") && raw.endsWith(">")) {
        const label = raw.slice(1, -1)
        const expectedUrl = label.includes("@") && !label.includes(":") ? `mailto:${label}` : label
        if (node.url === expectedUrl) {
          replacements.push({
            start,
            end,
            value: `[${escapeLinkLabel(label)}](<${node.url}>)`,
          })
        }
      }
    }
  }

  for (const child of markdownAstChildren(node)) {
    collectAutolinkReplacements(child, markdown, replacements)
  }
}

function isMarkdownAnglePlaceholder(raw: string): boolean {
  if (!raw.startsWith("<") || !raw.endsWith(">")) return false
  const inner = raw.slice(1, -1).trim()
  if (inner === "...") return true
  if (!inner || inner.startsWith("/") || inner.startsWith("!") || inner.startsWith("?")) {
    return false
  }
  const tagName = inner.split(/\s/u, 1)[0]
  if (!tagName || !/^[A-Za-z][A-Za-z0-9-]*$/u.test(tagName)) return false
  return !tagName.includes("-") && !MARKDOWN_HTML_TAG_NAMES.has(tagName)
}

function restoreMarkedEscapedAngles(markdown: string): string {
  let cursor = 0
  let restored = ""

  while (cursor < markdown.length) {
    const start = markdown.indexOf(MARKDOWN_MARKED_ESCAPED_ANGLE_PREFIX, cursor)
    if (start < 0) return restored + markdown.slice(cursor)

    restored += markdown.slice(cursor, start)
    const contentStart = start + MARKDOWN_MARKED_ESCAPED_ANGLE_PREFIX.length
    const commentEnd = markedCommentEnd(markdown, contentStart)
    if (commentEnd !== undefined) {
      restored += `<${unescapeAsciiPunctuation(markdown.slice(contentStart, commentEnd))}`
      cursor = commentEnd
      continue
    }
    let quote: '"' | "'" | undefined
    let end = contentStart
    for (; end < markdown.length; end += 1) {
      const character = markdown[end]
      if (character === "\r" || character === "\n") break
      if (quote) {
        if (character === quote && markdown[end - 1] !== "\\") quote = undefined
        continue
      }
      if (character === '"' || character === "'") {
        quote = character
        continue
      }
      if (character === ">") break
    }

    if (markdown[end] !== ">") {
      restored += MARKDOWN_MARKED_ESCAPED_ANGLE_PREFIX
      cursor = contentStart
      continue
    }

    const inner = markdown.slice(contentStart, end)
    const unescapedInner = unescapeAsciiPunctuation(inner)
    restored += `<${MARKDOWN_TAG_LIKE_START_PATTERN.test(unescapedInner) ? unescapedInner : inner}>`
    cursor = end + 1
  }

  return restored
}

function unescapeAsciiPunctuation(value: string): string {
  return value.replace(MARKDOWN_ESCAPED_ASCII_PUNCTUATION_PATTERN, "$1")
}

function escapeAsciiPunctuation(value: string): string {
  return value.replace(MARKDOWN_ASCII_PUNCTUATION_PATTERN, "\\$&")
}

function markedCommentEnd(markdown: string, contentStart: number): number | undefined {
  if (!MARKDOWN_MARKED_COMMENT_OPEN_PATTERN.test(markdown.slice(contentStart, contentStart + 6))) {
    return undefined
  }
  const closePattern = new RegExp(MARKDOWN_MARKED_COMMENT_CLOSE_PATTERN)
  closePattern.lastIndex = contentStart
  const close = closePattern.exec(markdown)
  return close ? close.index + close[0].length : undefined
}

function markdownFrontmatterEnd(markdown: string): number {
  const open = MARKDOWN_FRONTMATTER_OPEN_PATTERN.exec(markdown)
  if (!open) return 0
  const closePattern = new RegExp(MARKDOWN_FRONTMATTER_CLOSE_PATTERN)
  closePattern.lastIndex = open[0].length
  const close = closePattern.exec(markdown)
  return close ? close.index + close[0].length : 0
}

function collectCalloutDirectiveLineRanges(markdown: string): MarkdownRange[] {
  return Array.from(markdown.matchAll(OBSIDIAN_CALLOUT_DIRECTIVE_LINE_PATTERN), (match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }))
}

function linkLabelEnd(node: Extract<Nodes, { type: "link" }>, start: number): number {
  return readEndOffset(node.children.at(-1)?.position) ?? start + 1
}

function inlineLinkDestination(url: string): string {
  if (url.length > 0 && !MARKDOWN_LINK_DESTINATION_NEEDS_ANGLES_PATTERN.test(url)) return url
  return `<${url.replaceAll("<", "\\<").replaceAll(">", "\\>")}>`
}

function inlineLinkTitle(title: string | null | undefined): string {
  return title ? ` "${title.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"` : ""
}

function inlineLinkTarget(definition: Definition): string {
  return `(${inlineLinkDestination(definition.url)}${inlineLinkTitle(definition.title)})`
}

function isFootnoteIdentifier(identifier: string): boolean {
  return identifier.startsWith(FOOTNOTE_IDENTIFIER_PREFIX)
}

function collectDefinitions(node: Nodes, definitions: Definition[]): void {
  if (node.type === "definition") {
    definitions.push(node)
    return
  }
  for (const child of markdownAstChildren(node)) {
    collectDefinitions(child, definitions)
  }
}

function collectReferenceReplacements(input: {
  node: Nodes
  markdown: string
  definitions: ReadonlyMap<string, Definition>
  protectedRanges: readonly MarkdownRange[]
  replacements: MarkdownReplacement[]
}): void {
  const { node } = input
  if (node.type === "linkReference" || node.type === "imageReference") {
    const start = readOffset(node.position)
    const end = readEndOffset(node.position)
    const definition = input.definitions.get(node.identifier)
    if (
      start !== undefined &&
      end !== undefined &&
      definition &&
      !isFootnoteIdentifier(node.identifier) &&
      !rangeContainsOffset(input.protectedRanges, start)
    ) {
      const target = inlineLinkTarget(definition)
      if (node.type === "imageReference") {
        input.replacements.push({
          start,
          end,
          value: `![${escapeLinkLabel(node.alt ?? "")}]${target}`,
        })
        return
      }
      const labelStart = readOffset(node.children[0]?.position)
      const labelEnd = readEndOffset(node.children.at(-1)?.position)
      if (labelStart !== undefined && labelEnd !== undefined) {
        input.replacements.push({
          start,
          end,
          value: `[${input.markdown.slice(labelStart, labelEnd)}]${target}`,
        })
        return
      }
    }
  }

  for (const [index, child] of markdownAstChildren(node).entries()) {
    // CommonMark alone treats a checked task marker as a shortcut reference
    // when an [x] definition exists. Leave that marker for the task-list parser.
    const taskParagraph = node.type === "listItem" && index === 0 && child.type === "paragraph"
    const firstChild = taskParagraph ? child.children[0] : undefined
    const markerStart = readOffset(firstChild?.position)
    const taskMarker =
      firstChild?.type === "linkReference" &&
      markerStart !== undefined &&
      /^\[[xX]\](?:[\t \r\n]|$)/u.test(input.markdown.slice(markerStart))
    if (taskMarker && child.type === "paragraph") {
      for (const content of child.children.slice(1)) {
        collectReferenceReplacements({ ...input, node: content })
      }
      continue
    }
    collectReferenceReplacements({ ...input, node: child })
  }
}

function withCalloutDirectiveLinesAsBlockBreaks(markdown: string): string {
  // Parser offsets index the unmasked text, so the mask must keep every UTF-16
  // code unit; one `*` per astral character would shift later blocks.
  return markdown.replace(OBSIDIAN_CALLOUT_DIRECTIVE_LINE_PATTERN, (line) =>
    line.replace(/\S/gu, (character) => "*".repeat(character.length)),
  )
}

function inlineReferenceLinks(markdown: string): string {
  let tree: Root
  try {
    tree = fromMarkdown(withCalloutDirectiveLinesAsBlockBreaks(markdown))
  } catch {
    return markdown
  }

  const definitionNodes: Definition[] = []
  collectDefinitions(tree, definitionNodes)
  if (definitionNodes.length === 0) return markdown

  const definitions = new Map<string, Definition>()
  for (const definition of definitionNodes) {
    if (!definitions.has(definition.identifier)) {
      definitions.set(definition.identifier, definition)
    }
  }
  const protectedRanges = collectCalloutDirectiveLineRanges(markdown)
  const replacements: MarkdownReplacement[] = []
  collectReferenceReplacements({
    node: tree,
    markdown,
    definitions,
    protectedRanges,
    replacements,
  })

  for (const definition of definitionNodes) {
    const start = readOffset(definition.position)
    const end = readEndOffset(definition.position)
    if (start === undefined || end === undefined) continue
    if (rangeContainsOffset(protectedRanges, start)) continue
    // Keep definitions as editable source text even when their links were
    // expanded. A separate prose edit must never delete authored source.
    replacements.push({ start, end: start + 1, value: MARKDOWN_MARKED_ESCAPED_BRACKET })
  }

  return applyReplacements(markdown, replacements)
}

function markedCommentText(markdown: string, start: number, end: number): string {
  return `${MARKDOWN_MARKED_ESCAPED_ANGLE_PREFIX}${escapeAsciiPunctuation(markdown.slice(start + 1, end))}`
}

function collectStandaloneCommentReplacements(
  node: Nodes,
  markdown: string,
  protectedRanges: readonly MarkdownRange[],
  replacements: MarkdownReplacement[],
): void {
  if (node.type === "html") {
    const start = readOffset(node.position)
    if (start === undefined || rangeContainsOffset(protectedRanges, start)) return
    if (!markdown.startsWith("<!--", start)) return
    const closeStart = markdown.indexOf("-->", start + 4)
    if (closeStart < 0) return
    const end = closeStart + 3
    replacements.push({ start, end, value: markedCommentText(markdown, start, end) })
    return
  }

  for (const child of markdownAstChildren(node)) {
    collectStandaloneCommentReplacements(child, markdown, protectedRanges, replacements)
  }
}

function collectAngleDestinationRanges(
  node: Nodes,
  markdown: string,
  ranges: MarkdownRange[],
): void {
  if (node.type === "link" || node.type === "image") {
    const start = readOffset(node.position)
    const end = readEndOffset(node.position)
    if (start !== undefined && end !== undefined) {
      const searchStart = node.type === "link" ? linkLabelEnd(node, start) : start
      const raw = markdown.slice(searchStart, end)
      const destination = Array.from(raw.matchAll(MARKDOWN_ANGLE_DESTINATION_PATTERN)).at(-1)
      if (destination) {
        const angleOffset = searchStart + destination.index + destination[0].length - 1
        ranges.push({ start: angleOffset, end: angleOffset + 1 })
      }
    }
  }

  for (const child of markdownAstChildren(node)) {
    collectAngleDestinationRanges(child, markdown, ranges)
  }
}

function collectMarkdownAnglePlaceholderReplacements(
  tree: Root,
  markdown: string,
  replacements: MarkdownReplacement[],
): void {
  const codeRanges: MarkdownRange[] = collectCalloutDirectiveLineRanges(markdown)
  collectMdxPlaceholderProtectedRanges(tree, markdown, codeRanges)
  collectAngleDestinationRanges(tree, markdown, codeRanges)
  codeRanges.sort((left, right) => left.start - right.start)
  const listItemRanges: MarkdownRange[] = []
  collectNodeTypeRanges(tree, "listItem", listItemRanges)
  listItemRanges.sort((left, right) => left.end - left.start - (right.end - right.start))
  collectStandaloneCommentReplacements(tree, markdown, codeRanges, replacements)
  const reservedRanges = replacements.map(({ start, end }) => ({ start, end }))
  const safeHtmlRanges = collectSafeMarkdownHtmlRanges(markdown, codeRanges, listItemRanges)

  for (let start = markdown.indexOf("<"); start >= 0; start = markdown.indexOf("<", start + 1)) {
    if (markdown[start - 1] === "\\") continue
    if (rangeContainsOffset(codeRanges, start)) continue
    if (rangeContainsOffset(reservedRanges, start)) continue
    if (rangeContainsOffset(safeHtmlRanges, start)) continue
    replacements.push({
      start,
      end: start + 1,
      value: `${MARKDOWN_INSERTED_ANGLE_ESCAPE_MARKER}\\<`,
    })
  }
}

type MarkdownHtmlTag = MarkdownRange & {
  closing: boolean
  listItemStart?: number
  name: string
  selfClosing: boolean
}

function rangeContainsOffset(ranges: readonly MarkdownRange[], offset: number): boolean {
  return ranges.some((range) => offset >= range.start && offset < range.end)
}

function containingRangeStart(
  ranges: readonly MarkdownRange[],
  offset: number,
): number | undefined {
  return ranges.find((range) => offset >= range.start && offset < range.end)?.start
}

function isSvgOpeningTag(tag: MarkdownHtmlTag): boolean {
  return tag.name === "svg"
}

function isOutsideSvgChildTag(
  tag: MarkdownHtmlTag,
  openingStack: readonly MarkdownHtmlTag[],
): boolean {
  return MARKDOWN_SVG_CHILD_TAG_NAMES_LOWERCASE.has(tag.name) && !openingStack.some(isSvgOpeningTag)
}

function collectSafeMarkdownHtmlRanges(
  markdown: string,
  protectedRanges: readonly MarkdownRange[],
  listItemRanges: readonly MarkdownRange[],
): MarkdownRange[] {
  const safeRanges: MarkdownRange[] = []
  for (const pattern of [MARKDOWN_HTML_COMMENT_PATTERN, MARKDOWN_HTML_DECLARATION_PATTERN]) {
    for (const match of markdown.matchAll(pattern)) {
      if (!rangeContainsOffset(protectedRanges, match.index)) {
        safeRanges.push({ start: match.index, end: match.index + match[0].length })
      }
    }
  }

  const tags: MarkdownHtmlTag[] = []
  for (const match of markdown.matchAll(MARKDOWN_COMPLETE_HTML_TAG_PATTERN)) {
    const raw = match[0]
    const name = match[1]
    if (!name || !MARKDOWN_EDITOR_INLINE_TAG_NAMES.has(name)) continue
    if (!MARKDOWN_JSX_COMPATIBLE_HTML_TAG_PATTERN.test(raw)) continue
    if (rangeContainsOffset(protectedRanges, match.index)) continue
    const listItemStart = containingRangeStart(listItemRanges, match.index)
    tags.push(
      Object.assign(
        {
          start: match.index,
          end: match.index + raw.length,
          closing: raw.startsWith("</"),
          name: name.toLocaleLowerCase(),
          selfClosing: raw.slice(0, -1).trimEnd().endsWith("/"),
        },
        listItemStart !== undefined ? { listItemStart } : undefined,
      ),
    )
  }

  const openingStack: MarkdownHtmlTag[] = []
  for (const tag of tags) {
    if (isOutsideSvgChildTag(tag, openingStack)) continue
    if (tag.selfClosing) {
      safeRanges.push(tag)
      continue
    }
    if (!tag.closing) {
      openingStack.push(tag)
      continue
    }
    const opening = openingStack.at(-1)
    if (!opening || opening.name !== tag.name) continue
    openingStack.pop()
    if (opening.listItemStart !== tag.listItemStart) continue
    if (MARKDOWN_BLOCK_BOUNDARY_PATTERN.test(markdown.slice(opening.end, tag.start))) continue
    safeRanges.push(opening, tag)
  }

  return safeRanges.toSorted((left, right) => left.start - right.start)
}

function collectNodeTypeRanges(node: Nodes, type: string, ranges: MarkdownRange[]): void {
  if (node.type === type) {
    const start = readOffset(node.position)
    const end = readEndOffset(node.position)
    if (start !== undefined && end !== undefined) ranges.push({ start, end })
  }
  for (const child of markdownAstChildren(node)) {
    collectNodeTypeRanges(child, type, ranges)
  }
}

function collectMdxPlaceholderProtectedRanges(
  node: Nodes,
  markdown: string,
  ranges: MarkdownRange[],
): void {
  if (node.type === "math" || node.type === "inlineMath") {
    const start = readOffset(node.position)
    const end = readEndOffset(node.position)
    if (start !== undefined && end !== undefined) ranges.push({ start, end })
    return
  }
  if (node.type === "inlineCode" || node.type === "code") {
    const start = readOffset(node.position)
    const end = readEndOffset(node.position)
    if (start === undefined || end === undefined) return
    const raw = markdown.slice(start, end).trimStart()
    if (node.type === "inlineCode" || raw.startsWith("```") || raw.startsWith("~~~")) {
      ranges.push({ start, end })
    }
    return
  }

  for (const child of markdownAstChildren(node)) {
    collectMdxPlaceholderProtectedRanges(child, markdown, ranges)
  }
}

function collectMdxCommentReplacements(
  tree: Root,
  markdown: string,
  replacements: MarkdownReplacement[],
): void {
  const codeRanges: MarkdownRange[] = []
  collectMdxPlaceholderProtectedRanges(tree, markdown, codeRanges)

  let searchFrom = 0
  while (searchFrom < markdown.length) {
    const start = markdown.indexOf("<!--", searchFrom)
    if (start < 0) return
    const endMarker = markdown.indexOf("-->", start + 4)
    if (endMarker < 0) return
    const end = endMarker + 3
    if (!rangeContainsOffset(codeRanges, start)) {
      replacements.push({ start, end, value: markedCommentText(markdown, start, end) })
    }
    searchFrom = end
  }
}

function collectMathRanges(input: {
  node: Nodes
  markdown: string
  verbatimRanges: MarkdownRange[]
  literalEscapeRanges: MarkdownRange[]
}): void {
  const { node } = input
  const start = readOffset(node.position)
  const end = readEndOffset(node.position)
  if (
    node.type === "code" ||
    node.type === "inlineCode" ||
    node.type === "html" ||
    node.type === "image" ||
    node.type === "definition"
  ) {
    if (start !== undefined && end !== undefined) input.verbatimRanges.push({ start, end })
    return
  }
  if (node.type === "link" && start !== undefined && end !== undefined) {
    if (input.markdown[start] === "<") {
      input.verbatimRanges.push({ start, end })
      return
    }
    const labelEnd = linkLabelEnd(node, start)
    input.literalEscapeRanges.push({ start, end: labelEnd })
    input.verbatimRanges.push({ start: labelEnd, end })
  }

  for (const child of markdownAstChildren(node)) {
    collectMathRanges({ ...input, node: child })
  }
}

function nextBlankLineStart(markdown: string, index: number): number {
  const blankLinePattern = new RegExp(MARKDOWN_BLANK_LINE_PATTERN)
  blankLinePattern.lastIndex = index
  return blankLinePattern.exec(markdown)?.index ?? markdown.length
}

function isSingleDollarMath(raw: string): boolean {
  return raw.startsWith("$") && !raw.startsWith("$$")
}

function isDoubleDollarMath(raw: string): boolean {
  return raw.startsWith("$$")
}

function opensMathFlow(line: string): boolean {
  return MARKDOWN_MATH_FLOW_OPENING_LINE_PATTERN.test(line)
}

function keepsInlineMathOutOfMathFlow(input: {
  source: string
  index: number
  raw: string
  atBlockStart: boolean
}): boolean {
  const mathEnd = input.index + input.raw.length
  const lineEnd = input.source.indexOf("\n", mathEnd)
  const [firstLine = "", ...continuationLines] = input.source
    .slice(input.index, lineEnd < 0 ? input.source.length : lineEnd)
    .split(MARKDOWN_LINE_ENDING_PATTERN)
  if (input.atBlockStart && opensMathFlow(firstLine)) return false
  return !continuationLines.some(opensMathFlow)
}

function markdownLinePrefix(markdown: string, index: number): string {
  return markdown.slice(markdown.lastIndexOf("\n", index - 1) + 1, index)
}

function markdownContinuationPrefix(linePrefix: string): string {
  return linePrefix.replace(MARKDOWN_CONTAINER_LIST_MARKER_PATTERN, (marker) =>
    " ".repeat(marker.length),
  )
}

function isFencedBlockMath(raw: string): boolean {
  const lines = raw.replace(/\r?\n$/u, "").split(/\r?\n/u)
  const closingLine = lines.at(-1) ?? ""
  return (
    lines.length > 1 &&
    /^ {0,3}\$\$[\t ]*$/u.test(lines[0] ?? "") &&
    MARKDOWN_CLOSING_MATH_FENCE_LINE_PATTERN.test(closingLine)
  )
}

function withoutContinuationPrefix(line: string, continuationPrefix: string): string {
  if (line.startsWith(continuationPrefix)) return line.slice(continuationPrefix.length)
  const trimmedPrefix = continuationPrefix.trimEnd()
  return line.startsWith(trimmedPrefix) ? line.slice(trimmedPrefix.length) : line
}

function fencedBlockMath(text: string, continuationPrefix: string): string {
  const lines = text.split("\n").map((line) => withoutContinuationPrefix(line, continuationPrefix))
  return ["$$", ...lines, "$$"].join(`\n${continuationPrefix}`)
}

function normalizeBuddyMathForMdxEditor(markdown: string): string {
  const source = markdown
    .replaceAll(LEGACY_BUDDY_DISPLAY_MATH_MARKER, "")
    .replace(/^\$\$\$\r?$/gmu, () => "$$")
  let tree: Root
  try {
    tree = fromMarkdown(source)
  } catch {
    return source
  }

  const verbatimRanges: MarkdownRange[] = collectCalloutDirectiveLineRanges(source)
  const literalEscapeRanges: MarkdownRange[] = []
  collectMathRanges({ node: tree, markdown: source, verbatimRanges, literalEscapeRanges })
  for (const match of source.matchAll(OBSIDIAN_WIKILINK_PATTERN)) {
    if (source[match.index - 1] === "\\" || rangeContainsOffset(verbatimRanges, match.index))
      continue
    // Targets and aliases are literal Obsidian identifiers, including currency.
    verbatimRanges.push({ start: match.index, end: match.index + match[0].length })
  }
  verbatimRanges.sort((left, right) => left.start - right.start)

  let result = ""
  let index = 0
  let verbatimRangeIndex = 0
  let paragraphEnd = 0

  while (index < source.length) {
    const verbatimRange = verbatimRanges[verbatimRangeIndex]
    if (verbatimRange && index >= verbatimRange.end) {
      verbatimRangeIndex += 1
      continue
    }
    if (verbatimRange && index >= verbatimRange.start) {
      result += source.slice(index, verbatimRange.end)
      index = verbatimRange.end
      verbatimRangeIndex += 1
      continue
    }

    if (index >= paragraphEnd) paragraphEnd = nextBlankLineStart(source, index)
    const verbatimStart = verbatimRange?.start ?? source.length
    const literalEscapeRange = literalEscapeRanges.find(
      (range) => index >= range.start && index < range.end,
    )
    const character = source[index]
    const linePrefix =
      character === "$" || character === "\\" ? markdownLinePrefix(source, index) : undefined
    const atBlockStart =
      linePrefix !== undefined && MARKDOWN_CONTAINER_PREFIX_PATTERN.test(linePrefix)

    if (linePrefix !== undefined && atBlockStart && !literalEscapeRange) {
      const blockMatch =
        matchBuddyBlockMath(source.slice(index, Math.min(paragraphEnd, verbatimStart))) ??
        (source.startsWith("$$", index) ? matchBuddyBlockMath(source.slice(index)) : undefined)
      if (blockMatch) {
        const trailingLineBreak = blockMatch.raw.endsWith("\n") ? "\n" : ""
        result += isFencedBlockMath(blockMatch.raw)
          ? blockMatch.raw
          : `${fencedBlockMath(blockMatch.text, markdownContinuationPrefix(linePrefix))}${trailingLineBreak}`
        index += blockMatch.raw.length
        continue
      }
    }

    if (literalEscapeRange && character === "\\") {
      result += source.slice(index, index + 2)
      index += 2
      continue
    }

    const inlineEnd = Math.min(
      paragraphEnd,
      verbatimStart,
      literalEscapeRange?.end ?? source.length,
    )
    const match = matchBuddyInlineMath(source.slice(index, inlineEnd))
    if (match) {
      const keepsDelimiters =
        isSingleDollarMath(match.raw) ||
        (isDoubleDollarMath(match.raw) &&
          keepsInlineMathOutOfMathFlow({ source, index, raw: match.raw, atBlockStart }))
      result += keepsDelimiters ? match.raw : `$${match.text}$`
      index += match.raw.length
      continue
    }

    if (character === "$" && source[index - 1] !== "\\") {
      result += "\\$"
    } else {
      result += character
    }
    index += 1
  }

  return result
}

/**
 * MDX treats CommonMark angle autolinks as JSX. Protect only parser-confirmed
 * autolinks; raw HTML and code remain byte-for-byte unchanged.
 */
function prepareBodyForMdxEditor(body: string, markdownDocument: boolean): string {
  const mathMarkdown = normalizeBuddyMathForMdxEditor(inlineReferenceLinks(body))
  const normalizedMarkdown = markdownDocument ? carryRawHtml(mathMarkdown) : mathMarkdown
  let tree: Root
  try {
    tree = fromMarkdown(normalizedMarkdown, {
      extensions: [math({ singleDollarTextMath: true })],
      mdastExtensions: [mathFromMarkdown()],
    })
  } catch {
    return normalizedMarkdown
  }

  const replacements: MarkdownReplacement[] = []
  collectAutolinkReplacements(tree, normalizedMarkdown, replacements)
  if (markdownDocument) {
    collectMarkdownAnglePlaceholderReplacements(tree, normalizedMarkdown, replacements)
  }
  if (replacements.length === 0) return normalizedMarkdown

  return applyReplacements(normalizedMarkdown, replacements)
}

function markMdxCommentsAsText(mdx: string): string {
  let tree: Root
  try {
    tree = fromMarkdown(mdx)
  } catch {
    return mdx
  }

  const replacements: MarkdownReplacement[] = []
  collectMdxCommentReplacements(tree, mdx, replacements)
  if (replacements.length === 0) return mdx

  return applyReplacements(mdx, replacements)
}

function backtickCodeFence(value: string): string {
  const longestRun = Math.max(
    0,
    ...Array.from(value.matchAll(MARKDOWN_BACKTICK_RUN_PATTERN), (run) => run[0].length),
  )
  return "`".repeat(Math.max(MINIMUM_CODE_FENCE_LENGTH, longestRun + 1))
}

function fencedCodeBlock(value: string, continuationPrefix: string, info = ""): string {
  const fence = backtickCodeFence(value)
  const lines = value
    .split(MARKDOWN_LINE_ENDING_PATTERN)
    .map((line) => (line === "" ? continuationPrefix.trimEnd() : `${continuationPrefix}${line}`))
  return [`${fence}${info}`, ...lines, `${continuationPrefix}${fence}`].join("\n")
}

function collectIndentedCodeReplacements(
  node: Nodes,
  markdown: string,
  replacements: MarkdownReplacement[],
): void {
  if (node.type === "code") {
    const start = readOffset(node.position)
    const end = readEndOffset(node.position)
    if (start === undefined || end === undefined) return
    if (MARKDOWN_FENCED_CODE_START_PATTERN.test(markdown.slice(start, end))) return
    const continuationPrefix = markdownContinuationPrefix(markdownLinePrefix(markdown, start))
    replacements.push({ start, end, value: fencedCodeBlock(node.value, continuationPrefix) })
    return
  }

  for (const child of markdownAstChildren(node)) {
    collectIndentedCodeReplacements(child, markdown, replacements)
  }
}

function fenceIndentedCodeBlocks(markdown: string): string {
  let tree: Root
  try {
    tree = fromMarkdown(withCalloutDirectiveLinesAsBlockBreaks(markdown))
  } catch {
    return markdown
  }

  const replacements: MarkdownReplacement[] = []
  collectIndentedCodeReplacements(tree, markdown, replacements)
  if (replacements.length === 0) return markdown

  return applyReplacements(markdown, replacements)
}

function withDirectiveFenceLinesAsBlankLines(markdown: string): string {
  return markdown.replace(MARKDOWN_DIRECTIVE_FENCE_LINE_PATTERN, (line) => " ".repeat(line.length))
}

function htmlTagName(html: string): string | undefined {
  return MARKDOWN_HTML_TAG_NAME_PATTERN.exec(html)?.[1]?.toLocaleLowerCase()
}

function isRawHtmlBlock(html: string): boolean {
  const name = htmlTagName(html)
  return name !== undefined && MARKDOWN_HTML_TAG_NAMES_LOWERCASE.has(name)
}

function isRawInlineHtml(html: string): boolean {
  const name = htmlTagName(html)
  return name !== undefined && MARKDOWN_RAW_INLINE_HTML_TAG_NAMES.has(name)
}

function followsWithoutBlankLine(previous: Nodes | undefined, node: Nodes): boolean {
  const previousEnd = previous?.position?.end.line
  const start = node.position?.start.line
  return previousEnd !== undefined && start !== undefined && previousEnd + 1 === start
}

function collectRawHtmlReplacements(input: {
  node: Nodes
  markdown: string
  parsedMarkdown: string
  replacements: MarkdownReplacement[]
  continuationPrefix?: string
}): void {
  const { node, markdown } = input
  const nodeStart = readOffset(node.position)
  const linePrefix = nodeStart === undefined ? "" : markdownLinePrefix(markdown, nodeStart)
  const inlineContinuationPrefix = MARKDOWN_CONTAINER_PREFIX_PATTERN.test(linePrefix)
    ? markdownContinuationPrefix(linePrefix)
    : (input.continuationPrefix ?? "")
  const children = markdownAstChildren(node)
  const flowContainer = MARKDOWN_FLOW_CONTAINER_TYPES.has(node.type)
  for (const [index, child] of children.entries()) {
    if (child.type !== "html") {
      collectRawHtmlReplacements({
        ...input,
        node: child,
        continuationPrefix: inlineContinuationPrefix,
      })
      continue
    }
    const start = readOffset(child.position)
    const end = readEndOffset(child.position)
    if (start === undefined || end === undefined) continue
    if (markdown.slice(start, end) !== input.parsedMarkdown.slice(start, end)) continue
    if (!flowContainer) {
      if (isRawInlineHtml(child.value)) {
        const source = markdown
          .slice(start, end)
          .split("\n")
          .map((line, index) =>
            index === 0 ? line : withoutContinuationPrefix(line, inlineContinuationPrefix),
          )
          .join("\n")
        input.replacements.push({ start, end, value: rawHtmlInlineCarrier(source) })
      }
      continue
    }
    if (!isRawHtmlBlock(child.value)) continue
    const continuationPrefix = markdownContinuationPrefix(markdownLinePrefix(markdown, start))
    const info = rawHtmlBlockInfo(followsWithoutBlankLine(children[index - 1], child))
    input.replacements.push({
      start,
      end,
      value: fencedCodeBlock(child.value, continuationPrefix, info),
    })
  }
}

function carryRawHtml(markdown: string): string {
  const parsedMarkdown = withDirectiveFenceLinesAsBlankLines(markdown)
  let tree: Root
  try {
    tree = fromMarkdown(parsedMarkdown, {
      extensions: [math({ singleDollarTextMath: true })],
      mdastExtensions: [mathFromMarkdown()],
    })
  } catch {
    return markdown
  }

  const replacements: MarkdownReplacement[] = []
  collectRawHtmlReplacements({ node: tree, markdown, parsedMarkdown, replacements })
  if (replacements.length === 0) return markdown

  return applyReplacements(markdown, replacements)
}

function prepareDocumentBody(markdown: string, prepareBody: (body: string) => string): string {
  const markdownWithCallouts = prepareObsidianCalloutsForMdxEditor(markdown)
  const frontmatterEnd = markdownFrontmatterEnd(markdownWithCallouts)
  return (
    markdownWithCallouts.slice(0, frontmatterEnd) +
    prepareBody(markdownWithCallouts.slice(frontmatterEnd))
  )
}

export function prepareMarkdownForMdxEditor(markdown: string): string {
  return prepareDocumentBody(markdown, (body) =>
    prepareBodyForMdxEditor(fenceIndentedCodeBlocks(body), true),
  )
}

export function restoreMarkdownFromMdxEditor(markdown: string): string {
  return restoreMarkedEscapedAngles(
    markdown.replace(MARKDOWN_MARKED_ENTITY_ANGLE_PLACEHOLDER_PATTERN, (raw, inner: string) => {
      const placeholder = `<${inner}>`
      return isMarkdownAnglePlaceholder(placeholder) ? placeholder : raw
    }),
  )
    .replaceAll(`${MARKDOWN_INSERTED_ANGLE_ESCAPE_MARKER}\\<`, "<")
    .replaceAll(MARKDOWN_MARKED_ESCAPED_BRACKET, "[")
    .replaceAll(MARKDOWN_MARKED_BRACKET, "[")
}

function mdxEsmBlockRanges(body: string): MarkdownRange[] {
  let tree: Root
  try {
    tree = fromMarkdown(body)
  } catch {
    return []
  }
  return tree.children.flatMap((node) => {
    const start = readOffset(node.position)
    const end = readEndOffset(node.position)
    if (node.type !== "paragraph" || start === undefined || end === undefined) return []
    if (start > 0 && body[start - 1] !== "\n") return []
    return MDX_ESM_START_PATTERN.test(body.slice(start, end)) ? [{ start, end }] : []
  })
}

function prepareMdxProse(prose: string): string {
  return markMdxCommentsAsText(prepareBodyForMdxEditor(prose, false))
}

function prepareMdxBodyKeepingEsm(body: string): string {
  let prepared = ""
  let cursor = 0
  for (const range of mdxEsmBlockRanges(body)) {
    prepared +=
      prepareMdxProse(body.slice(cursor, range.start)) + body.slice(range.start, range.end)
    cursor = range.end
  }
  return prepared + prepareMdxProse(body.slice(cursor))
}

export function prepareMdxForMdxEditor(mdx: string): string {
  return prepareDocumentBody(mdx, prepareMdxBodyKeepingEsm)
}

export function restoreMdxFromMdxEditor(mdx: string): string {
  return restoreMarkedEscapedAngles(mdx)
    .replaceAll(MARKDOWN_MARKED_ESCAPED_BRACKET, "[")
    .replaceAll(MARKDOWN_MARKED_BRACKET, "[")
}
