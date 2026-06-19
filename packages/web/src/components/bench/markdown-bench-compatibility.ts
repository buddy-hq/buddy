import { fromMarkdown } from "mdast-util-from-markdown"
import { matchBuddyBlockMath, matchBuddyInlineMath } from "@/components/markdown/markdown-math"

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
export function prepareMarkdownForMdxEditor(markdown: string): string {
  const normalizedMarkdown = normalizeBuddyMathForMdxEditor(markdown)
  let tree: unknown
  try {
    tree = fromMarkdown(normalizedMarkdown)
  } catch {
    return normalizedMarkdown
  }

  const replacements: MarkdownReplacement[] = []
  collectAutolinkReplacements(tree, normalizedMarkdown, replacements)
  if (replacements.length === 0) return normalizedMarkdown

  let result = normalizedMarkdown
  for (const replacement of replacements.toSorted((left, right) => right.start - left.start)) {
    result = result.slice(0, replacement.start) + replacement.value + result.slice(replacement.end)
  }
  return result
}
