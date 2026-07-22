import {
  PROMPT_PART_TYPE_AGENT,
  PROMPT_PART_TYPE_SKILL,
  OPENCODE_REFERENCE_PART_TYPE,
  READING_SELECTION_PART_TYPE,
  RESOURCE_REFERENCE_PART_TYPE,
  SELECTION_CONTEXT_PART_TYPE,
  WORKSPACE_FILE_REFERENCE_PART_TYPE,
} from "./prompt-types"

const MAX_BREAKS = 200

function getStructuredPromptLength(node: Node): number | undefined {
  if (node.nodeType !== Node.ELEMENT_NODE) return undefined

  const element = node as HTMLElement
  if (
    element.dataset.type === READING_SELECTION_PART_TYPE ||
    element.dataset.type === SELECTION_CONTEXT_PART_TYPE
  ) {
    return `"${element.dataset.text ?? ""}"`.length
  }
  if (
    element.dataset.type === WORKSPACE_FILE_REFERENCE_PART_TYPE ||
    element.dataset.type === OPENCODE_REFERENCE_PART_TYPE ||
    element.dataset.type === PROMPT_PART_TYPE_AGENT ||
    element.dataset.type === PROMPT_PART_TYPE_SKILL ||
    element.dataset.type === RESOURCE_REFERENCE_PART_TYPE
  ) {
    // A pill's logical length is its serialized text (e.g. `@full/path`), which
    // can differ from what it renders (a short basename + icon). Prefer the
    // serialized form so cursor math stays correct regardless of the display.
    const serialized = element.dataset.serialized
    if (serialized !== undefined) return serialized.length
    return (element.textContent ?? "").replace(/\u200B/g, "").length
  }

  return undefined
}

export function createTextFragment(content: string): DocumentFragment {
  const fragment = document.createDocumentFragment()
  let breaks = 0

  for (const char of content) {
    if (char !== "\n") continue
    breaks += 1
    if (breaks <= MAX_BREAKS) continue

    const tailBreak = content.endsWith("\n")
    const text = tailBreak ? content.slice(0, -1) : content
    if (text) fragment.appendChild(document.createTextNode(text))
    if (tailBreak) fragment.appendChild(document.createElement("br"))
    return fragment
  }

  const segments = content.split("\n")
  segments.forEach((segment, index) => {
    if (segment) fragment.appendChild(document.createTextNode(segment))
    if (index < segments.length - 1) {
      fragment.appendChild(document.createElement("br"))
    }
  })

  return fragment
}

export function getNodeLength(node: Node): number {
  if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === "BR") return 1
  const structuredLength = getStructuredPromptLength(node)
  if (structuredLength !== undefined) return structuredLength
  return (node.textContent ?? "").replace(/\u200B/g, "").length
}

export function getTextLength(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE)
    return (node.textContent ?? "").replace(/\u200B/g, "").length
  if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === "BR") return 1
  const structuredLength = getStructuredPromptLength(node)
  if (structuredLength !== undefined) return structuredLength

  let length = 0
  for (const child of Array.from(node.childNodes)) {
    length += getTextLength(child)
  }

  return length
}

function getTextLengthToPosition(
  node: Node,
  target: Node,
  offset: number,
): { found: boolean; length: number } {
  if (node === target) {
    if (node.nodeType === Node.TEXT_NODE) {
      return {
        found: true,
        length: (node.textContent ?? "").slice(0, offset).replace(/\u200B/g, "").length,
      }
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      let length = 0
      const childLimit = Math.min(offset, node.childNodes.length)
      for (let index = 0; index < childLimit; index += 1) {
        const child = node.childNodes.item(index)
        if (child) length += getTextLength(child)
      }
      return { found: true, length }
    }

    return { found: true, length: 0 }
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return { found: false, length: getTextLength(node) }
  }

  let length = 0
  for (let index = 0; index < node.childNodes.length; index += 1) {
    const child = node.childNodes.item(index)
    if (!child) continue
    const result = getTextLengthToPosition(child, target, offset)
    length += result.length
    if (result.found) return { found: true, length }
  }

  return { found: false, length }
}

export function getCursorPosition(parent: HTMLElement): number {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return 0

  const range = selection.getRangeAt(0)
  if (!parent.contains(range.startContainer)) return 0

  const result = getTextLengthToPosition(parent, range.startContainer, range.startOffset)
  return result.found ? result.length : 0
}

export function setCursorPosition(parent: HTMLElement, position: number) {
  let remaining = position
  let node = parent.firstChild

  while (node) {
    const length = getNodeLength(node)
    const isText = node.nodeType === Node.TEXT_NODE
    const isStructured =
      node.nodeType === Node.ELEMENT_NODE &&
      ((node as HTMLElement).dataset.type === WORKSPACE_FILE_REFERENCE_PART_TYPE ||
        (node as HTMLElement).dataset.type === OPENCODE_REFERENCE_PART_TYPE ||
        (node as HTMLElement).dataset.type === PROMPT_PART_TYPE_AGENT ||
        (node as HTMLElement).dataset.type === PROMPT_PART_TYPE_SKILL ||
        (node as HTMLElement).dataset.type === RESOURCE_REFERENCE_PART_TYPE ||
        (node as HTMLElement).dataset.type === SELECTION_CONTEXT_PART_TYPE ||
        (node as HTMLElement).dataset.type === READING_SELECTION_PART_TYPE)
    const isBreak = node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === "BR"

    if (isText && remaining <= length) {
      const range = document.createRange()
      const selection = window.getSelection()
      range.setStart(node, remaining)
      range.collapse(true)
      selection?.removeAllRanges()
      selection?.addRange(range)
      return
    }

    if ((isStructured || isBreak) && remaining <= length) {
      const range = document.createRange()
      const selection = window.getSelection()

      if (remaining === 0) {
        range.setStartBefore(node)
      } else if (isStructured) {
        range.setStartAfter(node)
      } else {
        const next = node.nextSibling
        if (next && next.nodeType === Node.TEXT_NODE) {
          range.setStart(next, 0)
        } else {
          range.setStartAfter(node)
        }
      }

      range.collapse(true)
      selection?.removeAllRanges()
      selection?.addRange(range)
      return
    }

    remaining -= length
    node = node.nextSibling
  }

  const range = document.createRange()
  const selection = window.getSelection()
  const last = parent.lastChild

  if (last && last.nodeType === Node.TEXT_NODE) {
    range.setStart(last, last.textContent?.length ?? 0)
  } else {
    range.selectNodeContents(parent)
  }

  range.collapse(false)
  selection?.removeAllRanges()
  selection?.addRange(range)
}

export function setRangeEdge(
  parent: HTMLElement,
  range: Range,
  edge: "start" | "end",
  offset: number,
) {
  let remaining = offset

  for (const node of Array.from(parent.childNodes)) {
    const length = getNodeLength(node)
    const isText = node.nodeType === Node.TEXT_NODE
    const isStructured =
      node.nodeType === Node.ELEMENT_NODE &&
      ((node as HTMLElement).dataset.type === WORKSPACE_FILE_REFERENCE_PART_TYPE ||
        (node as HTMLElement).dataset.type === OPENCODE_REFERENCE_PART_TYPE ||
        (node as HTMLElement).dataset.type === PROMPT_PART_TYPE_AGENT ||
        (node as HTMLElement).dataset.type === PROMPT_PART_TYPE_SKILL ||
        (node as HTMLElement).dataset.type === RESOURCE_REFERENCE_PART_TYPE ||
        (node as HTMLElement).dataset.type === SELECTION_CONTEXT_PART_TYPE ||
        (node as HTMLElement).dataset.type === READING_SELECTION_PART_TYPE)
    const isBreak = node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === "BR"

    if (isText && remaining <= length) {
      if (edge === "start") range.setStart(node, remaining)
      if (edge === "end") range.setEnd(node, remaining)
      return
    }

    if ((isStructured || isBreak) && remaining <= length) {
      if (edge === "start" && remaining === 0) range.setStartBefore(node)
      if (edge === "start" && remaining > 0) range.setStartAfter(node)
      if (edge === "end" && remaining === 0) range.setEndBefore(node)
      if (edge === "end" && remaining > 0) range.setEndAfter(node)
      return
    }

    remaining -= length
  }
}
