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

type FenceMatch = {
  fenceChar: "`" | "~"
  fenceLength: number
}

function matchFence(line: string): FenceMatch | undefined {
  const match = line.match(/^( {0,3})(`{3,}|~{3,})[ \t]*mermaid(?:[ \t].*)?$/iu)
  if (!match?.[2]) {
    return undefined
  }
  const fence = match[2]
  const fenceChar = fence[0]
  if (fenceChar !== "`" && fenceChar !== "~") {
    return undefined
  }
  return {
    fenceChar,
    fenceLength: fence.length,
  }
}

function isClosingFence(line: string, opening: FenceMatch): boolean {
  const match = line.match(/^( {0,3})(`{3,}|~{3,})[ \t]*$/u)
  if (!match?.[2]) {
    return false
  }
  const fence = match[2]
  return fence[0] === opening.fenceChar && fence.length >= opening.fenceLength
}

function pushHtmlSegment(
  segments: MarkdownSegment[],
  markdown: string,
  segmentIndex: number,
): number {
  if (markdown.trim().length === 0) {
    return segmentIndex
  }
  segments.push({
    kind: "html",
    markdown,
    segmentIndex,
  })
  return segmentIndex + 1
}

export function parseMarkdownSegments(markdown: string): MarkdownSegment[] {
  const normalized = markdown.replace(/\r\n?/gu, "\n")
  const lines = normalized.split("\n")
  const segments: MarkdownSegment[] = []

  let htmlBuffer: string[] = []
  let segmentIndex = 0
  let lineIndex = 0

  while (lineIndex < lines.length) {
    const line = lines[lineIndex] ?? ""
    const openingFence = matchFence(line)
    if (!openingFence) {
      htmlBuffer.push(line)
      lineIndex += 1
      continue
    }

    let closingIndex = lineIndex + 1
    while (closingIndex < lines.length) {
      if (isClosingFence(lines[closingIndex] ?? "", openingFence)) {
        break
      }
      closingIndex += 1
    }

    if (closingIndex >= lines.length) {
      htmlBuffer.push(...lines.slice(lineIndex))
      break
    }

    const htmlMarkdown = htmlBuffer.join("\n")
    segmentIndex = pushHtmlSegment(segments, htmlMarkdown, segmentIndex)
    htmlBuffer = []

    const rawLines = lines.slice(lineIndex, closingIndex + 1)
    const sourceLines = lines.slice(lineIndex + 1, closingIndex)
    segments.push({
      kind: "mermaid",
      source: sourceLines.join("\n"),
      raw: rawLines.join("\n"),
      segmentIndex,
    })
    segmentIndex += 1
    lineIndex = closingIndex + 1
  }

  pushHtmlSegment(segments, htmlBuffer.join("\n"), segmentIndex)
  return segments
}
