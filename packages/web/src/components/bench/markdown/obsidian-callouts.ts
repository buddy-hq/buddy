const OBSIDIAN_CALLOUT_START_PATTERN = /^(\s*)>\s*\[!([a-z0-9_-]+)\]([+-]?)(?:\s+(.*))?$/iu
const OBSIDIAN_CALLOUT_BODY_PATTERN = /^(\s*)>(?:\s?(.*))?$/u
const OBSIDIAN_CALLOUT_DIRECTIVE_START_PATTERN = /^(\s*)(:{3,})obsidian-callout(?:\{(.*)\})?$/u
const OBSIDIAN_CALLOUT_DIRECTIVE_END_PATTERN = /^(\s*)(:{3,})\s*$/u
const DIRECTIVE_FENCE_PREFIX_PATTERN = /^[\t ]*(:+)/u
const MINIMUM_DIRECTIVE_FENCE_LENGTH = 3
const OBSIDIAN_CALLOUT_ATTRIBUTE_PATTERN = /([a-z]+)=(?:"([^"]*)"|'([^']*)')/giu
const DIRECTIVE_ATTRIBUTE_CHARACTER_REFERENCE_PATTERN = /&(?:amp|quot|#x([0-9a-f]+)|#([0-9]+));/giu
const HIGHEST_UNICODE_CODE_POINT = 0x10ffff
const MARKDOWN_FENCE_START_PATTERN = /^[\t ]*(`{3,}|~{3,})[^\r\n]*$/u
const MARKDOWN_FRONTMATTER_START_PATTERN = /^\uFEFF?---[\t ]*$/u
const MARKDOWN_FRONTMATTER_END_PATTERN = /^---[\t ]*$/u
const MARKDOWN_BLANK_LINE_PATTERN = /^[\t ]*$/u
const MARKDOWN_CONTAINER_PREFIX_PATTERN = /^ {0,3}(?:>[\t ]?|(?:[-+*]|\d{1,9}[.)])(?:[\t ]+|$))/u
const MARKDOWN_THEMATIC_BREAK_PATTERN =
  /^ {0,3}(?:(?:\*[\t ]*){3,}|(?:-[\t ]*){3,}|(?:_[\t ]*){3,})$/u
const MARKDOWN_ATX_HEADING_PATTERN = /^ {0,3}#{1,6}(?:[\t ]|$)/u
const MARKDOWN_SETEXT_UNDERLINE_PATTERN = /^ {0,3}=+[\t ]*$/u
const MARKDOWN_HTML_BLOCK_START_PATTERN =
  /^ {0,3}<(?:(?:pre|script|style|textarea)(?:[\t >]|$)|!--|\?|![a-z]|!\[CDATA\[|\/?(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?:[\t >]|\/>|$))/iu
const MARKDOWN_HTML_TAG_LINE_PATTERN =
  /^ {0,3}(?:<[a-z][a-z0-9-]*(?:[\t ][^<>]*)?\/?>|<\/[a-z][a-z0-9-]*[\t ]*>)[\t ]*$/iu
const MARKDOWN_MATH_FENCE_PATTERN = /^ {0,3}\$\$/u
const MARKDOWN_DIRECTIVE_FENCE_PATTERN = /^ {0,3}:{3,}/u
const MARKDOWN_FOOTNOTE_DEFINITION_PATTERN = /^ {0,3}\[\^[^\]\s]+\]:/u
const MARKDOWN_LIST_ITEM_INTERRUPT_PATTERN = /^ {0,3}(?:[-+*]|0{0,8}1[.)])(?:[\t ]|$)/u
const MARKDOWN_INDENTED_CODE_PATTERN = /^(?: {4}|\t)/u
const MARKDOWN_PARAGRAPH_INTERRUPT_PATTERNS = [
  MARKDOWN_ATX_HEADING_PATTERN,
  MARKDOWN_THEMATIC_BREAK_PATTERN,
  MARKDOWN_HTML_BLOCK_START_PATTERN,
  MARKDOWN_MATH_FENCE_PATTERN,
  MARKDOWN_DIRECTIVE_FENCE_PATTERN,
  MARKDOWN_FOOTNOTE_DEFINITION_PATTERN,
]

type MarkdownSourceLine = {
  content: string
  ending: string
}

type CalloutQuoteState = {
  fence: string | undefined
  htmlBlock: boolean
  paragraph: boolean
}

const CALLOUT_TITLE_LINE_STATE: CalloutQuoteState = {
  fence: undefined,
  htmlBlock: false,
  paragraph: true,
}

type ObsidianCalloutAttributes = {
  fold?: string
  kind: string
  title?: string
}

function splitMarkdownSource(markdown: string): MarkdownSourceLine[] {
  if (markdown.length === 0) return [{ content: "", ending: "" }]

  const lines: MarkdownSourceLine[] = []
  let start = 0
  while (start < markdown.length) {
    let end = start
    while (end < markdown.length && markdown[end] !== "\r" && markdown[end] !== "\n") {
      end += 1
    }

    if (end === markdown.length) {
      lines.push({ content: markdown.slice(start), ending: "" })
      break
    }

    const ending =
      markdown[end] === "\r" && markdown[end + 1] === "\n" ? "\r\n" : (markdown[end] ?? "")
    lines.push({ content: markdown.slice(start, end), ending })
    start = end + ending.length
  }
  return lines
}

function isFenceEnd(content: string, marker: string): boolean {
  const trimmed = content.trim()
  if (trimmed.length < marker.length) return false
  return Array.from(trimmed).every((character) => character === marker[0])
}

function protectedMarkdownLineIndexes(
  lines: readonly MarkdownSourceLine[],
  hasFrontmatter: boolean,
): ReadonlySet<number> {
  const protectedIndexes = new Set<number>()
  if (hasFrontmatter && MARKDOWN_FRONTMATTER_START_PATTERN.test(lines[0]?.content ?? "")) {
    const end = lines.findIndex(
      (line, index) => index > 0 && MARKDOWN_FRONTMATTER_END_PATTERN.test(line.content),
    )
    if (end > 0) {
      for (let index = 0; index <= end; index += 1) protectedIndexes.add(index)
    }
  }

  let activeFence: string | undefined
  for (let index = 0; index < lines.length; index += 1) {
    if (protectedIndexes.has(index)) continue
    const content = lines[index]?.content ?? ""
    if (activeFence) {
      protectedIndexes.add(index)
      if (isFenceEnd(content, activeFence)) activeFence = undefined
      continue
    }

    const marker = MARKDOWN_FENCE_START_PATTERN.exec(content)?.[1]
    if (!marker) continue
    protectedIndexes.add(index)
    activeFence = marker
  }

  return protectedIndexes
}

function preferredLineEnding(lines: readonly MarkdownSourceLine[]): string {
  return lines.find((line) => line.ending.length > 0)?.ending ?? "\n"
}

function renderReplacementBlock(input: {
  lines: readonly MarkdownSourceLine[]
  start: number
  end: number
  contents: readonly string[]
}): string {
  const internalEnding =
    input.lines.slice(input.start, input.end + 1).find((line) => line.ending.length > 0)?.ending ??
    preferredLineEnding(input.lines)
  const trailingEnding = input.lines[input.end]?.ending ?? ""
  return input.contents
    .map((content, index) => {
      const ending = index === input.contents.length - 1 ? trailingEnding : internalEnding
      return `${content}${ending}`
    })
    .join("")
}

function encodeDirectiveAttributeValue(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;")
}

function decodeDirectiveAttributeValue(value: string): string {
  return value.replace(
    DIRECTIVE_ATTRIBUTE_CHARACTER_REFERENCE_PATTERN,
    (reference: string, hexadecimal: string | undefined, decimal: string | undefined) => {
      const named = reference.toLowerCase()
      if (named === "&amp;") return "&"
      if (named === "&quot;") return '"'
      const codePoint = hexadecimal
        ? Number.parseInt(hexadecimal, 16)
        : Number.parseInt(decimal ?? "", 10)
      return codePoint > 0 && codePoint <= HIGHEST_UNICODE_CODE_POINT
        ? String.fromCodePoint(codePoint)
        : reference
    },
  )
}

function directiveAttribute(name: string, value: string | undefined): string | undefined {
  return value === undefined || value.length === 0
    ? undefined
    : `${name}="${encodeDirectiveAttributeValue(value)}"`
}

function renderDirectiveStart(attributes: ObsidianCalloutAttributes, fence: string): string {
  const serialized = [
    directiveAttribute("kind", attributes.kind),
    directiveAttribute("fold", attributes.fold),
    directiveAttribute("title", attributes.title),
  ].filter((value): value is string => value !== undefined)
  return `${fence}obsidian-callout{${serialized.join(" ")}}`
}

function parseDirectiveAttributes(
  source: string | undefined,
): ObsidianCalloutAttributes | undefined {
  if (!source) return undefined
  const attributes = new Map<string, string>()
  for (const match of source.matchAll(OBSIDIAN_CALLOUT_ATTRIBUTE_PATTERN)) {
    const name = match[1]
    const rawValue = match[2] ?? match[3]
    if (!name || rawValue === undefined) continue
    attributes.set(name, decodeDirectiveAttributeValue(rawValue))
  }
  const kind = attributes.get("kind")
  if (!kind) return undefined
  const fold = attributes.get("fold")
  const title = attributes.get("title")
  return Object.assign({ kind }, fold ? { fold } : undefined, title ? { title } : undefined)
}

function calloutFence(bodyLines: readonly string[]): string {
  const longestBodyFence = bodyLines.reduce(
    (longest, bodyLine) =>
      Math.max(longest, DIRECTIVE_FENCE_PREFIX_PATTERN.exec(bodyLine)?.[1]?.length ?? 0),
    0,
  )
  return ":".repeat(Math.max(MINIMUM_DIRECTIVE_FENCE_LENGTH, longestBodyFence + 1))
}

function findCalloutDirectiveEnd(input: {
  lines: readonly MarkdownSourceLine[]
  protectedIndexes: ReadonlySet<number>
  start: number
  indent: string
  fenceLength: number
}): number | undefined {
  let firstProtectedEnd: number | undefined
  for (let index = input.start + 1; index < input.lines.length; index += 1) {
    const end = OBSIDIAN_CALLOUT_DIRECTIVE_END_PATTERN.exec(input.lines[index]?.content ?? "")
    if (!end || (end[1] ?? "") !== input.indent || (end[2] ?? "").length !== input.fenceLength) {
      continue
    }
    if (!input.protectedIndexes.has(index)) return index
    if (firstProtectedEnd === undefined) firstProtectedEnd = index
  }
  return firstProtectedEnd
}

function quoteLeafLine(line: string): string {
  const container = MARKDOWN_CONTAINER_PREFIX_PATTERN.exec(line)
  if (!container || MARKDOWN_THEMATIC_BREAK_PATTERN.test(line)) return line
  return quoteLeafLine(line.slice(container[0].length))
}

function interruptsParagraph(line: string): boolean {
  return MARKDOWN_PARAGRAPH_INTERRUPT_PATTERNS.some((pattern) => pattern.test(line))
}

function advanceCalloutQuoteState(state: CalloutQuoteState, line: string): CalloutQuoteState {
  const leaf = quoteLeafLine(line)
  if (state.fence) {
    return {
      fence: isFenceEnd(leaf, state.fence) ? undefined : state.fence,
      htmlBlock: false,
      paragraph: false,
    }
  }
  if (MARKDOWN_BLANK_LINE_PATTERN.test(leaf)) {
    return { fence: undefined, htmlBlock: false, paragraph: false }
  }
  if (state.htmlBlock) return state

  const fence = MARKDOWN_FENCE_START_PATTERN.exec(leaf)?.[1]
  if (fence) return { fence, htmlBlock: false, paragraph: false }

  const htmlBlock =
    MARKDOWN_HTML_BLOCK_START_PATTERN.test(leaf) ||
    (!state.paragraph && MARKDOWN_HTML_TAG_LINE_PATTERN.test(leaf))
  const paragraph =
    !htmlBlock &&
    !interruptsParagraph(leaf) &&
    !MARKDOWN_SETEXT_UNDERLINE_PATTERN.test(leaf) &&
    (state.paragraph || !MARKDOWN_INDENTED_CODE_PATTERN.test(leaf))
  return { fence: undefined, htmlBlock, paragraph }
}

function continuesCalloutParagraph(state: CalloutQuoteState, line: string): boolean {
  return (
    state.paragraph &&
    !MARKDOWN_BLANK_LINE_PATTERN.test(line) &&
    !interruptsParagraph(line) &&
    !MARKDOWN_LIST_ITEM_INTERRUPT_PATTERN.test(line)
  )
}

function prepareCalloutSource(markdown: string, hasFrontmatter: boolean): string {
  const lines = splitMarkdownSource(markdown)
  const protectedIndexes = protectedMarkdownLineIndexes(lines, hasFrontmatter)
  const output: string[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? { content: "", ending: "" }
    if (protectedIndexes.has(index)) {
      output.push(`${line.content}${line.ending}`)
      continue
    }
    const start = OBSIDIAN_CALLOUT_START_PATTERN.exec(line.content)
    if (!start) {
      output.push(`${line.content}${line.ending}`)
      continue
    }

    const indent = start[1] ?? ""
    const kind = start[2] ?? "note"
    const fold = start[3] || undefined
    const title = start[4]?.trim() || undefined
    const body: string[] = []
    const blockStart = index
    let quoteState = CALLOUT_TITLE_LINE_STATE

    while (index + 1 < lines.length) {
      if (protectedIndexes.has(index + 1)) break
      const candidate = lines[index + 1]?.content ?? ""
      const bodyMatch = OBSIDIAN_CALLOUT_BODY_PATTERN.exec(candidate)
      if (bodyMatch) {
        if ((bodyMatch[1] ?? "") !== indent) break
        const bodyLine = bodyMatch[2] ?? ""
        body.push(bodyLine)
        quoteState = advanceCalloutQuoteState(quoteState, bodyLine)
      } else if (continuesCalloutParagraph(quoteState, candidate)) {
        body.push(candidate.trimStart())
      } else {
        break
      }
      index += 1
    }

    const preparedBody =
      body.length > 0 ? prepareCalloutSource(body.join("\n"), false).split("\n") : []
    const fence = calloutFence(preparedBody)
    output.push(
      renderReplacementBlock({
        lines,
        start: blockStart,
        end: index,
        contents: [
          `${indent}${renderDirectiveStart({ kind, fold, title }, fence)}`,
          ...preparedBody.map((bodyLine) => `${indent}${bodyLine}`),
          `${indent}${fence}`,
        ],
      }),
    )
  }

  return output.join("")
}

export function prepareObsidianCalloutsForMdxEditor(markdown: string): string {
  return prepareCalloutSource(markdown, true)
}

function restoreCalloutSource(markdown: string, hasFrontmatter: boolean): string {
  const lines = splitMarkdownSource(markdown)
  const protectedIndexes = protectedMarkdownLineIndexes(lines, hasFrontmatter)
  const output: string[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? { content: "", ending: "" }
    if (protectedIndexes.has(index)) {
      output.push(`${line.content}${line.ending}`)
      continue
    }
    const start = OBSIDIAN_CALLOUT_DIRECTIVE_START_PATTERN.exec(line.content)
    const indent = start?.[1] ?? ""
    const attributes = parseDirectiveAttributes(start?.[3])
    if (!start || !attributes) {
      output.push(`${line.content}${line.ending}`)
      continue
    }

    const blockEnd = findCalloutDirectiveEnd({
      lines,
      protectedIndexes,
      start: index,
      indent,
      fenceLength: (start[2] ?? "").length,
    })
    if (blockEnd === undefined) {
      output.push(`${line.content}${line.ending}`)
      continue
    }

    const body = lines
      .slice(index + 1, blockEnd)
      .map((bodyLine) =>
        bodyLine.content.startsWith(indent)
          ? bodyLine.content.slice(indent.length)
          : bodyLine.content,
      )
    const restoredBody =
      body.length > 0 ? restoreCalloutSource(body.join("\n"), false).split("\n") : []
    const marker = `[!${attributes.kind}]${attributes.fold ?? ""}`
    output.push(
      renderReplacementBlock({
        lines,
        start: index,
        end: blockEnd,
        contents: [
          `${indent}> ${marker}${attributes.title ? ` ${attributes.title}` : ""}`,
          ...restoredBody.map((bodyLine) => (bodyLine ? `${indent}> ${bodyLine}` : `${indent}>`)),
        ],
      }),
    )
    index = blockEnd
  }

  return output.join("")
}

export function restoreObsidianCalloutsFromMdxEditor(markdown: string): string {
  return restoreCalloutSource(markdown, true)
}
