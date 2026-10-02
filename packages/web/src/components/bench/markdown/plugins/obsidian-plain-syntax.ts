import {
  addExportVisitor$,
  addToMarkdownExtension$,
  realmPlugin,
  type ToMarkdownExtension,
} from "@mdxeditor/editor"
import {
  bareAutolinkExportVisitor,
  bareAutolinkToMarkdownExtension,
} from "@/components/bench/markdown/plugins/bare-autolinks"

type TextHandler = NonNullable<NonNullable<ToMarkdownExtension["handlers"]>["text"]>
type MarkdownSerializerState = Parameters<TextHandler>[2]
type MarkdownSurroundings = Parameters<TextHandler>[3]

type VerbatimRange = {
  start: number
  end: number
}

const INTRAWORD_UNDERSCORE_PATTERN = String.raw`(?<=[\p{L}\p{N}])_(?=[\p{L}\p{N}])`
const TAG_CHARACTER_PATTERN = String.raw`(?:[\p{L}\p{N}/-]|${INTRAWORD_UNDERSCORE_PATTERN})`
const TAG_NON_DIGIT_PATTERN = String.raw`(?:[\p{L}/-]|${INTRAWORD_UNDERSCORE_PATTERN})`
const TAG_PATTERN = new RegExp(
  String.raw`(?<=^|\s)#\p{N}*${TAG_NON_DIGIT_PATTERN}${TAG_CHARACTER_PATTERN}*`,
  "gu",
)
const INSERTED_ESCAPE_MARKER = "\u2060"
const CUSTOM_TASK_STATUS_PATTERN = /^\[\u2060?[^\s[\]\\`xX\u2060]\](?=[ \t])/u
const FOOTNOTE_REFERENCE_PATTERN = /!?\[\^[^\s[\]\\<|\u2060]+\]/gu
const PROSE_COLON_PATTERN = /(?<=[^:]):(?=[A-Za-z])/gu
const LONE_EQUALS_PATTERN = /(?<!=)=(?!=)/gu
const INTRAWORD_UNDERSCORE = new RegExp(INTRAWORD_UNDERSCORE_PATTERN, "gu")
const CURRENCY_DOLLAR_PATTERN = /\$(?=\d)/gu
const LINE_FEED = "\n"

function tagRanges(value: string, before: string): VerbatimRange[] {
  const context = `${before}${value}`
  const ranges: VerbatimRange[] = []
  for (const match of context.matchAll(TAG_PATTERN)) {
    const start = match.index - before.length
    if (start < 0) continue
    ranges.push({ start, end: start + match[0].length })
  }
  return ranges
}

function proseColonRanges(value: string, surroundings: MarkdownSurroundings): VerbatimRange[] {
  const { after, before } = surroundings
  const ranges: VerbatimRange[] = []
  for (const match of `${before}${value}${after}`.matchAll(PROSE_COLON_PATTERN)) {
    const start = match.index - before.length
    if (start < 0 || start >= value.length) continue
    ranges.push({ start, end: start + 1 })
  }
  return ranges
}

function startsLine(value: string, index: number): boolean {
  const lineStart = value.lastIndexOf(LINE_FEED, index - 1) + 1
  return value.slice(lineStart, index).trim() === ""
}

function loneEqualsRanges(value: string, surroundings: MarkdownSurroundings): VerbatimRange[] {
  const { after, before } = surroundings
  const ranges: VerbatimRange[] = []
  for (const match of `${before}${value}${after}`.matchAll(LONE_EQUALS_PATTERN)) {
    const start = match.index - before.length
    if (start < 0 || start >= value.length || startsLine(value, start)) continue
    ranges.push({ start, end: start + 1 })
  }
  return ranges
}

function intrawordUnderscoreRanges(
  value: string,
  surroundings: MarkdownSurroundings,
): VerbatimRange[] {
  const { after, before } = surroundings
  const ranges: VerbatimRange[] = []
  for (const match of `${before}${value}${after}`.matchAll(INTRAWORD_UNDERSCORE)) {
    const start = match.index - before.length
    if (start < 0 || start >= value.length) continue
    ranges.push({ start, end: start + 1 })
  }
  return ranges
}

function isFirstTextOfListItem(state: MarkdownSerializerState): boolean {
  return (
    state.stack.at(-1) === "phrasing" &&
    state.stack.at(-2) === "paragraph" &&
    state.stack.at(-3) === "listItem" &&
    state.indexStack.at(-1) === 0 &&
    state.indexStack.at(-2) === 0
  )
}

function customTaskStatusRanges(value: string, state: MarkdownSerializerState): VerbatimRange[] {
  if (!isFirstTextOfListItem(state)) return []
  const match = CUSTOM_TASK_STATUS_PATTERN.exec(value)
  return match ? [{ start: 0, end: match[0].length }] : []
}

function footnoteReferenceRanges(value: string, state: MarkdownSerializerState): VerbatimRange[] {
  if (state.stack.includes("label") || state.stack.includes("reference")) return []
  return Array.from(value.matchAll(FOOTNOTE_REFERENCE_PATTERN), (match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }))
}

function nonOverlappingRanges(ranges: VerbatimRange[]): VerbatimRange[] {
  const ordered = ranges.toSorted((left, right) => left.start - right.start)
  const kept: VerbatimRange[] = []
  for (const range of ordered) {
    const previous = kept.at(-1)
    if (previous && range.start < previous.end) continue
    kept.push(range)
  }
  return kept
}

function serializeTextKeepingObsidianSyntax(
  value: string,
  state: MarkdownSerializerState,
  surroundings: MarkdownSurroundings,
): string {
  const ranges = nonOverlappingRanges([
    ...tagRanges(value, surroundings.before),
    ...proseColonRanges(value, surroundings),
    ...loneEqualsRanges(value, surroundings),
    ...intrawordUnderscoreRanges(value, surroundings),
    ...Array.from(value.matchAll(CURRENCY_DOLLAR_PATTERN), (match) => ({
      start: match.index,
      end: match.index + 1,
    })),
    ...customTaskStatusRanges(value, state),
    ...footnoteReferenceRanges(value, state),
  ])
  if (ranges.length === 0) return state.safe(value, surroundings)

  let serialized = ""
  let cursor = 0
  let before = surroundings.before
  for (const range of ranges) {
    const verbatim = value.slice(range.start, range.end).replaceAll(INSERTED_ESCAPE_MARKER, "")
    if (range.start > cursor) {
      serialized += state.safe(value.slice(cursor, range.start), {
        ...surroundings,
        before,
        after: verbatim.charAt(0),
      })
    }
    serialized += verbatim
    before = verbatim.slice(-1)
    cursor = range.end
  }
  if (cursor < value.length) {
    serialized += state.safe(value.slice(cursor), { ...surroundings, before })
  }
  return serialized
}

export const obsidianPlainSyntaxToMarkdownExtension: ToMarkdownExtension = {
  handlers: {
    text(node, _parent, state, surroundings) {
      return serializeTextKeepingObsidianSyntax(node.value, state, surroundings)
    },
  },
}

export const buddyObsidianPlainSyntaxPlugin = realmPlugin({
  init(realm) {
    realm.pubIn({
      [addToMarkdownExtension$]: [
        obsidianPlainSyntaxToMarkdownExtension,
        bareAutolinkToMarkdownExtension,
      ],
      [addExportVisitor$]: bareAutolinkExportVisitor,
    })
  },
})
