import { fromMarkdown } from "mdast-util-from-markdown"
import { matchBuddyBlockMath, matchBuddyInlineMath } from "@/components/markdown/markdown-math"
import { prepareObsidianCalloutsForMdxEditor } from "@/components/bench/markdown-bench-obsidian-callouts"

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
const MARKDOWN_MARKED_ENTITY_ANGLE_PLACEHOLDER_PATTERN = /\u2060&lt;([^<>&\r\n]+)&gt;/gu
const MARKDOWN_MARKED_ESCAPED_ANGLE_PREFIX = `${MARKDOWN_INSERTED_ANGLE_ESCAPE_MARKER}\\<`
const MARKDOWN_ESCAPED_ASCII_PUNCTUATION_PATTERN = /\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/gu
const MARKDOWN_HTML_TAG_NAMES = new Set(
  "a abbr address area article aside audio b base bdi bdo blockquote body br button canvas caption cite code col colgroup data datalist dd del details dfn dialog div dl dt em embed fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 head header hgroup hr html i iframe img input ins kbd label legend li link main map mark menu meta meter nav noscript object ol optgroup option output p picture pre progress q rp rt ruby s samp script search section select slot small source span strong style sub summary sup table tbody td template textarea tfoot th thead time title tr track u ul var video wbr svg animate circle clipPath defs ellipse feBlend feColorMatrix feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap feDistantLight feDropShadow feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur feImage feMerge feMergeNode feMorphology feOffset fePointLight feSpecularLighting feSpotLight feTile feTurbulence filter foreignObject g image line linearGradient marker mask path pattern polygon polyline radialGradient rect stop symbol text textPath tspan use view".split(
    " ",
  ),
)
const MARKDOWN_HTML_TAG_NAMES_LOWERCASE = new Set(
  Array.from(MARKDOWN_HTML_TAG_NAMES, (name) => name.toLocaleLowerCase()),
)
const MARKDOWN_COMPLETE_HTML_TAG_PATTERN = /<\/?([A-Za-z][A-Za-z0-9-]*)(?:[ \t][^<>\r\n]*)?>/gu
const MARKDOWN_HTML_COMMENT_PATTERN = /<!--[\s\S]*?-->/gu
const MARKDOWN_HTML_DECLARATION_PATTERN = /<![A-Za-z][^<>\r\n]*>/gu
const MARKDOWN_BLOCK_BOUNDARY_PATTERN = /\r?\n[ \t]*(?:[-+*]|\d+[.)])[ \t]+/u

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function readOffset(value: unknown): number | undefined {
  if (!isRecord(value) || !isRecord(value.start) || !isRecord(value.end)) {
    return
  }
  const start = value.start.offset
  const end = value.end.offset
  if (typeof start !== "number" || typeof end !== "number") {
    return
  }
  return start <= end ? start : undefined
}

function readEndOffset(value: unknown): number | undefined {
  if (!isRecord(value) || !isRecord(value.end)) {
    return
  }
  const end = value.end.offset
  return typeof end === "number" ? end : undefined
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
  node: unknown,
  markdown: string,
  replacements: MarkdownReplacement[],
): void {
  if (!isRecord(node)) return

  if (node.type === "link" && typeof node.url === "string") {
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

  if (!Array.isArray(node.children)) return
  for (const child of node.children) {
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
    restored += `<${inner.replace(MARKDOWN_ESCAPED_ASCII_PUNCTUATION_PATTERN, "$1")}>`
    cursor = end + 1
  }

  return restored
}

function collectMarkdownAnglePlaceholderReplacements(
  tree: unknown,
  markdown: string,
  replacements: MarkdownReplacement[],
): void {
  const codeRanges: MarkdownRange[] = []
  collectMdxPlaceholderProtectedRanges(tree, markdown, codeRanges)
  codeRanges.sort((left, right) => left.start - right.start)
  const listItemRanges: MarkdownRange[] = []
  collectNodeTypeRanges(tree, "listItem", listItemRanges)
  listItemRanges.sort((left, right) => left.end - left.start - (right.end - right.start))
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

function isMarkdownHtmlTagName(name: string): boolean {
  return name.includes("-") || MARKDOWN_HTML_TAG_NAMES_LOWERCASE.has(name.toLocaleLowerCase())
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
    if (!name || !isMarkdownHtmlTagName(name)) continue
    if (rangeContainsOffset(protectedRanges, match.index)) continue
    const listItemStart = containingRangeStart(listItemRanges, match.index)
    tags.push({
      start: match.index,
      end: match.index + raw.length,
      closing: raw.startsWith("</"),
      ...(listItemStart !== undefined ? { listItemStart } : {}),
      name: name.toLocaleLowerCase(),
      selfClosing: raw.slice(0, -1).trimEnd().endsWith("/"),
    })
  }

  const openingStack: MarkdownHtmlTag[] = []
  for (const tag of tags) {
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

function collectNodeTypeRanges(node: unknown, type: string, ranges: MarkdownRange[]): void {
  if (!isRecord(node)) return
  if (node.type === type) {
    const start = readOffset(node.position)
    const end = readEndOffset(node.position)
    if (start !== undefined && end !== undefined) ranges.push({ start, end })
  }
  if (!Array.isArray(node.children)) return
  for (const child of node.children) collectNodeTypeRanges(child, type, ranges)
}

function collectMdxPlaceholderProtectedRanges(
  node: unknown,
  markdown: string,
  ranges: MarkdownRange[],
): void {
  if (!isRecord(node)) return

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

  if (!Array.isArray(node.children)) return
  for (const child of node.children) {
    collectMdxPlaceholderProtectedRanges(child, markdown, ranges)
  }
}

function collectCodeRanges(node: unknown, ranges: MarkdownRange[]): void {
  if (!isRecord(node)) return

  if (node.type === "code" || node.type === "inlineCode") {
    const start = readOffset(node.position)
    const end = readEndOffset(node.position)
    if (start !== undefined && end !== undefined) {
      ranges.push({ start, end })
    }
    return
  }

  if (!Array.isArray(node.children)) return
  for (const child of node.children) {
    collectCodeRanges(child, ranges)
  }
}

function collectHtmlCommentReplacements(
  tree: unknown,
  markdown: string,
  replacements: MarkdownReplacement[],
): void {
  const codeRanges: MarkdownRange[] = []
  collectCodeRanges(tree, codeRanges)
  codeRanges.sort((left, right) => left.start - right.start)

  let searchFrom = 0
  while (searchFrom < markdown.length) {
    const start = markdown.indexOf("<!--", searchFrom)
    if (start < 0) return
    const endMarker = markdown.indexOf("-->", start + 4)
    if (endMarker < 0) return
    const end = endMarker + 3
    const insideCode = codeRanges.some((range) => start >= range.start && start < range.end)
    const comment = markdown.slice(start + 4, endMarker)
    if (!insideCode && !comment.includes("*/")) {
      replacements.push({
        start,
        end,
        value: `{/*${comment}*/}`,
      })
    }
    searchFrom = end
  }
}

function collectProtectedRanges(node: unknown, ranges: MarkdownRange[]): void {
  if (!isRecord(node)) return

  if (node.type === "code" || node.type === "inlineCode" || node.type === "html") {
    const start = readOffset(node.position)
    const end = readEndOffset(node.position)
    if (start !== undefined && end !== undefined) {
      ranges.push({ start, end })
    }
    return
  }

  if (!Array.isArray(node.children)) return
  for (const child of node.children) {
    collectProtectedRanges(child, ranges)
  }
}

function normalizeBuddyMathForMdxEditor(markdown: string): string {
  const markdownWithoutLegacyMarkers = markdown
    .replaceAll(LEGACY_BUDDY_DISPLAY_MATH_MARKER, "")
    .replace(/^\$\$\$\r?$/gmu, () => "$$")
  let tree: unknown
  try {
    tree = fromMarkdown(markdownWithoutLegacyMarkers)
  } catch {
    return markdownWithoutLegacyMarkers
  }

  const protectedRanges: MarkdownRange[] = []
  collectProtectedRanges(tree, protectedRanges)
  protectedRanges.sort((left, right) => left.start - right.start)

  let result = ""
  let index = 0
  let protectedRangeIndex = 0

  while (index < markdownWithoutLegacyMarkers.length) {
    const protectedRange = protectedRanges[protectedRangeIndex]
    if (protectedRange && index >= protectedRange.end) {
      protectedRangeIndex += 1
      continue
    }
    if (protectedRange && index >= protectedRange.start) {
      result += markdownWithoutLegacyMarkers.slice(index, protectedRange.end)
      index = protectedRange.end
      protectedRangeIndex += 1
      continue
    }

    const blockMatch = matchBuddyBlockMath(markdownWithoutLegacyMarkers.slice(index))
    if (blockMatch) {
      const trailingLineBreak = blockMatch.raw.endsWith("\n") ? "\n" : ""
      result += `$$\n${blockMatch.text}\n$$${trailingLineBreak}`
      index += blockMatch.raw.length
      continue
    }

    const match = matchBuddyInlineMath(markdownWithoutLegacyMarkers.slice(index))
    if (match) {
      result += `$${match.text}$`
      index += match.raw.length
      continue
    }

    const character = markdownWithoutLegacyMarkers[index]
    if (character === "$" && markdownWithoutLegacyMarkers[index - 1] !== "\\") {
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
function prepareForMdxEditor(markdown: string, protectAnglePlaceholders: boolean): string {
  const normalizedMarkdown = normalizeBuddyMathForMdxEditor(
    prepareObsidianCalloutsForMdxEditor(markdown),
  )
  let tree: unknown
  try {
    tree = fromMarkdown(normalizedMarkdown)
  } catch {
    return normalizedMarkdown
  }

  const replacements: MarkdownReplacement[] = []
  collectAutolinkReplacements(tree, normalizedMarkdown, replacements)
  if (protectAnglePlaceholders) {
    collectMarkdownAnglePlaceholderReplacements(tree, normalizedMarkdown, replacements)
  }
  if (replacements.length === 0) return normalizedMarkdown

  return applyReplacements(normalizedMarkdown, replacements)
}

export function prepareMarkdownForMdxEditor(markdown: string): string {
  return prepareForMdxEditor(markdown, true)
}

export function restoreMarkdownFromMdxEditor(markdown: string): string {
  return restoreMarkedEscapedAngles(
    markdown.replace(MARKDOWN_MARKED_ENTITY_ANGLE_PLACEHOLDER_PATTERN, (raw, inner: string) => {
      const placeholder = `<${inner}>`
      return isMarkdownAnglePlaceholder(placeholder) ? placeholder : raw
    }),
  ).replaceAll(`${MARKDOWN_INSERTED_ANGLE_ESCAPE_MARKER}\\<`, "<")
}

export function prepareMdxForMdxEditor(mdx: string): string {
  const preparedMdx = prepareForMdxEditor(mdx, false)
  let tree: unknown
  try {
    tree = fromMarkdown(preparedMdx)
  } catch {
    return preparedMdx
  }

  const replacements: MarkdownReplacement[] = []
  collectHtmlCommentReplacements(tree, preparedMdx, replacements)
  if (replacements.length === 0) return preparedMdx

  return applyReplacements(preparedMdx, replacements)
}
