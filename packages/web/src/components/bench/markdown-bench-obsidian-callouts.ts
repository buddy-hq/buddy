const OBSIDIAN_CALLOUT_START_PATTERN = /^(\s*)>\s*\[!([a-z0-9_-]+)\]([+-]?)(?:\s+(.*))?$/iu
const OBSIDIAN_CALLOUT_BODY_PATTERN = /^(\s*)>(?:\s?(.*))?$/u
const OBSIDIAN_CALLOUT_DIRECTIVE_START_PATTERN = /^(\s*):::obsidian-callout(?:\{(.*)\})?$/u
const OBSIDIAN_CALLOUT_DIRECTIVE_END_PATTERN = /^(\s*):::\s*$/u
const OBSIDIAN_CALLOUT_ATTRIBUTE_PATTERN = /([a-z]+)=("(?:\\.|[^"])*")/giu
const MARKDOWN_FENCE_START_PATTERN = /^[\t ]*(`{3,}|~{3,})[^\r\n]*$/u
const MARKDOWN_FRONTMATTER_START_PATTERN = /^\uFEFF?---[\t ]*$/u
const MARKDOWN_FRONTMATTER_END_PATTERN = /^(?:---|\.\.\.)[\t ]*$/u

type MarkdownSourceLine = {
  content: string
  ending: string
}

type ObsidianCalloutAttributes = {
  fold?: string
  kind: string
  title?: string
}

function splitMarkdownSource(markdown: string): MarkdownSourceLine[] {
  if (markdown.length === 0) return [{ content: "", ending: "" }]

  const lines: MarkdownSourceLine[] = []
  let start = 0
  while (start < markdown.length) {
    let end = start
    while (end < markdown.length && markdown[end] !== "\r" && markdown[end] !== "\n") {
      end += 1
    }

    if (end === markdown.length) {
      lines.push({ content: markdown.slice(start), ending: "" })
      break
    }

    const ending =
      markdown[end] === "\r" && markdown[end + 1] === "\n" ? "\r\n" : markdown[end] ?? ""
    lines.push({ content: markdown.slice(start, end), ending })
    start = end + ending.length
  }
  return lines
}

function isFenceEnd(content: string, marker: string): boolean {
  const trimmed = content.trim()
  if (trimmed.length < marker.length) return false
  return Array.from(trimmed).every((character) => character === marker[0])
}

function protectedMarkdownLineIndexes(lines: readonly MarkdownSourceLine[]): ReadonlySet<number> {
  const protectedIndexes = new Set<number>()
  if (MARKDOWN_FRONTMATTER_START_PATTERN.test(lines[0]?.content ?? "")) {
    const end = lines.findIndex(
      (line, index) => index > 0 && MARKDOWN_FRONTMATTER_END_PATTERN.test(line.content),
    )
    if (end > 0) {
      for (let index = 0; index <= end; index += 1) protectedIndexes.add(index)
    }
  }

  let activeFence: string | undefined
  for (let index = 0; index < lines.length; index += 1) {
    if (protectedIndexes.has(index)) continue
    const content = lines[index]?.content ?? ""
    if (activeFence) {
      protectedIndexes.add(index)
      if (isFenceEnd(content, activeFence)) activeFence = undefined
      continue
    }

    const marker = MARKDOWN_FENCE_START_PATTERN.exec(content)?.[1]
    if (!marker) continue
    protectedIndexes.add(index)
    activeFence = marker
  }

  return protectedIndexes
}

function preferredLineEnding(lines: readonly MarkdownSourceLine[]): string {
  return lines.find((line) => line.ending.length > 0)?.ending ?? "\n"
}

function renderReplacementBlock(input: {
  lines: readonly MarkdownSourceLine[]
  start: number
  end: number
  contents: readonly string[]
}): string {
  const internalEnding =
    input.lines
      .slice(input.start, input.end + 1)
      .find((line) => line.ending.length > 0)?.ending ?? preferredLineEnding(input.lines)
  const trailingEnding = input.lines[input.end]?.ending ?? ""
  return input.contents
    .map((content, index) => {
      const ending = index === input.contents.length - 1 ? trailingEnding : internalEnding
      return `${content}${ending}`
    })
    .join("")
}

function directiveAttribute(name: string, value: string | undefined): string | undefined {
  return value === undefined || value.length === 0 ? undefined : `${name}=${JSON.stringify(value)}`
}

function renderDirectiveStart(attributes: ObsidianCalloutAttributes): string {
  const serialized = [
    directiveAttribute("kind", attributes.kind),
    directiveAttribute("fold", attributes.fold),
    directiveAttribute("title", attributes.title),
  ].filter((value): value is string => value !== undefined)
  return `:::obsidian-callout{${serialized.join(" ")}}`
}

function parseDirectiveAttributes(source: string | undefined): ObsidianCalloutAttributes | undefined {
  if (!source) return undefined
  const attributes = new Map<string, string>()
  for (const match of source.matchAll(OBSIDIAN_CALLOUT_ATTRIBUTE_PATTERN)) {
    const name = match[1]
    const rawValue = match[2]
    if (!name || !rawValue) continue
    try {
      const parsed: unknown = JSON.parse(rawValue)
      if (typeof parsed === "string") attributes.set(name, parsed)
    } catch {
      continue
    }
  }
  const kind = attributes.get("kind")
  if (!kind) return undefined
  const fold = attributes.get("fold")
  const title = attributes.get("title")
  return {
    kind,
    ...(fold ? { fold } : {}),
    ...(title ? { title } : {}),
  }
}

export function prepareObsidianCalloutsForMdxEditor(markdown: string): string {
  const lines = splitMarkdownSource(markdown)
  const protectedIndexes = protectedMarkdownLineIndexes(lines)
  const output: string[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? { content: "", ending: "" }
    if (protectedIndexes.has(index)) {
      output.push(`${line.content}${line.ending}`)
      continue
    }
    const start = OBSIDIAN_CALLOUT_START_PATTERN.exec(line.content)
    if (!start) {
      output.push(`${line.content}${line.ending}`)
      continue
    }

    const indent = start[1] ?? ""
    const kind = start[2] ?? "note"
    const fold = start[3] || undefined
    const title = start[4]?.trim() || undefined
    const body: string[] = []
    const blockStart = index

    while (index + 1 < lines.length) {
      if (protectedIndexes.has(index + 1)) break
      const candidate = lines[index + 1]?.content ?? ""
      const bodyMatch = OBSIDIAN_CALLOUT_BODY_PATTERN.exec(candidate)
      if (!bodyMatch || (bodyMatch[1] ?? "") !== indent) break
      body.push(bodyMatch[2] ?? "")
      index += 1
    }

    output.push(
      renderReplacementBlock({
        lines,
        start: blockStart,
        end: index,
        contents: [
          `${indent}${renderDirectiveStart({ kind, fold, title })}`,
          ...body.map((bodyLine) => `${indent}${bodyLine}`),
          `${indent}:::`,
        ],
      }),
    )
  }

  return output.join("")
}

export function restoreObsidianCalloutsFromMdxEditor(markdown: string): string {
  const lines = splitMarkdownSource(markdown)
  const protectedIndexes = protectedMarkdownLineIndexes(lines)
  const output: string[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? { content: "", ending: "" }
    if (protectedIndexes.has(index)) {
      output.push(`${line.content}${line.ending}`)
      continue
    }
    const start = OBSIDIAN_CALLOUT_DIRECTIVE_START_PATTERN.exec(line.content)
    const indent = start?.[1] ?? ""
    const attributes = parseDirectiveAttributes(start?.[2])
    if (!start || !attributes) {
      output.push(`${line.content}${line.ending}`)
      continue
    }

    let blockEnd = index + 1
    while (blockEnd < lines.length) {
      const end = OBSIDIAN_CALLOUT_DIRECTIVE_END_PATTERN.exec(lines[blockEnd]?.content ?? "")
      if (end && (end[1] ?? "") === indent) break
      blockEnd += 1
    }
    if (blockEnd >= lines.length) {
      output.push(`${line.content}${line.ending}`)
      continue
    }

    const body = lines.slice(index + 1, blockEnd).map((bodyLine) =>
      bodyLine.content.startsWith(indent)
        ? bodyLine.content.slice(indent.length)
        : bodyLine.content,
    )
    const marker = `[!${attributes.kind}]${attributes.fold ?? ""}`
    output.push(
      renderReplacementBlock({
        lines,
        start: index,
        end: blockEnd,
        contents: [
          `${indent}> ${marker}${attributes.title ? ` ${attributes.title}` : ""}`,
          ...body.map((bodyLine) => (bodyLine ? `${indent}> ${bodyLine}` : `${indent}>`)),
        ],
      }),
    )
    index = blockEnd
  }

  return output.join("")
}
