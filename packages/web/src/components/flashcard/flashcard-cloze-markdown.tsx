import { useCallback, useMemo, type ReactNode } from "react"
import { Markdown } from "@/components/markdown/Markdown"
import { parseClozeText, type FlashcardClozeSegment } from "./flashcard-card-content"

const CLOZE_BOUNDARY_OPEN = "\uE000buddy-cloze-"
const CLOZE_BOUNDARY_CLOSE = "\uE001"

type ClozeBoundary = {
  kind: "inline" | "block"
  start: string
  end: string
}

type PreparedClozeMarkdown = {
  boundaries: ClozeBoundary[]
  markdown: string
}

type TextPoint = {
  node: Text
  offset: number
}

function clozeBoundary(kind: "start" | "end", index: number): string {
  return `${CLOZE_BOUNDARY_OPEN}${kind}-${index}${CLOZE_BOUNDARY_CLOSE}`
}

function linePrefixIsWhitespace(segment: FlashcardClozeSegment | undefined): boolean {
  if (!segment) return true
  if (segment.kind !== "text") return false
  return /^[\t ]*(?:\r\n|\r|\n|$)/u.test(segment.text)
}

function lineSuffixIsWhitespace(segment: FlashcardClozeSegment | undefined): boolean {
  if (!segment) return true
  if (segment.kind !== "text") return false
  return /(?:^|\r\n|\r|\n)[\t ]*$/u.test(segment.text)
}

function isLineIsolatedCloze(
  segments: readonly FlashcardClozeSegment[],
  index: number,
): boolean {
  return (
    lineSuffixIsWhitespace(segments[index - 1]) &&
    linePrefixIsWhitespace(segments[index + 1])
  )
}

function prepareClozeMarkdown(text: string, ordinal: number): PreparedClozeMarkdown {
  const boundaries: ClozeBoundary[] = []
  const segments = parseClozeText(text)
  const markdown = segments
    .map((segment, index) => {
      if (segment.kind === "text" || segment.ordinal !== ordinal) {
        return segment.kind === "text" ? segment.text : segment.answer
      }

      const boundary: ClozeBoundary = {
        kind: isLineIsolatedCloze(segments, index) ? "block" : "inline",
        start: clozeBoundary("start", boundaries.length),
        end: clozeBoundary("end", boundaries.length),
      }
      boundaries.push(boundary)
      return boundary.kind === "block"
        ? `${boundary.start}\n\n${segment.answer}\n\n${boundary.end}`
        : `${boundary.start}${segment.answer}${boundary.end}`
    })
    .join("")

  return { boundaries, markdown }
}

function textPointAt(root: HTMLElement, targetOffset: number): TextPoint | undefined {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let consumed = 0

  for (let current = walker.nextNode(); current; current = walker.nextNode()) {
    if (!(current instanceof Text)) continue
    const nextConsumed = consumed + current.data.length
    if (targetOffset <= nextConsumed) {
      return { node: current, offset: targetOffset - consumed }
    }
    consumed = nextConsumed
  }
}

function removeFragmentTextEdge(
  fragment: DocumentFragment,
  count: number,
  edge: "start" | "end",
): void {
  const walker = fragment.ownerDocument.createTreeWalker(fragment, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  for (let current = walker.nextNode(); current; current = walker.nextNode()) {
    if (current instanceof Text) nodes.push(current)
  }
  if (edge === "end") nodes.reverse()

  let remaining = count
  for (const node of nodes) {
    if (remaining === 0) return
    const removed = Math.min(remaining, node.data.length)
    if (edge === "start") {
      node.deleteData(0, removed)
    } else {
      node.deleteData(node.data.length - removed, removed)
    }
    remaining -= removed
  }
}

function createInlineClozeElement(content: DocumentFragment, revealed: boolean): HTMLSpanElement {
  const cloze = content.ownerDocument.createElement("span")
  cloze.dataset.component = "flashcard-cloze"
  cloze.dataset.clozeState = revealed ? "revealed" : "hidden"
  cloze.className = revealed
    ? "mx-0.5 inline-block border-b-2 border-border-interactive-base align-baseline text-text-interactive-base"
    : "relative mx-0.5 inline-block border-b-2 border-border-strong-base align-baseline"

  if (revealed) {
    cloze.appendChild(content)
    return cloze
  }

  const invisibleAnswer = content.ownerDocument.createElement("span")
  invisibleAnswer.className = "invisible"
  invisibleAnswer.setAttribute("aria-hidden", "true")
  invisibleAnswer.appendChild(content)
  cloze.appendChild(invisibleAnswer)
  return cloze
}

function directRenderedChildContaining(
  root: HTMLElement,
  marker: string,
): Element | undefined {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let current = walker.nextNode(); current; current = walker.nextNode()) {
    if (!(current instanceof Text) || current.data !== marker) continue
    let element = current.parentElement
    while (element?.parentElement && element.parentElement !== root) {
      element = element.parentElement
    }
    if (element?.parentElement === root) return element
  }
}

function createBlockClozeElement(content: DocumentFragment, revealed: boolean): HTMLDivElement {
  const cloze = content.ownerDocument.createElement("div")
  cloze.dataset.component = "flashcard-cloze"
  cloze.dataset.clozeState = revealed ? "revealed" : "hidden"
  cloze.className = revealed
    ? "my-1 border-b-2 border-border-interactive-base text-text-interactive-base"
    : "my-1 border-b-2 border-border-strong-base"

  const body = content.ownerDocument.createElement("div")
  if (!revealed) {
    body.className = "invisible"
    body.setAttribute("aria-hidden", "true")
  }
  body.appendChild(content)
  cloze.appendChild(body)
  return cloze
}

function decorateBlockCloze(
  root: HTMLElement,
  boundary: ClozeBoundary,
  revealed: boolean,
): void {
  const start = directRenderedChildContaining(root, boundary.start)
  const end = directRenderedChildContaining(root, boundary.end)
  if (!start || !end || start.parentElement !== root || end.parentElement !== root) return

  const content = root.ownerDocument.createDocumentFragment()
  let current = start.nextSibling
  while (current && current !== end) {
    const next = current.nextSibling
    content.appendChild(current)
    current = next
  }
  if (current !== end) return

  start.replaceWith(createBlockClozeElement(content, revealed))
  end.remove()
}

function decorateInlineCloze(
  root: HTMLElement,
  boundary: ClozeBoundary,
  revealed: boolean,
): void {
  const text = root.textContent ?? ""
  const startOffset = text.indexOf(boundary.start)
  if (startOffset < 0) return
  const endOffset = text.indexOf(boundary.end, startOffset + boundary.start.length)
  if (endOffset < 0) return

  const start = textPointAt(root, startOffset)
  const end = textPointAt(root, endOffset + boundary.end.length)
  if (!start || !end) return

  const range = root.ownerDocument.createRange()
  range.setStart(start.node, start.offset)
  range.setEnd(end.node, end.offset)
  const content = range.extractContents()
  removeFragmentTextEdge(content, boundary.start.length, "start")
  removeFragmentTextEdge(content, boundary.end.length, "end")
  range.insertNode(createInlineClozeElement(content, revealed))
}

function decorateClozeMarkdown(
  root: HTMLElement,
  boundaries: readonly ClozeBoundary[],
  revealed: boolean,
): void {
  for (const boundary of boundaries) {
    if (boundary.kind === "block") {
      decorateBlockCloze(root, boundary, revealed)
    } else {
      decorateInlineCloze(root, boundary, revealed)
    }
  }
}

export function ClozeMarkdown(props: {
  text: string
  ordinal: number
  revealed: boolean
  className?: string
}): ReactNode {
  const prepared = useMemo(
    () => prepareClozeMarkdown(props.text, props.ordinal),
    [props.ordinal, props.text],
  )
  const decorateRenderedRoot = useCallback(
    (root: HTMLDivElement) => decorateClozeMarkdown(root, prepared.boundaries, props.revealed),
    [prepared.boundaries, props.revealed],
  )

  return (
    <Markdown
      text={prepared.markdown}
      className={props.className}
      decorateRenderedRoot={decorateRenderedRoot}
    />
  )
}
