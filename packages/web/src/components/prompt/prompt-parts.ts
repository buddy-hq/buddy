import { parseTString } from "@/components/chat/tools/types"
import { parseStringArray } from "@/state/chat-types"
import { basename } from "../chat/utils/path"
import { createFileTypeIconElement } from "../files/file-type-icon"
import {
  createAppIconElement,
  folderOpenIconData,
  rubiksCubeIconData,
  type IconSvgElement,
} from "@/icons/app-icons"
import { createSkillIconMarkElement } from "../skills/skill-icon-mark"
import type { SkillPresentationLookup } from "../skills/skill-presentation"
import { createTextFragment } from "./editor-dom"
import type { MentionOption } from "./mention-autocomplete"
import {
  readReaderTextAnchor,
  readerTextAnchorEquals,
  type ReaderTextAnchor,
} from "@buddy/reader-contract"
import {
  PROMPT_PART_TYPE_AGENT,
  PROMPT_PART_TYPE_SKILL,
  PROMPT_PART_TYPE_TEXT,
  PROMPT_STRUCTURED_MASK_CHAR,
  OPENCODE_REFERENCE_PART_TYPE,
  READING_SELECTION_PART_TYPE,
  RESOURCE_REFERENCE_PART_TYPE,
  readPromptReaderTextAnchor,
  SELECTION_CONTEXT_PART_TYPE,
  WORKSPACE_FILE_REFERENCE_PART_TYPE,
  type PromptAgentPart,
  type PromptComposerPart,
  type PromptOpenCodeReferencePart,
  type PromptMarkdownSelectionContextPart,
  type PromptReadingSelectionPart,
  type PromptReadingSelectionContextPart,
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
  return Object.assign(
    {
      type: READING_SELECTION_PART_TYPE,
      text: part.text,
      anchor: part.anchor,
    },
    part.selectionKey ? { selectionKey: part.selectionKey } : undefined,
    part.resourceKey ? { resourceKey: part.resourceKey } : undefined,
    Object.assign(
      {},
      part.tocLabel ? { tocLabel: part.tocLabel } : undefined,
      part.pageLabel ? { pageLabel: part.pageLabel } : undefined,
      part.locationLabel ? { locationLabel: part.locationLabel } : undefined,
    ),
  )
}

type SelectionContextPartInput =
  | Omit<PromptReadingSelectionContextPart, "type">
  | Omit<PromptMarkdownSelectionContextPart, "type">

function createSelectionContextPart(part: SelectionContextPartInput): PromptSelectionContextPart {
  if (part.source === "markdown") {
    return Object.assign(
      {
        type: SELECTION_CONTEXT_PART_TYPE,
        source: "markdown" as const,
        text: part.text,
        selectionKey: part.selectionKey,
      },
      part.path ? { path: part.path } : undefined,
      part.version ? { version: part.version } : undefined,
      part.headingPath ? { headingPath: [...part.headingPath] } : undefined,
    )
  }

  return Object.assign(
    {
      type: SELECTION_CONTEXT_PART_TYPE,
      source: "reading" as const,
      text: part.text,
      selectionKey: part.selectionKey,
      anchor: part.anchor,
    },
    part.resourceKey ? { resourceKey: part.resourceKey } : undefined,
    Object.assign(
      {},
      part.tocLabel ? { tocLabel: part.tocLabel } : undefined,
      part.pageLabel ? { pageLabel: part.pageLabel } : undefined,
      part.locationLabel ? { locationLabel: part.locationLabel } : undefined,
    ),
  )
}

function optionalReaderTextAnchorsEqual<TLeft, TRight>(left: TLeft, right: TRight): boolean {
  const leftAnchor = readPromptReaderTextAnchor(left)
  const rightAnchor = readPromptReaderTextAnchor(right)
  if (!leftAnchor || !rightAnchor) return leftAnchor === rightAnchor
  return readerTextAnchorEquals(leftAnchor, rightAnchor)
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
      if (!optionalReaderTextAnchorsEqual(leftPart, rightPart)) return false
      if (leftPart.tocLabel !== rightPart.tocLabel) return false
      if (leftPart.pageLabel !== rightPart.pageLabel) return false
      if (leftPart.locationLabel !== rightPart.locationLabel) return false
      continue
    }

    if (rightPart.type !== READING_SELECTION_PART_TYPE) return false
    if (leftPart.text !== rightPart.text) return false
    if (leftPart.selectionKey !== rightPart.selectionKey) return false
    if (leftPart.resourceKey !== rightPart.resourceKey) return false
    if (!optionalReaderTextAnchorsEqual(leftPart, rightPart)) return false
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
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined
}

function readSerializedReaderTextAnchor(value: string): ReaderTextAnchor | undefined {
  try {
    const parsed: unknown = JSON.parse(value)
    return readReaderTextAnchor(parsed)
  } catch {
    return undefined
  }
}

function readElementReaderTextAnchor(element: HTMLElement): ReaderTextAnchor | undefined {
  const serializedAnchor = element.dataset.readerAnchor
  if (serializedAnchor !== undefined) return readSerializedReaderTextAnchor(serializedAnchor)

  const sectionIndex = readDatasetNumber(element.dataset.index)
  return readPromptReaderTextAnchor(
    Object.assign(
      { cfi: element.dataset.cfi },
      sectionIndex !== undefined ? { index: sectionIndex } : undefined,
    ),
  )
}

function readDatasetStringArray(value: string | undefined) {
  if (!value) return undefined
  try {
    const parsed = JSON.parse(value)
    return parseStringArray(parsed)
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

    if (!(node instanceof HTMLElement)) return
    const element = node

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
      const anchor = readElementReaderTextAnchor(element)
      if (text && anchor) {
        parts.push(
          createReadingSelectionPart(
            Object.assign(
              { text, anchor },
              element.dataset.selectionKey
                ? { selectionKey: element.dataset.selectionKey }
                : undefined,
              element.dataset.resourceKey
                ? { resourceKey: element.dataset.resourceKey }
                : undefined,
              Object.assign(
                {},
                element.dataset.tocLabel ? { tocLabel: element.dataset.tocLabel } : undefined,
                element.dataset.pageLabel ? { pageLabel: element.dataset.pageLabel } : undefined,
                element.dataset.locationLabel
                  ? { locationLabel: element.dataset.locationLabel }
                  : undefined,
              ),
            ),
          ),
        )
      }
      return
    }

    if (element.dataset.type === SELECTION_CONTEXT_PART_TYPE) {
      flush()
      const text = element.dataset.text
      const source = element.dataset.source
      const selectionKey = element.dataset.selectionKey
      if (text && source === "markdown" && selectionKey) {
        const headingPath = readDatasetStringArray(element.dataset.headingPath)
        parts.push(
          createSelectionContextPart(
            Object.assign(
              { source: "markdown" as const, text, selectionKey },
              element.dataset.path ? { path: element.dataset.path } : undefined,
              element.dataset.version ? { version: element.dataset.version } : undefined,
              headingPath ? { headingPath } : undefined,
            ),
          ),
        )
      }
      if (text && source === "reading" && selectionKey) {
        const anchor = readElementReaderTextAnchor(element)
        if (!anchor) return
        parts.push(
          createSelectionContextPart(
            Object.assign(
              { source: "reading" as const, text, selectionKey, anchor },
              element.dataset.resourceKey
                ? { resourceKey: element.dataset.resourceKey }
                : undefined,
              Object.assign(
                {},
                element.dataset.tocLabel ? { tocLabel: element.dataset.tocLabel } : undefined,
                element.dataset.pageLabel ? { pageLabel: element.dataset.pageLabel } : undefined,
                element.dataset.locationLabel
                  ? { locationLabel: element.dataset.locationLabel }
                  : undefined,
              ),
            ),
          ),
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
        child instanceof HTMLElement &&
        BLOCK_TAG_NAMES.has(child.tagName) &&
        !isStructuredPromptElement(child)
      if (isBlock && index < children.length - 1) {
        buffer += "\n"
      }
    })
  }

  Array.from(root.childNodes).forEach((child, index, siblings) => {
    visit(child)
    const isBlock =
      child instanceof HTMLElement &&
      BLOCK_TAG_NAMES.has(child.tagName) &&
      !isStructuredPromptElement(child)
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
  const anchor = readPromptReaderTextAnchor(part)
  if (anchor) card.dataset.readerAnchor = JSON.stringify(anchor)
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
    .flatMap((value) => {
      const text = parseTString(value)
      return text !== undefined && text.length > 0 ? [text] : []
    })
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
/** Artwork, not a glyph — a skill's mark needs the extra pixels to read. */
const PROMPT_PILL_SKILL_ICON_CLASS = "relative top-[3px] size-4 shrink-0 rounded-[4px]"

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
 * A skill pill's contents: the skill's artwork and label when they are known,
 * the generic skill glyph and the invocation name until then.
 */
function fillSkillPill(
  pill: HTMLElement,
  name: string,
  skillPresentation: SkillPresentationLookup | undefined,
) {
  const presentation = skillPresentation?.(name)
  pill.replaceChildren()
  const fallback = createAppIconElement(rubiksCubeIconData, PROMPT_PILL_ICON_CLASS)
  const artwork = createSkillIconMarkElement(
    presentation?.icon,
    PROMPT_PILL_SKILL_ICON_CLASS,
    fallback,
  )
  pill.appendChild(artwork ?? fallback)
  appendPillLabel(pill, presentation?.displayName ?? name)
}

/**
 * Repaint the skill pills already in the editor. Presentations arrive after the
 * first render, and a restored draft must not be left showing the placeholder
 * glyph until its next edit.
 */
export function refreshSkillPills(root: HTMLElement, skillPresentation: SkillPresentationLookup) {
  const pills = root.querySelectorAll<HTMLElement>(`[data-type="${PROMPT_PART_TYPE_SKILL}"]`)
  for (const pill of pills) {
    const name = pill.dataset.name
    if (name) fillSkillPill(pill, name, skillPresentation)
  }
}

/**
 * Build the inline contenteditable pill for a structured prompt part. Shared by
 * the full re-render ({@link renderPromptParts}) and the interactive insert path
 * so a mention always looks the same however it enters the editor. `data-serialized`
 * records the pill's logical text so the editor can display a short basename + icon
 * while cursor math still uses the full `@path`.
 *
 * `skillPresentation` is how a skill pill gets the label and artwork the rest of
 * the app shows it with; without it a skill still reads as its invocation name
 * behind the generic skill glyph.
 */
export function createPromptPill(
  part: StructuredPillPart,
  skillPresentation?: SkillPresentationLookup,
): HTMLSpanElement {
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
    fillSkillPill(pill, part.name, skillPresentation)
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

export function renderPromptParts(
  root: HTMLElement,
  parts: PromptComposerPart[],
  skillPresentation?: SkillPresentationLookup,
) {
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

    root.appendChild(createPromptPill(part, skillPresentation))
  }

  const lastPart = parts[parts.length - 1]
  const lastNode = root.lastChild
  const needsCursorAnchor =
    (lastPart !== undefined && lastPart.type !== PROMPT_PART_TYPE_TEXT) ||
    (lastNode instanceof HTMLElement && lastNode.tagName === "BR")
  if (needsCursorAnchor) {
    root.appendChild(document.createTextNode(ZERO_WIDTH_SPACE))
  }
}
