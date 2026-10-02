import { Lexer, type Token } from "marked"
import { fromMarkdown } from "mdast-util-from-markdown"

type MarkdownBlock = {
  start: number
  end: number
  key: string
}

type SplitMarkdown = {
  text: string
  blocks: MarkdownBlock[]
}

type BlockOrigin = {
  side: "source" | "next"
  index: number
}

const FRONTMATTER_PATTERN = /^---[ \t]*\n[\s\S]*?\n---[ \t]*(?=\n|$)/u
const TRAILING_WHITESPACE = /\s+$/u
const WHITESPACE_RUN = /\s+/gu
const CHARACTER_REFERENCE_PATTERN = /&(?:#x([\da-f]+)|#(\d+)|(amp|lt|gt|quot|apos|nbsp));/giu
const NAMED_CHARACTER_REFERENCES = new Map([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
  ["nbsp", " "],
])
const MAX_ALIGNMENT_CELLS = 4_000_000

function decodeCharacterReference(
  reference: string,
  hexadecimal: string | undefined,
  decimal: string | undefined,
  name: string | undefined,
): string {
  if (hexadecimal) return String.fromCodePoint(Number.parseInt(hexadecimal, 16))
  if (decimal) return String.fromCodePoint(Number.parseInt(decimal, 10))
  return NAMED_CHARACTER_REFERENCES.get(name?.toLowerCase() ?? "") ?? reference
}

function inlineText(tokens: readonly Token[] | undefined): string {
  return (tokens ?? []).map(tokenText).join("")
}

function tokenText(token: Token): string {
  switch (token.type) {
    case "space":
    case "hr":
    case "checkbox":
      return ""
    case "br":
      return "\n"
    case "heading":
      return `${token.depth} ${inlineText(token.tokens)}`
    case "table":
      return [token.header, ...token.rows]
        .map((cells: { tokens: Token[] }[]) =>
          cells.map((cell) => inlineText(cell.tokens)).join(" | "),
        )
        .join(" \n ")
    case "list":
      return token.items
        .map((item: { task: boolean; checked?: boolean; tokens: Token[] }) => {
          const marker = item.task ? `[${item.checked ? "x" : " "}] ` : ""
          return `${marker}${inlineText(item.tokens)}`
        })
        .join(" \n ")
    case "link":
    case "image":
      return `${inlineText(token.tokens) || token.text} <${token.href}>`
    case "def":
      return `${token.tag} <${token.href}> ${token.title ?? ""}`
    case "code":
      return `${token.lang ?? ""}\n${token.text}`
    default:
      if ("tokens" in token && token.tokens && token.tokens.length > 0) {
        return inlineText(token.tokens)
      }
      return "text" in token ? String(token.text) : token.raw
  }
}

function blockKey(token: Token): string {
  const text = tokenText(token)
    .replace(CHARACTER_REFERENCE_PATTERN, decodeCharacterReference)
    .replace(WHITESPACE_RUN, " ")
    .trim()
  return `${token.type}:${text}`
}

function blockEnd(text: string, start: number, end: number): number {
  return start + text.slice(start, end).replace(TRAILING_WHITESPACE, "").length
}

function splitMarkdown(text: string): SplitMarkdown | undefined {
  const blocks: MarkdownBlock[] = []
  const frontmatter = FRONTMATTER_PATTERN.exec(text)
  let offset = 0
  if (frontmatter) {
    offset = frontmatter[0].length
    blocks.push({ start: 0, end: offset, key: `frontmatter:${frontmatter[0]}` })
  }
  try {
    // Source positions include definitions; marked omits their tokens, making
    // accumulated token lengths point at the wrong blocks after a definition.
    const tree = fromMarkdown(text.slice(offset))
    for (const node of tree.children) {
      const nodeStart = node.position?.start.offset
      const nodeEnd = node.position?.end.offset
      if (nodeStart === undefined || nodeEnd === undefined) return undefined
      const start = offset + nodeStart
      const end = blockEnd(text, start, offset + nodeEnd)
      const raw = text.slice(start, end)
      const tokens = new Lexer({ gfm: true }).lex(raw)
      const key =
        node.type === "definition"
          ? `definition:${node.identifier} <${node.url}> ${node.title ?? ""}`
          : tokens.map(blockKey).join("\n")
      blocks.push({ start, end, key })
    }
  } catch {
    return undefined
  }
  return { text, blocks }
}

function blockText(markdown: SplitMarkdown, block: MarkdownBlock): string {
  return markdown.text.slice(block.start, block.end)
}

function alignedIndexes(left: readonly string[], right: readonly string[]): Map<number, number> {
  const aligned = new Map<number, number>()
  let prefix = 0
  while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) {
    aligned.set(prefix, prefix)
    prefix += 1
  }
  let suffix = 0
  while (
    suffix < left.length - prefix &&
    suffix < right.length - prefix &&
    left[left.length - 1 - suffix] === right[right.length - 1 - suffix]
  ) {
    aligned.set(right.length - 1 - suffix, left.length - 1 - suffix)
    suffix += 1
  }
  const leftMiddle = left.slice(prefix, left.length - suffix)
  const rightMiddle = right.slice(prefix, right.length - suffix)
  const columns = rightMiddle.length + 1
  if (leftMiddle.length === 0 || rightMiddle.length === 0) return aligned
  if ((leftMiddle.length + 1) * columns > MAX_ALIGNMENT_CELLS) return aligned
  const lengths = new Int32Array((leftMiddle.length + 1) * columns)
  for (let row = leftMiddle.length - 1; row >= 0; row -= 1) {
    for (let column = rightMiddle.length - 1; column >= 0; column -= 1) {
      lengths[row * columns + column] =
        leftMiddle[row] === rightMiddle[column]
          ? (lengths[(row + 1) * columns + column + 1] ?? 0) + 1
          : Math.max(
              lengths[(row + 1) * columns + column] ?? 0,
              lengths[row * columns + column + 1] ?? 0,
            )
    }
  }
  let row = 0
  let column = 0
  while (row < leftMiddle.length && column < rightMiddle.length) {
    if (leftMiddle[row] === rightMiddle[column]) {
      aligned.set(prefix + column, prefix + row)
      row += 1
      column += 1
    } else if (
      (lengths[(row + 1) * columns + column] ?? 0) >= (lengths[row * columns + column + 1] ?? 0)
    ) {
      row += 1
    } else {
      column += 1
    }
  }
  return aligned
}

function sourceGap(source: SplitMarkdown, previous: number, current: number): string {
  const previousBlock = source.blocks[previous]
  const currentBlock = source.blocks[current]
  if (!previousBlock || !currentBlock) return "\n\n"
  return source.text.slice(previousBlock.end, currentBlock.start)
}

function nextGap(next: SplitMarkdown, index: number): string {
  const previousBlock = next.blocks[index - 1]
  const currentBlock = next.blocks[index]
  if (!currentBlock) return ""
  return next.text.slice(previousBlock?.end ?? 0, currentBlock.start)
}

function sourceSlots(
  origins: readonly BlockOrigin[],
  sourceLength: number,
): (number | undefined)[] {
  const slots: (number | undefined)[] = origins.map((origin) =>
    origin.side === "source" ? origin.index : undefined,
  )
  let runStart = 0
  while (runStart < origins.length) {
    if (slots[runStart] !== undefined) {
      runStart += 1
      continue
    }
    let runEnd = runStart
    while (runEnd < origins.length && slots[runEnd] === undefined) runEnd += 1
    const previousSlot = runStart === 0 ? -1 : (slots[runStart - 1] ?? -1)
    const nextSlot = runEnd === origins.length ? sourceLength : (slots[runEnd] ?? sourceLength)
    if (nextSlot - previousSlot - 1 === runEnd - runStart) {
      for (let index = runStart; index < runEnd; index += 1) {
        slots[index] = previousSlot + 1 + index - runStart
      }
    }
    runStart = runEnd
  }
  return slots
}

function composeMarkdown(source: SplitMarkdown, next: SplitMarkdown, origins: BlockOrigin[]) {
  const slots = sourceSlots(origins, source.blocks.length)
  let composed = ""
  for (const [index, origin] of origins.entries()) {
    const slot = slots[index]
    const previousSlot = index === 0 ? -1 : slots[index - 1]
    if (slot !== undefined && previousSlot !== undefined && slot === previousSlot + 1) {
      composed +=
        index === 0
          ? source.text.slice(0, source.blocks[0]?.start ?? 0)
          : sourceGap(source, previousSlot, slot)
    } else {
      composed += nextGap(next, index)
    }
    const block = origin.side === "source" ? source.blocks[origin.index] : next.blocks[origin.index]
    if (block) composed += blockText(origin.side === "source" ? source : next, block)
  }
  const lastSource = source.blocks.at(-1)
  const lastNext = next.blocks.at(-1)
  if (lastSource && slots.at(-1) === source.blocks.length - 1) {
    return `${composed}${source.text.slice(lastSource.end)}`
  }
  return `${composed}${next.text.slice(lastNext?.end ?? next.text.length)}`
}

/** Keep authored block bytes when the editor has only changed other blocks. */
export function keepUntouchedMarkdownBlocks(input: {
  source: string
  baseline: string
  next: string
}): string {
  if (input.next === input.baseline) return input.source
  const source = splitMarkdown(input.source)
  const baseline = splitMarkdown(input.baseline)
  const next = splitMarkdown(input.next)
  if (!source || !baseline || !next || next.blocks.length === 0) return input.next

  const alignedSourceByBaseline = alignedIndexes(
    source.blocks.map((block) => block.key),
    baseline.blocks.map((block) => block.key),
  )
  // The baseline is the import/export of this exact source. Between semantic
  // anchors, equal-sized runs retain their order even when math or directive
  // syntax was respelled by the serializer.
  const sourceByBaseline = sourceSlots(
    baseline.blocks.map((_, index): BlockOrigin => {
      const sourceIndex = alignedSourceByBaseline.get(index)
      return sourceIndex === undefined
        ? { side: "next", index }
        : { side: "source", index: sourceIndex }
    }),
    source.blocks.length,
  )
  const baselineByNext = alignedIndexes(
    baseline.blocks.map((block) => blockText(baseline, block)),
    next.blocks.map((block) => blockText(next, block)),
  )
  const origins = next.blocks.map((_, index): BlockOrigin => {
    const baselineIndex = baselineByNext.get(index)
    const sourceIndex = baselineIndex === undefined ? undefined : sourceByBaseline[baselineIndex]
    if (sourceIndex === undefined) {
      return { side: "next", index }
    }
    return { side: "source", index: sourceIndex }
  })
  if (origins.every((origin) => origin.side === "next")) return input.next

  const composed = composeMarkdown(source, next, origins)
  const reparsed = splitMarkdown(composed)
  const boundariesKept =
    reparsed &&
    reparsed.blocks.length === origins.length &&
    reparsed.blocks.every((block, index) => {
      const origin = origins[index]
      if (!origin) return false
      const original = origin.side === "source" ? source : next
      const originalBlock = original.blocks[origin.index]
      return originalBlock && blockText(reparsed, block) === blockText(original, originalBlock)
    })
  return boundariesKept ? composed : input.next
}
