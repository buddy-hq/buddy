import { createCitationTextSelector, findCitationText, type CitationTextSelector } from "./index"

const CONTROL_SELECTOR = "button, input, textarea, select, [role=button], [contenteditable]"
const EXCLUDED_SELECTOR = `${CONTROL_SELECTOR}, [hidden], [aria-hidden=true], script, style, template, noscript, svg`
const BLOCK_SELECTOR =
  "address, article, aside, blockquote, dd, div, dl, dt, figcaption, figure, footer, h1, h2, h3, h4, h5, h6, header, hr, li, main, nav, ol, p, pre, section, table, td, th, tr, ul"

type TextChunk = { node: Text; start: number; end: number }
type RenderedText = { text: string; chunks: TextChunk[] }

function isTextNode(node: Node): node is Text {
  return node.nodeType === node.TEXT_NODE
}

function isElementNode(node: Node): node is Element {
  return node.nodeType === node.ELEMENT_NODE
}

function readRenderedText(root: HTMLElement): RenderedText {
  const parts: string[] = []
  const chunks: TextChunk[] = []
  let length = 0
  let separator = false
  const visit = (node: Node) => {
    if (isTextNode(node)) {
      const text = node
      if (!text.length) return
      if (separator && length > 0) {
        parts.push("\n")
        length += 1
      }
      separator = false
      chunks.push({ node: text, start: length, end: length + text.length })
      parts.push(text.data)
      length += text.length
      return
    }
    if (!isElementNode(node)) return
    const element = node
    if (element !== root && element.matches(EXCLUDED_SELECTOR)) return
    const block = element.matches(BLOCK_SELECTOR)
    if (block || element.tagName === "BR") separator = true
    for (const child of element.childNodes) visit(child)
    if (block) separator = true
  }
  visit(root)
  return { text: parts.join(""), chunks }
}

function excludedAncestor(root: HTMLElement, node: Node): Element | null {
  const element = isElementNode(node) ? node : node.parentElement
  const excluded = element?.closest(EXCLUDED_SELECTOR)
  return excluded && excluded !== root ? excluded : null
}

function selectedBoundary(range: Range, node: Node, last: boolean): Text | null {
  if (!range.intersectsNode(node)) return null
  if (isTextNode(node)) {
    const text = node
    const start = node === range.startContainer ? range.startOffset : 0
    const end = node === range.endContainer ? range.endOffset : text.length
    return start < end ? text : null
  }
  for (
    let child = last ? node.lastChild : node.firstChild;
    child;
    child = last ? child.previousSibling : child.nextSibling
  ) {
    const boundary = selectedBoundary(range, child, last)
    if (boundary) return boundary
  }
  return null
}

type RenderedTextCapture = { excerpt: string; selector: CitationTextSelector; range: Range }

type SelectedRenderedText = {
  stream: RenderedText
  range: Range
  rawStart: number
  rawEnd: number
}

function captureRenderedTextSpan(
  selected: SelectedRenderedText,
  rawStart: number,
  rawEnd: number,
): RenderedTextCapture | undefined {
  const selector = createCitationTextSelector(selected.stream.text, rawStart, rawEnd)
  if (!selector) return undefined
  return { excerpt: selected.stream.text.slice(rawStart, rawEnd), selector, range: selected.range }
}

/** Capture exact rendered text and a drift-tolerant selector from one source element. */
export function captureRenderedTextSelection(
  root: HTMLElement,
  selection: Selection | null,
): RenderedTextCapture | undefined {
  const selected = readSelectedRenderedText(root, selection)
  return selected
    ? captureRenderedTextSpan(selected, selected.rawStart, selected.rawEnd)
    : undefined
}

export function captureTrimmedRenderedTextSelection(
  root: HTMLElement,
  selection: Selection | null,
): RenderedTextCapture | undefined {
  const selected = readSelectedRenderedText(root, selection)
  if (!selected) return undefined
  const text = selected.stream.text
  let rawStart = selected.rawStart
  let rawEnd = selected.rawEnd
  while (rawStart < rawEnd && /\s/u.test(text[rawStart] ?? "")) rawStart += 1
  while (rawEnd > rawStart && /\s/u.test(text[rawEnd - 1] ?? "")) rawEnd -= 1
  return captureRenderedTextSpan(selected, rawStart, rawEnd)
}

function readSelectedRenderedText(
  root: HTMLElement,
  selection: Selection | null,
): SelectedRenderedText | undefined {
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return undefined
  const range = selection.getRangeAt(0).cloneRange()
  const first = selectedBoundary(range, range.commonAncestorContainer, false)
  const last = selectedBoundary(range, range.commonAncestorContainer, true)
  if (!first || !last || !root.contains(first) || !root.contains(last)) return undefined
  range.setStart(first, first === range.startContainer ? range.startOffset : 0)
  range.setEnd(last, last === range.endContainer ? range.endOffset : last.length)
  if (excludedAncestor(root, range.startContainer) || excludedAncestor(root, range.endContainer)) {
    return undefined
  }

  const stream = readRenderedText(root)
  let rawStart: number | undefined
  let rawEnd = 0
  for (const chunk of stream.chunks) {
    if (!range.intersectsNode(chunk.node)) continue
    const start = range.startContainer === chunk.node ? range.startOffset : 0
    const end = range.endContainer === chunk.node ? range.endOffset : chunk.node.length
    if (start === end) continue
    rawStart ??= chunk.start + start
    rawEnd = chunk.start + end
  }
  if (rawStart === undefined) return undefined
  return { stream, range, rawStart, rawEnd }
}

function rawTextOffset(text: string, normalizedOffset: number): number {
  let offset = 0
  for (const match of text.matchAll(/\s+|\S+/gu)) {
    const whitespace = /\s/u.test(match[0][0] ?? "")
    const length = whitespace ? 1 : match[0].length
    if (normalizedOffset <= offset + length) {
      return (
        match.index +
        (whitespace && normalizedOffset > offset ? match[0].length : normalizedOffset - offset)
      )
    }
    offset += length
  }
  return text.length
}

/** Resolve a saved selector back to a DOM range without changing native selection. */
export function resolveRenderedTextRange(
  root: HTMLElement,
  excerpt: string,
  selector: CitationTextSelector,
): Range | undefined {
  const stream = readRenderedText(root)
  const match = findCitationText(stream.text, excerpt, selector)
  if (!match) return undefined
  const start = rawTextOffset(stream.text, match.start)
  const end = rawTextOffset(stream.text, match.end)
  const first = stream.chunks.find((chunk) => chunk.end > start)
  const last = stream.chunks.findLast((chunk) => chunk.start < end)
  if (!first || !last) return undefined
  const range = root.ownerDocument.createRange()
  range.setStart(first.node, Math.max(0, start - first.start))
  range.setEnd(last.node, Math.min(last.node.length, end - last.start))
  return range
}
