import { basename } from "../chat/utils/path"
import { createFileTypeIconElement } from "../files/file-type-icon"
import {
  createAppIconElement,
  folderOpenIconData,
  rubiksCubeIconData,
  type IconSvgElement,
} from "@/icons/app-icons"
import { createTextFragment } from "./editor-dom"
import type { MentionOption } from "./mention-autocomplete"
import {
  PROMPT_PART_TYPE_AGENT,
  PROMPT_PART_TYPE_SKILL,
  PROMPT_PART_TYPE_TEXT,
  PROMPT_STRUCTURED_MASK_CHAR,
  OPENCODE_REFERENCE_PART_TYPE,
  READING_SELECTION_PART_TYPE,
  RESOURCE_REFERENCE_PART_TYPE,
  SELECTION_CONTEXT_PART_TYPE,
  WORKSPACE_FILE_REFERENCE_PART_TYPE,
  type PromptAgentPart,
  type PromptComposerPart,
  type PromptOpenCodeReferencePart,
  type PromptReadingSelectionPart,
  type PromptSelectionContextPart,
  type PromptSkillPart,
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

export function createSkillPart(name: string): PromptSkillPart {
  return {
    type: PROMPT_PART_TYPE_SKILL,
    name,
  }
}

function createOpenCodeReferencePart(name: string, path: string): PromptOpenCodeReferencePart {
  return {
    type: OPENCODE_REFERENCE_PART_TYPE,
    name,
    path,
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

function createReadingSelectionPart(
  part: Omit<PromptReadingSelectionPart, "type">,
): PromptReadingSelectionPart {
  return {
    type: READING_SELECTION_PART_TYPE,
    text: part.text,
    ...(part.selectionKey ? { selectionKey: part.selectionKey } : {}),
    ...(part.resourceKey ? { resourceKey: part.resourceKey } : {}),
    ...(part.cfi ? { cfi: part.cfi } : {}),
    ...(part.index !== undefined ? { index: part.index } : {}),
    ...(part.tocLabel ? { tocLabel: part.tocLabel } : {}),
    ...(part.pageLabel ? { pageLabel: part.pageLabel } : {}),
    ...(part.locationLabel ? { locationLabel: part.locationLabel } : {}),
  }
}

function createSelectionContextPart(
  part: Omit<PromptSelectionContextPart, "type">,
): PromptSelectionContextPart {
  return {
    type: SELECTION_CONTEXT_PART_TYPE,
    source: part.source,
    text: part.text,
    selectionKey: part.selectionKey,
    ...(part.path ? { path: part.path } : {}),
    ...(part.version ? { version: part.version } : {}),
    ...(part.headingPath ? { headingPath: [...part.headingPath] } : {}),
    ...(part.resourceKey ? { resourceKey: part.resourceKey } : {}),
    ...(part.cfi ? { cfi: part.cfi } : {}),
    ...(part.index !== undefined ? { index: part.index } : {}),
    ...(part.tocLabel ? { tocLabel: part.tocLabel } : {}),
    ...(part.pageLabel ? { pageLabel: part.pageLabel } : {}),
    ...(part.locationLabel ? { locationLabel: part.locationLabel } : {}),
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

    if (part.type === PROMPT_PART_TYPE_SKILL) {
      return createSkillPart(part.name)
    }

    if (part.type === OPENCODE_REFERENCE_PART_TYPE) {
      return createOpenCodeReferencePart(part.name, part.path)
    }

    if (part.type === RESOURCE_REFERENCE_PART_TYPE) {
      return createResourceReferencePart(part.key)
    }

    if (part.type === READING_SELECTION_PART_TYPE) {
      return createReadingSelectionPart(part)
    }

    if (part.type === SELECTION_CONTEXT_PART_TYPE) {
      return createSelectionContextPart(part)
    }

    return createWorkspaceFileReferencePart(part.path)
  })
}

export function arePromptPartsEqual(left: PromptComposerPart[], right: PromptComposerPart[]) {
  if (left.length !== right.length) return false

  for (let index = 0; index < left.length; index += 1) {
    const leftPart = left[index]
    const rightPart = right[index]
    if (!leftPart || !rightPart) return false
    if (leftPart.type !== rightPart.type) return false
    if (leftPart.type === PROMPT_PART_TYPE_TEXT) {
      if (rightPart.type !== PROMPT_PART_TYPE_TEXT || leftPart.text !== rightPart.text) return false
      continue
    }
    if (leftPart.type === PROMPT_PART_TYPE_AGENT) {
      if (rightPart.type !== PROMPT_PART_TYPE_AGENT || leftPart.name !== rightPart.name)
        return false
      continue
    }
    if (leftPart.type === PROMPT_PART_TYPE_SKILL) {
      if (rightPart.type !== PROMPT_PART_TYPE_SKILL || leftPart.name !== rightPart.name)
        return false
      continue
    }
    if (leftPart.type === OPENCODE_REFERENCE_PART_TYPE) {
      if (
        rightPart.type !== OPENCODE_REFERENCE_PART_TYPE ||
        leftPart.name !== rightPart.name ||
        leftPart.path !== rightPart.path
      ) {
        return false
      }
      continue
    }
    if (leftPart.type === WORKSPACE_FILE_REFERENCE_PART_TYPE) {
      if (rightPart.type !== WORKSPACE_FILE_REFERENCE_PART_TYPE || leftPart.path !== rightPart.path)
        return false
      continue
    }
    if (leftPart.type === RESOURCE_REFERENCE_PART_TYPE) {
      if (rightPart.type !== RESOURCE_REFERENCE_PART_TYPE || leftPart.key !== rightPart.key)
        return false
      continue
    }

    if (leftPart.type === SELECTION_CONTEXT_PART_TYPE) {
      if (rightPart.type !== SELECTION_CONTEXT_PART_TYPE) return false
      if (leftPart.source !== rightPart.source) return false
      if (leftPart.text !== rightPart.text) return false
      if (leftPart.selectionKey !== rightPart.selectionKey) return false
      if (leftPart.path !== rightPart.path) return false
      if (leftPart.version !== rightPart.version) return false
      if ((leftPart.headingPath?.join("\n") ?? "") !== (rightPart.headingPath?.join("\n") ?? ""))
        return false
      if (leftPart.resourceKey !== rightPart.resourceKey) return false
      if (leftPart.cfi !== rightPart.cfi) return false
      if (leftPart.index !== rightPart.index) return false
      if (leftPart.tocLabel !== rightPart.tocLabel) return false
      if (leftPart.pageLabel !== rightPart.pageLabel) return false
      if (leftPart.locationLabel !== rightPart.locationLabel) return false
      continue
    }

    if (rightPart.type !== READING_SELECTION_PART_TYPE) return false
    if (leftPart.text !== rightPart.text) return false
    if (leftPart.selectionKey !== rightPart.selectionKey) return false
    if (leftPart.resourceKey !== rightPart.resourceKey) return false
    if (leftPart.cfi !== rightPart.cfi) return false
    if (leftPart.index !== rightPart.index) return false
    if (leftPart.tocLabel !== rightPart.tocLabel) return false
    if (leftPart.pageLabel !== rightPart.pageLabel) return false
    if (leftPart.locationLabel !== rightPart.locationLabel) return false
  }

  return true
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
      if (part.type === PROMPT_PART_TYPE_SKILL) return `/${part.name}`
      if (part.type === OPENCODE_REFERENCE_PART_TYPE) return `@${part.name}`
      if (part.type === RESOURCE_REFERENCE_PART_TYPE) return `resource:${part.key}`
      if (part.type === READING_SELECTION_PART_TYPE) return `"${part.text}"`
      if (part.type === SELECTION_CONTEXT_PART_TYPE) return `"${part.text}"`
      return `@${part.path}`
    })
    .join("")
}

export function serializePromptEditorParts(parts: PromptComposerPart[]) {
  return serializePromptParts(
    parts.filter(
      (part) =>
        part.type !== READING_SELECTION_PART_TYPE && part.type !== SELECTION_CONTEXT_PART_TYPE,
    ),
  )
}

/**
 * The editor value used for `@`/`/` trigger matching: identical in length to
 * {@link serializePromptEditorParts} (so match offsets are valid cursor
 * offsets), but every structured pill's characters are replaced with
 * {@link PROMPT_STRUCTURED_MASK_CHAR}. `@` or `/` inside a pill's serialized
 * text — "@node_modules/@types/…" — can therefore never open or feed the menu.
 */
export function serializePromptAutocompleteValue(parts: PromptComposerPart[]) {
  return parts
    .filter(
      (part) =>
        part.type !== READING_SELECTION_PART_TYPE && part.type !== SELECTION_CONTEXT_PART_TYPE,
    )
    .map((part) =>
      part.type === PROMPT_PART_TYPE_TEXT
        ? part.text
        : PROMPT_STRUCTURED_MASK_CHAR.repeat(serializePromptParts([part]).length),
    )
    .join("")
}

function readDatasetNumber(value: string | undefined) {
  if (value === undefined || value.length === 0) return undefined
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

function readDatasetStringArray(value: string | undefined) {
  if (!value) return undefined
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return undefined
    if (!parsed.every((entry) => typeof entry === "string")) return undefined
    return parsed
  } catch {
    return undefined
  }
}

function isStructuredPromptElement(element: HTMLElement) {
  return (
    element.dataset.type === PROMPT_PART_TYPE_AGENT ||
    element.dataset.type === PROMPT_PART_TYPE_SKILL ||
    element.dataset.type === OPENCODE_REFERENCE_PART_TYPE ||
    element.dataset.type === WORKSPACE_FILE_REFERENCE_PART_TYPE ||
    element.dataset.type === RESOURCE_REFERENCE_PART_TYPE ||
    element.dataset.type === READING_SELECTION_PART_TYPE ||
    element.dataset.type === SELECTION_CONTEXT_PART_TYPE
  )
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

    if (element.dataset.type === PROMPT_PART_TYPE_SKILL) {
      flush()
      const name = element.dataset.name
      if (name) {
        parts.push(createSkillPart(name))
      }
      return
    }

    if (element.dataset.type === OPENCODE_REFERENCE_PART_TYPE) {
      flush()
      const name = element.dataset.name
      const path = element.dataset.path
      if (name && path) {
        parts.push(createOpenCodeReferencePart(name, path))
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

    if (element.dataset.type === READING_SELECTION_PART_TYPE) {
      flush()
      const text = element.dataset.text
      if (text) {
        const index = readDatasetNumber(element.dataset.index)
        parts.push(
          createReadingSelectionPart({
            text,
            ...(element.dataset.selectionKey ? { selectionKey: element.dataset.selectionKey } : {}),
            ...(element.dataset.resourceKey ? { resourceKey: element.dataset.resourceKey } : {}),
            ...(element.dataset.cfi ? { cfi: element.dataset.cfi } : {}),
            ...(index !== undefined ? { index } : {}),
            ...(element.dataset.tocLabel ? { tocLabel: element.dataset.tocLabel } : {}),
            ...(element.dataset.pageLabel ? { pageLabel: element.dataset.pageLabel } : {}),
            ...(element.dataset.locationLabel
              ? { locationLabel: element.dataset.locationLabel }
              : {}),
          }),
        )
      }
      return
    }

    if (element.dataset.type === SELECTION_CONTEXT_PART_TYPE) {
      flush()
      const text = element.dataset.text
      const source = element.dataset.source
      const selectionKey = element.dataset.selectionKey
      if (text && (source === "reading" || source === "markdown") && selectionKey) {
        const headingPath = readDatasetStringArray(element.dataset.headingPath)
        const index = readDatasetNumber(element.dataset.index)
        parts.push(
          createSelectionContextPart({
            source,
            text,
            selectionKey,
            ...(element.dataset.path ? { path: element.dataset.path } : {}),
            ...(element.dataset.version ? { version: element.dataset.version } : {}),
            ...(headingPath ? { headingPath } : {}),
            ...(element.dataset.resourceKey ? { resourceKey: element.dataset.resourceKey } : {}),
            ...(element.dataset.cfi ? { cfi: element.dataset.cfi } : {}),
            ...(index !== undefined ? { index } : {}),
            ...(element.dataset.tocLabel ? { tocLabel: element.dataset.tocLabel } : {}),
            ...(element.dataset.pageLabel ? { pageLabel: element.dataset.pageLabel } : {}),
            ...(element.dataset.locationLabel
              ? { locationLabel: element.dataset.locationLabel }
              : {}),
          }),
        )
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
        child.nodeType === Node.ELEMENT_NODE &&
        BLOCK_TAG_NAMES.has((child as HTMLElement).tagName) &&
        !isStructuredPromptElement(child as HTMLElement)
      if (isBlock && index < children.length - 1) {
        buffer += "\n"
      }
    })
  }

  Array.from(root.childNodes).forEach((child, index, siblings) => {
    visit(child)
    const isBlock =
      child.nodeType === Node.ELEMENT_NODE &&
      BLOCK_TAG_NAMES.has((child as HTMLElement).tagName) &&
      !isStructuredPromptElement(child as HTMLElement)
    if (isBlock && index < siblings.length - 1) {
      buffer += "\n"
    }
  })

  flush()
  return parts
}

function appendSelectionCard(
  root: HTMLElement,
  part: PromptReadingSelectionPart | PromptSelectionContextPart,
) {
  const card = document.createElement("div")
  card.className =
    "my-1.5 inline-flex max-w-full flex-col gap-1 rounded-lg border border-border-base bg-surface-weak px-3 py-2 text-left align-top"
  card.setAttribute("contenteditable", "false")
  card.dataset.type = part.type
  card.dataset.text = part.text
  if (part.selectionKey) card.dataset.selectionKey = part.selectionKey
  if ("source" in part) card.dataset.source = part.source
  if ("path" in part && part.path) card.dataset.path = part.path
  if ("version" in part && part.version) card.dataset.version = part.version
  if ("headingPath" in part && part.headingPath) {
    card.dataset.headingPath = JSON.stringify(part.headingPath)
  }
  if (part.resourceKey) card.dataset.resourceKey = part.resourceKey
  if (part.cfi) card.dataset.cfi = part.cfi
  if (part.index !== undefined) card.dataset.index = String(part.index)
  if (part.tocLabel) card.dataset.tocLabel = part.tocLabel
  if (part.pageLabel) card.dataset.pageLabel = part.pageLabel
  if (part.locationLabel) card.dataset.locationLabel = part.locationLabel

  const heading = document.createElement("div")
  heading.className = "text-[11px] font-medium uppercase tracking-wide text-text-weaker"
  heading.textContent =
    "source" in part && part.source === "markdown" ? "Selected document text" : "Selected passage"

  const excerpt = document.createElement("div")
  excerpt.className = "line-clamp-4 whitespace-pre-wrap text-sm text-text-base"
  excerpt.textContent = part.text

  const metadata = [
    "path" in part ? part.path : undefined,
    "headingPath" in part ? part.headingPath?.join(" / ") : undefined,
    part.tocLabel,
    part.pageLabel,
    part.locationLabel,
  ]
    .filter((value) => typeof value === "string" && value.length > 0)
    .join(" • ")

  card.append(heading, excerpt)

  if (metadata) {
    const meta = document.createElement("div")
    meta.className = "text-xs text-text-weaker"
    meta.textContent = metadata
    card.append(meta)
  }

  root.appendChild(card)
}

type StructuredPillPart =
  | PromptAgentPart
  | PromptSkillPart
  | PromptOpenCodeReferencePart
  | PromptWorkspaceFileReferencePart
  | PromptResourceReferencePart

// Inline, borderless mention — reads like an attached file in the message body
// (icon + accent-coloured name), not a boxed chip. Kept in lockstep with the
// transcript's inline reference (see highlighted-text.tsx): `items-baseline`
// (not `items-center`) so the icon + name sit flush on the text baseline with
// no apparent padding, and a `size-3` icon that matches the running text.
const PROMPT_PILL_CLASS =
  "mx-1 inline-flex max-w-full items-baseline gap-1 align-baseline font-medium text-text-interactive-base"
const PROMPT_PILL_ICON_CLASS = "relative top-px size-3 shrink-0"

function isDirectoryPath(path: string) {
  return path.endsWith("/")
}

function appendPillLabel(pill: HTMLElement, text: string) {
  const label = document.createElement("span")
  label.className = "truncate"
  label.textContent = text
  pill.appendChild(label)
}

function appendPillFileIcon(pill: HTMLElement, fileName: string) {
  pill.appendChild(createFileTypeIconElement(fileName, PROMPT_PILL_ICON_CLASS))
}

function appendPillIcon(pill: HTMLElement, icon: IconSvgElement) {
  pill.appendChild(createAppIconElement(icon, PROMPT_PILL_ICON_CLASS))
}

/**
 * Build the inline contenteditable pill for a structured prompt part. Shared by
 * the full re-render ({@link renderPromptParts}) and the interactive insert path
 * so a mention always looks the same however it enters the editor. `data-serialized`
 * records the pill's logical text so the editor can display a short basename + icon
 * while cursor math still uses the full `@path`.
 */
export function createPromptPill(part: StructuredPillPart): HTMLSpanElement {
  const pill = document.createElement("span")
  pill.className = PROMPT_PILL_CLASS
  pill.setAttribute("contenteditable", "false")
  pill.dataset.type = part.type
  pill.dataset.serialized = serializePromptParts([part])

  if (part.type === PROMPT_PART_TYPE_AGENT) {
    pill.dataset.name = part.name
    appendPillLabel(pill, `@${part.name}`)
    return pill
  }

  if (part.type === PROMPT_PART_TYPE_SKILL) {
    pill.dataset.name = part.name
    appendPillIcon(pill, rubiksCubeIconData)
    appendPillLabel(pill, part.name)
    return pill
  }

  if (part.type === OPENCODE_REFERENCE_PART_TYPE) {
    pill.dataset.name = part.name
    pill.dataset.path = part.path
    appendPillLabel(pill, `@${part.name}`)
    return pill
  }

  if (part.type === RESOURCE_REFERENCE_PART_TYPE) {
    pill.dataset.key = part.key
    appendPillLabel(pill, `resource:${part.key}`)
    return pill
  }

  pill.dataset.path = part.path
  if (isDirectoryPath(part.path)) {
    const directoryName = basename(part.path.replace(/\/+$/, "")) || part.path
    appendPillIcon(pill, folderOpenIconData)
    appendPillLabel(pill, directoryName)
    return pill
  }
  const fileName = basename(part.path) || part.path
  appendPillFileIcon(pill, fileName)
  appendPillLabel(pill, fileName)
  return pill
}

export function promptPartFromMentionOption(option: MentionOption): StructuredPillPart {
  if (option.type === "agent") return createAgentPart(option.name)
  if (option.type === "reference") return createOpenCodeReferencePart(option.name, option.path)
  return createWorkspaceFileReferencePart(option.path)
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

    if (part.type === READING_SELECTION_PART_TYPE) {
      appendSelectionCard(root, part)
      continue
    }

    if (part.type === SELECTION_CONTEXT_PART_TYPE) {
      appendSelectionCard(root, part)
      continue
    }

    root.appendChild(createPromptPill(part))
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
