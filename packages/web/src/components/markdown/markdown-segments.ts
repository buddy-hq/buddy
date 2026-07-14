import {
  chemistryFenceAccessibleLabel,
  parseChemistryFenceMetadata,
  type ChemistryFenceMetadata,
} from "@/components/media/renderers/chemistry/fence-metadata"
import {
  isChemistryFormat,
  type ChemistryFormat,
} from "@/components/media/renderers/chemistry/formats"

export type MarkdownSegment =
  | {
      kind: "html"
      markdown: string
      segmentIndex: number
    }
  | {
      kind: "mermaid"
      source: string
      raw: string
      segmentIndex: number
    }
  | {
      kind: "chemistry"
      format: ChemistryFormat
      source: string
      raw: string
      metadata: ChemistryFenceMetadata
      alt: string
      caption: string | undefined
      segmentIndex: number
    }

type EmbeddedFence =
  | { kind: "mermaid" }
  | {
      kind: "chemistry"
      format: ChemistryFormat
      metadata: ChemistryFenceMetadata
    }

type FenceMatch = {
  fenceChar: "`" | "~"
  fenceLength: number
  indentation: number
  embedded: EmbeddedFence | undefined
}

type MarkdownLine = {
  content: string
  lineEnding: string
}

const OPENING_FENCE_RE = /^( {0,3})(`{3,}|~{3,})(.*)$/u
const CLOSING_FENCE_RE = /^( {0,3})(`{3,}|~{3,})[ \t]*$/u
const INFO_WHITESPACE_RE = /[ \t]/u
const LIST_MARKER_RE = /^( {0,3})([-+*]|\d{1,9}[.)])(?:([ \t]+)|$)/u
const LEADING_SPACES_RE = /^ */u
const THEMATIC_BREAK_RE = /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/u
const COMMONMARK_MAX_LIST_MARKER_SPACING = 4
const COMMONMARK_TAB_WIDTH = 4
const MAX_LIST_CONTAINER_LOOKBACK_LINES = 128

function splitMarkdownLines(markdown: string): MarkdownLine[] {
  const lines: MarkdownLine[] = []
  let lineStart = 0

  for (let offset = 0; offset < markdown.length; offset += 1) {
    const character = markdown[offset]
    if (character !== "\r" && character !== "\n") continue

    const lineEnding = character === "\r" && markdown[offset + 1] === "\n" ? "\r\n" : character
    lines.push({ content: markdown.slice(lineStart, offset), lineEnding })
    if (lineEnding === "\r\n") offset += 1
    lineStart = offset + 1
  }

  lines.push({ content: markdown.slice(lineStart), lineEnding: "" })
  return lines
}

function joinMarkdownLines(lines: readonly MarkdownLine[]): string {
  return lines
    .map((line, index) =>
      index < lines.length - 1 ? `${line.content}${line.lineEnding}` : line.content,
    )
    .join("")
}

function fenceInfo(info: string): EmbeddedFence | undefined {
  let languageStart = 0
  while (languageStart < info.length && INFO_WHITESPACE_RE.test(info[languageStart] ?? "")) {
    languageStart += 1
  }

  let languageEnd = languageStart
  while (languageEnd < info.length && !INFO_WHITESPACE_RE.test(info[languageEnd] ?? "")) {
    languageEnd += 1
  }
  const language = info.slice(languageStart, languageEnd).toLowerCase()
  if (language === "mermaid") return { kind: "mermaid" }
  if (!isChemistryFormat(language)) return undefined

  let metadataStart = languageEnd
  while (metadataStart < info.length && INFO_WHITESPACE_RE.test(info[metadataStart] ?? "")) {
    metadataStart += 1
  }
  return {
    kind: "chemistry",
    format: language,
    metadata: parseChemistryFenceMetadata(info.slice(metadataStart)),
  }
}

function matchFence(line: string): FenceMatch | undefined {
  const match = line.match(OPENING_FENCE_RE)
  const indentation = match?.[1]
  const fence = match?.[2]
  if (indentation === undefined || !fence) return undefined

  const fenceChar = fence[0]
  if (fenceChar !== "`" && fenceChar !== "~") return undefined

  const info = match[3] ?? ""
  if (fenceChar === "`" && info.includes("`")) return undefined
  return {
    fenceChar,
    fenceLength: fence.length,
    indentation: indentation.length,
    embedded: fenceInfo(info),
  }
}

function isClosingFence(line: string, opening: FenceMatch): boolean {
  const match = line.match(CLOSING_FENCE_RE)
  const fence = match?.[2]
  return (
    fence !== undefined && fence[0] === opening.fenceChar && fence.length >= opening.fenceLength
  )
}

function listMarkerContentIndent(line: string): number | undefined {
  const match = line.match(LIST_MARKER_RE)
  const indentation = match?.[1]
  const marker = match?.[2]
  const spacing = match?.[3]
  if (indentation === undefined || !marker) return undefined

  const firstSpacingCharacter = spacing?.[0]
  const spacingWidth =
    firstSpacingCharacter === "\t" ||
    !spacing ||
    spacing.length > COMMONMARK_MAX_LIST_MARKER_SPACING
      ? 1
      : spacing.length
  return indentation.length + marker.length + spacingWidth
}

function isListNestedFence(
  lines: readonly MarkdownLine[],
  openingLineIndex: number,
  openingIndentation: number,
): boolean {
  if (openingIndentation === 0) return false

  const earliestLineIndex = Math.max(0, openingLineIndex - MAX_LIST_CONTAINER_LOOKBACK_LINES)
  let minimumContinuationIndent = Number.POSITIVE_INFINITY
  for (let index = openingLineIndex - 1; index >= earliestLineIndex; index -= 1) {
    const line = lines[index]?.content ?? ""
    if (line.trim().length === 0) continue

    if (THEMATIC_BREAK_RE.test(line)) {
      const leadingSpaces = line.match(LEADING_SPACES_RE)?.[0].length ?? 0
      if (leadingSpaces === 0) return false
      minimumContinuationIndent = Math.min(minimumContinuationIndent, leadingSpaces)
      continue
    }

    const listContentIndent = listMarkerContentIndent(line)
    if (listContentIndent !== undefined) {
      return (
        openingIndentation >= listContentIndent && minimumContinuationIndent >= listContentIndent
      )
    }

    const leadingSpaces = line.match(LEADING_SPACES_RE)?.[0].length ?? 0
    if (leadingSpaces === 0) return false
    minimumContinuationIndent = Math.min(minimumContinuationIndent, leadingSpaces)
  }
  return earliestLineIndex > 0
}

function dedentFenceContentLine(line: string, indentation: number): string {
  if (indentation === 0) return line
  let offset = 0
  let visualColumn = 0
  while (offset < line.length && visualColumn < indentation) {
    const character = line[offset]
    if (character === " ") {
      visualColumn += 1
      offset += 1
      continue
    }
    if (character === "\t") {
      const tabWidth = COMMONMARK_TAB_WIDTH - (visualColumn % COMMONMARK_TAB_WIDTH)
      offset += 1
      if (visualColumn + tabWidth > indentation) {
        return `${" ".repeat(visualColumn + tabWidth - indentation)}${line.slice(offset)}`
      }
      visualColumn += tabWidth
      continue
    }
    break
  }
  return line.slice(offset)
}

function fenceSource(
  lines: readonly MarkdownLine[],
  openingLineIndex: number,
  closingLineIndex: number,
  indentation: number,
): string {
  const sourceLines = lines.slice(openingLineIndex + 1, closingLineIndex).map((line) => ({
    content: dedentFenceContentLine(line.content, indentation),
    lineEnding: line.lineEnding,
  }))
  return joinMarkdownLines(sourceLines)
}

function pushHtmlSegment(
  segments: MarkdownSegment[],
  lines: readonly MarkdownLine[],
  segmentIndex: number,
): number {
  const markdown = joinMarkdownLines(lines)
  if (markdown.trim().length === 0) return segmentIndex

  segments.push({ kind: "html", markdown, segmentIndex })
  return segmentIndex + 1
}

export function parseMarkdownSegments(markdown: string): MarkdownSegment[] {
  const lines = splitMarkdownLines(markdown)
  const segments: MarkdownSegment[] = []

  let htmlBuffer: MarkdownLine[] = []
  let segmentIndex = 0
  let lineIndex = 0

  while (lineIndex < lines.length) {
    const line = lines[lineIndex]
    const openingFence = line ? matchFence(line.content) : undefined
    if (!openingFence) {
      if (line) htmlBuffer.push(line)
      lineIndex += 1
      continue
    }

    let closingIndex = lineIndex + 1
    while (closingIndex < lines.length) {
      if (isClosingFence(lines[closingIndex]?.content ?? "", openingFence)) break
      closingIndex += 1
    }

    if (closingIndex >= lines.length) {
      htmlBuffer.push(...lines.slice(lineIndex))
      break
    }

    const rawLines = lines.slice(lineIndex, closingIndex + 1)
    if (!openingFence.embedded || isListNestedFence(lines, lineIndex, openingFence.indentation)) {
      htmlBuffer.push(...rawLines)
      lineIndex = closingIndex + 1
      continue
    }

    segmentIndex = pushHtmlSegment(segments, htmlBuffer, segmentIndex)
    htmlBuffer = []

    const source = fenceSource(lines, lineIndex, closingIndex, openingFence.indentation)
    const raw = joinMarkdownLines(rawLines)
    if (openingFence.embedded.kind === "mermaid") {
      segments.push({ kind: "mermaid", source, raw, segmentIndex })
    } else {
      const embedded = openingFence.embedded
      segments.push({
        kind: "chemistry",
        format: embedded.format,
        source,
        raw,
        metadata: embedded.metadata,
        alt: chemistryFenceAccessibleLabel({
          format: embedded.format,
          source,
          alt: embedded.metadata.alt,
        }),
        caption: embedded.metadata.caption,
        segmentIndex,
      })
    }
    segmentIndex += 1
    lineIndex = closingIndex + 1
  }

  pushHtmlSegment(segments, htmlBuffer, segmentIndex)
  return segments
}
