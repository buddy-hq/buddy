import { createTextFragment } from "./editor-dom"
import {
  PROMPT_PART_TYPE_AGENT,
  PROMPT_PART_TYPE_TEXT,
  RESOURCE_REFERENCE_PART_TYPE,
  WORKSPACE_FILE_REFERENCE_PART_TYPE,
  type PromptAgentPart,
  type PromptComposerPart,
  type PromptTextPart,
  type PromptResourceReferencePart,
  type PromptWorkspaceFileReferencePart,
} from "./prompt-types"

const MENTION_REGEX = /(^|\s)(@(\S+))/g
const ZERO_WIDTH_SPACE = "\u200B"
const BLOCK_TAG_NAMES = new Set(["DIV", "P"])

function normalizeTextBuffer(value: string) {
  return value.replace(new RegExp(ZERO_WIDTH_SPACE, "g"), "")
}

function createTextPart(text: string): PromptTextPart {
  return {
    type: PROMPT_PART_TYPE_TEXT,
    text,
  }
}

function createAgentPart(name: string): PromptAgentPart {
  return {
    type: PROMPT_PART_TYPE_AGENT,
    name,
  }
}

function createWorkspaceFileReferencePart(path: string): PromptWorkspaceFileReferencePart {
  return {
    type: WORKSPACE_FILE_REFERENCE_PART_TYPE,
    path,
  }
}

function createResourceReferencePart(key: string): PromptResourceReferencePart {
  return {
    type: RESOURCE_REFERENCE_PART_TYPE,
    key,
  }
}

function appendTextPart(parts: PromptComposerPart[], text: string) {
  if (!text) return
  const last = parts[parts.length - 1]
  if (last && last.type === PROMPT_PART_TYPE_TEXT) {
    last.text += text
    return
  }
  parts.push(createTextPart(text))
}

export function clonePromptParts(parts: PromptComposerPart[]): PromptComposerPart[] {
  return parts.map((part) => {
    if (part.type === PROMPT_PART_TYPE_TEXT) {
      return createTextPart(part.text)
    }

    if (part.type === PROMPT_PART_TYPE_AGENT) {
      return createAgentPart(part.name)
    }

    if (part.type === RESOURCE_REFERENCE_PART_TYPE) {
      return createResourceReferencePart(part.key)
    }

    return createWorkspaceFileReferencePart(part.path)
  })
}

export function extractWorkspaceFileReferenceParts(
  parts: PromptComposerPart[],
): PromptWorkspaceFileReferencePart[] {
  return parts.flatMap((part) => {
    if (part.type !== WORKSPACE_FILE_REFERENCE_PART_TYPE) return []
    return [createWorkspaceFileReferencePart(part.path)]
  })
}

export function extractResourceReferenceParts(
  parts: PromptComposerPart[],
): PromptResourceReferencePart[] {
  return parts.flatMap((part) => {
    if (part.type !== RESOURCE_REFERENCE_PART_TYPE) return []
    return [createResourceReferencePart(part.key)]
  })
}

export function createPromptPartsFromValue(
  value: string,
  knownAgents: Set<string>,
): PromptComposerPart[] {
  if (!value) return []

  const parts: PromptComposerPart[] = []
  let cursor = 0
  MENTION_REGEX.lastIndex = 0

  while (true) {
    const match = MENTION_REGEX.exec(value)
    if (!match) break

    const leadingWhitespace = match[1] ?? ""
    const token = match[2] ?? ""
    const mentionValue = match[3] ?? ""
    const triggerIndex = match.index + leadingWhitespace.length

    if (triggerIndex > cursor) {
      appendTextPart(parts, value.slice(cursor, triggerIndex))
    }

    if (knownAgents.has(mentionValue)) {
      parts.push(createAgentPart(mentionValue))
    } else {
      appendTextPart(parts, token)
    }

    cursor = triggerIndex + token.length
  }

  if (cursor < value.length) {
    appendTextPart(parts, value.slice(cursor))
  }

  return parts
}

export function serializePromptParts(parts: PromptComposerPart[]): string {
  return parts
    .map((part) => {
      if (part.type === PROMPT_PART_TYPE_TEXT) return part.text
      if (part.type === PROMPT_PART_TYPE_AGENT) return `@${part.name}`
      if (part.type === RESOURCE_REFERENCE_PART_TYPE) return `resource:${part.key}`
      return `@${part.path}`
    })
    .join("")
}

export function collectPromptParts(root: HTMLElement): PromptComposerPart[] {
  let buffer = ""
  const parts: PromptComposerPart[] = []

  const flush = () => {
    const text = normalizeTextBuffer(buffer)
    buffer = ""
    if (!text) return
    appendTextPart(parts, text)
  }

  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      buffer += node.textContent ?? ""
      return
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return
    const element = node as HTMLElement

    if (element.dataset.type === PROMPT_PART_TYPE_AGENT) {
      flush()
      const name = element.dataset.name
      if (name) {
        parts.push(createAgentPart(name))
      }
      return
    }

    if (element.dataset.type === WORKSPACE_FILE_REFERENCE_PART_TYPE) {
      flush()
      const path = element.dataset.path
      if (path) {
        parts.push(createWorkspaceFileReferencePart(path))
      }
      return
    }

    if (element.dataset.type === RESOURCE_REFERENCE_PART_TYPE) {
      flush()
      const key = element.dataset.key
      if (key) {
        parts.push(createResourceReferencePart(key))
      }
      return
    }

    if (element.tagName === "BR") {
      buffer += "\n"
      return
    }

    const children = Array.from(element.childNodes)
    children.forEach((child, index) => {
      visit(child)
      const isBlock =
        child.nodeType === Node.ELEMENT_NODE && BLOCK_TAG_NAMES.has((child as HTMLElement).tagName)
      if (isBlock && index < children.length - 1) {
        buffer += "\n"
      }
    })
  }

  Array.from(root.childNodes).forEach((child, index, siblings) => {
    visit(child)
    const isBlock =
      child.nodeType === Node.ELEMENT_NODE && BLOCK_TAG_NAMES.has((child as HTMLElement).tagName)
    if (isBlock && index < siblings.length - 1) {
      buffer += "\n"
    }
  })

  flush()
  return parts
}

export function renderPromptParts(root: HTMLElement, parts: PromptComposerPart[]) {
  root.replaceChildren()

  for (const part of parts) {
    if (part.type === PROMPT_PART_TYPE_TEXT) {
      if (part.text) {
        root.appendChild(createTextFragment(part.text))
      }
      continue
    }

    const pill = document.createElement("span")
    pill.className =
      "mx-0.5 inline-flex max-w-full items-center rounded-md border border-border-base/70 bg-surface-weak px-1.5 py-0.5 text-xs font-medium text-text-base"
    pill.setAttribute("contenteditable", "false")
    pill.dataset.type = part.type

    if (part.type === PROMPT_PART_TYPE_AGENT) {
      pill.textContent = `@${part.name}`
      pill.dataset.name = part.name
    } else if (part.type === RESOURCE_REFERENCE_PART_TYPE) {
      pill.textContent = `resource:${part.key}`
      pill.dataset.key = part.key
    } else {
      pill.textContent = `@${part.path}`
      pill.dataset.path = part.path
    }

    root.appendChild(pill)
  }

  const lastPart = parts[parts.length - 1]
  const lastNode = root.lastChild
  const needsCursorAnchor =
    (lastPart !== undefined && lastPart.type !== PROMPT_PART_TYPE_TEXT) ||
    (lastNode?.nodeType === Node.ELEMENT_NODE && (lastNode as HTMLElement).tagName === "BR")
  if (needsCursorAnchor) {
    root.appendChild(document.createTextNode(ZERO_WIDTH_SPACE))
  }
}
