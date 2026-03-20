import matter from "gray-matter"
import { RecursiveChunker } from "@chonkiejs/core"
import type {
  ResourceChunkFileRecord,
  ResourceChunkFileKind,
  ResourceChunkSplitReason,
  ResourceChunkUnitKind,
  ResourceChunkUnitSeed,
  ResourceFormat,
} from "./contracts"
import {
  RESOURCE_PACK_CHAPTER_MAX_CHARS,
  RESOURCE_PACK_CHAPTER_MAX_TOKENS,
  RESOURCE_PACK_FILE_KIND_GENERIC_CHUNK,
  RESOURCE_PACK_FILE_KIND_PAGE_WINDOW,
  RESOURCE_PACK_FILE_KIND_UNIT,
  RESOURCE_PACK_FILENAME_CHAR_PAD,
  RESOURCE_PACK_FILENAME_CHAR_LABEL,
  RESOURCE_PACK_FILENAME_INDEX_PAD,
  RESOURCE_PACK_FILENAME_OF_LABEL,
  RESOURCE_PACK_FILENAME_PAGE_PAD,
  RESOURCE_PACK_FILENAME_PART_LABEL,
  RESOURCE_PACK_FILENAME_TOKEN_LABEL,
  RESOURCE_PACK_FILENAME_TOKEN_PAD,
  RESOURCE_PACK_FALLBACK_MIN_BOUNDARY_RATIO,
  RESOURCE_PACK_GENERIC_FILE_PREFIX,
  RESOURCE_PACK_NON_CHAPTER_MAX_CHARS,
  RESOURCE_PACK_NON_CHAPTER_MAX_TOKENS,
  RESOURCE_PACK_PAGE_WINDOW_FILE_PREFIX,
  RESOURCE_PACK_RECURSIVE_MIN_CHARS_PER_CHUNK,
  RESOURCE_PACK_SPLIT_REASON_FALLBACK_STRUCTURE,
  RESOURCE_PACK_SPLIT_REASON_INTACT,
  RESOURCE_PACK_SPLIT_REASON_OVER_THRESHOLD,
  RESOURCE_PACK_TITLE_SLUG_MAX_CHARS,
  RESOURCE_PACK_UNIT_FILE_PREFIX,
  RESOURCE_PACK_UNIT_KIND_CHAPTER,
  RESOURCE_PACK_UNIT_KIND_GENERIC,
  RESOURCE_PACK_UNIT_KIND_PAGE_WINDOW,
  RESOURCE_PACK_UNIT_KIND_SECTION,
  estimateTokenCountFromText,
} from "./chunking-config"

type ChunkThreshold = {
  maxTokens: number
  maxChars: number
}

type ChunkPart = {
  text: string
  splitReason: ResourceChunkSplitReason
}

const recursiveChunkerCache = new Map<number, Promise<RecursiveChunker>>()

export async function buildResourceChunkFiles(input: {
  resourceAlias: string
  sourceRelpath: string
  format: ResourceFormat
  fullText: string
  chunkUnits?: ResourceChunkUnitSeed[]
}): Promise<ResourceChunkFileRecord[]> {
  const normalizedFullText = normalizeText(input.fullText)
  if (!normalizedFullText) return []

  const seeds = input.chunkUnits && input.chunkUnits.length > 0
    ? input.chunkUnits.filter((seed) => seed.text.trim().length > 0)
    : deriveUnitSeedsFromFullText(normalizedFullText)

  const normalizedSeeds = seeds.length > 0
    ? seeds
    : [
      {
        unitKind: RESOURCE_PACK_UNIT_KIND_GENERIC,
        unitTitle: "Chunk 1",
        unitIndex: 1,
        text: normalizedFullText,
        splitReason: RESOURCE_PACK_SPLIT_REASON_FALLBACK_STRUCTURE,
      } satisfies ResourceChunkUnitSeed,
    ]

  const chunkFiles: ResourceChunkFileRecord[] = []
  let genericIndex = 1

  for (let seedIndex = 0; seedIndex < normalizedSeeds.length; seedIndex += 1) {
    const seed = normalizedSeeds[seedIndex]
    if (!seed) continue

    const threshold = chunkThresholdForUnit(seed.unitKind)
    const baseTitle = resolveUnitTitle(seed, seedIndex + 1)
    const unitIndex = seed.unitIndex ?? (seedIndex + 1)
    const parts = await splitSeedIntoParts(seed, threshold, { format: input.format })
    const partCount = parts.length

    for (let partOffset = 0; partOffset < partCount; partOffset += 1) {
      const part = parts[partOffset]
      if (!part) continue
      const partIndex = partOffset + 1
      const chars = part.text.length
      const estTokens = estimateTokenCountFromText(part.text)
      const partKey = buildPartKey(unitIndex, partIndex)
      const prevPart = partIndex > 1 ? buildPartKey(unitIndex, partIndex - 1) : null
      const nextPart = partIndex < partCount ? buildPartKey(unitIndex, partIndex + 1) : null
      const fileKind = fileKindForUnit(seed.unitKind)
      const filename = fileKind === RESOURCE_PACK_FILE_KIND_PAGE_WINDOW
        ? buildPageWindowFilename({
            pageStart: seed.pageStart ?? unitIndex,
            pageEnd: seed.pageEnd ?? (seed.pageStart ?? unitIndex),
            partIndex,
            partCount,
            estTokens,
            chars,
          })
        : fileKind === RESOURCE_PACK_FILE_KIND_GENERIC_CHUNK
          ? buildGenericFilename({
              chunkIndex: genericIndex,
              estTokens,
              chars,
            })
          : buildUnitFilename({
              unitIndex,
              unitTitle: baseTitle,
              partIndex,
              partCount,
              estTokens,
              chars,
            })

      if (fileKind === RESOURCE_PACK_FILE_KIND_GENERIC_CHUNK) {
        genericIndex += 1
      }

      const label = partCount > 1
        ? `${baseTitle} | Part ${partIndex}/${partCount} | chars=${chars} | est_tokens=${estTokens}`
        : `${baseTitle} | chars=${chars} | est_tokens=${estTokens}`

      const markdownBody = [
        `# ${label}`,
        "",
        part.text.trim(),
      ].join("\n")

      const frontmatter: Record<string, unknown> = {
        file_kind: fileKind,
        resource_alias: input.resourceAlias,
        source_relpath: input.sourceRelpath,
        format: input.format,
        unit_kind: seed.unitKind,
        unit_title: baseTitle,
        unit_index: unitIndex,
        part_index: partIndex,
        part_count: partCount,
        part_key: partKey,
        prev_part: prevPart,
        next_part: nextPart,
        chars,
        est_tokens: estTokens,
        threshold_tokens: threshold.maxTokens,
        split_reason: part.splitReason,
      }

      if (seed.pageStart !== undefined) {
        frontmatter.page_start = seed.pageStart
      }
      if (seed.pageEnd !== undefined) {
        frontmatter.page_end = seed.pageEnd
      }

      chunkFiles.push({
        filename,
        content: matter.stringify(markdownBody, frontmatter),
      })
    }
  }

  return chunkFiles
}

function deriveUnitSeedsFromFullText(fullText: string): ResourceChunkUnitSeed[] {
  const topLevel = splitMarkdownByHeadingLevel(fullText, 1)
  if (topLevel.length >= 2) return topLevel

  const nested = splitMarkdownByAnyHeading(fullText, RESOURCE_PACK_SPLIT_REASON_FALLBACK_STRUCTURE)
  if (nested.length >= 2) return nested

  return [
    {
      unitKind: RESOURCE_PACK_UNIT_KIND_GENERIC,
      unitTitle: "Chunk 1",
      unitIndex: 1,
      text: fullText,
      splitReason: RESOURCE_PACK_SPLIT_REASON_FALLBACK_STRUCTURE,
    },
  ]
}

function splitMarkdownByHeadingLevel(
  fullText: string,
  level: number,
  splitReason?: ResourceChunkSplitReason,
): ResourceChunkUnitSeed[] {
  const lines = normalizeText(fullText).split("\n")
  const units: ResourceChunkUnitSeed[] = []
  const headingPrefix = `${"#".repeat(level)} `
  let currentTitle = ""
  let currentBody: string[] = []
  let fallbackIndex = 1

  const flushCurrent = () => {
    const body = currentBody.join("\n").trim()
    if (!body) {
      currentBody = []
      return
    }
    const title = currentTitle.trim() || `Section ${fallbackIndex}`
    units.push({
      unitKind: RESOURCE_PACK_UNIT_KIND_SECTION,
      unitTitle: title,
      unitIndex: units.length + 1,
      text: body,
      splitReason,
    })
    currentBody = []
    currentTitle = ""
    fallbackIndex += 1
  }

  for (const line of lines) {
    if (line.startsWith(headingPrefix)) {
      flushCurrent()
      currentTitle = line.slice(headingPrefix.length).trim()
      continue
    }
    currentBody.push(line)
  }

  flushCurrent()
  return units
}

function splitMarkdownByAnyHeading(fullText: string, splitReason?: ResourceChunkSplitReason): ResourceChunkUnitSeed[] {
  const lines = normalizeText(fullText).split("\n")
  const units: ResourceChunkUnitSeed[] = []
  let currentTitle = ""
  let currentBody: string[] = []
  let fallbackIndex = 1

  const flushCurrent = () => {
    const body = currentBody.join("\n").trim()
    if (!body) {
      currentBody = []
      return
    }
    const title = currentTitle.trim() || `Section ${fallbackIndex}`
    units.push({
      unitKind: RESOURCE_PACK_UNIT_KIND_SECTION,
      unitTitle: title,
      unitIndex: units.length + 1,
      text: body,
      splitReason,
    })
    currentBody = []
    currentTitle = ""
    fallbackIndex += 1
  }

  for (const line of lines) {
    const heading = line.match(/^#{1,6}\s+(.*)$/)
    if (heading) {
      flushCurrent()
      currentTitle = (heading[1] ?? "").trim()
      continue
    }
    currentBody.push(line)
  }

  flushCurrent()
  return units
}

async function splitSeedIntoParts(
  seed: ResourceChunkUnitSeed,
  threshold: ChunkThreshold,
  input: { format: ResourceFormat },
): Promise<ChunkPart[]> {
  const trimmed = normalizeText(seed.text)
  if (!trimmed) return []
  if (estimateTokenCountFromText(trimmed) <= threshold.maxTokens) {
    return [{ text: trimmed, splitReason: seed.splitReason ?? RESOURCE_PACK_SPLIT_REASON_INTACT }]
  }

  if (input.format === "epub" && seed.unitKind === RESOURCE_PACK_UNIT_KIND_CHAPTER) {
    const headingParts = splitByMarkdownHeadingBoundary(trimmed, threshold.maxChars)
    if (headingParts.length > 1) {
      return headingParts.map((text) => ({
        text,
        splitReason: RESOURCE_PACK_SPLIT_REASON_OVER_THRESHOLD,
      }))
    }
  }

  const splitParts = await splitWithRecursiveChunker(trimmed, threshold.maxChars)
  if (splitParts.length <= 1) {
    return [{ text: trimmed, splitReason: RESOURCE_PACK_SPLIT_REASON_OVER_THRESHOLD }]
  }

  return splitParts.map((text) => ({
    text,
    splitReason: RESOURCE_PACK_SPLIT_REASON_OVER_THRESHOLD,
  }))
}

function splitByMarkdownHeadingBoundary(text: string, maxChars: number): string[] {
  const trimmed = normalizeText(text)
  if (!trimmed) return []
  if (trimmed.length <= maxChars) return [trimmed]

  const headingBoundaries = collectMarkdownHeadingBoundaries(trimmed)
  if (headingBoundaries.length === 0) return [trimmed]

  const parts: string[] = []
  let cursor = 0

  while (cursor < trimmed.length) {
    if (trimmed.length - cursor <= maxChars) {
      const tail = normalizeText(trimmed.slice(cursor))
      if (tail) parts.push(tail)
      break
    }

    const target = cursor + maxChars
    const headingBoundary = findHeadingBoundaryNearTarget({
      cursor,
      target,
      headingBoundaries,
    })
    if (headingBoundary === undefined) return [trimmed]

    const part = normalizeText(trimmed.slice(cursor, headingBoundary))
    if (!part) return [trimmed]
    parts.push(part)
    cursor = headingBoundary

    while (cursor < trimmed.length && /\s/.test(trimmed[cursor] ?? "")) {
      cursor += 1
    }
  }

  return parts.length > 1 ? parts : [trimmed]
}

function collectMarkdownHeadingBoundaries(text: string): number[] {
  const lines = text.split("\n")
  const boundaries: number[] = []
  let cursor = 0

  for (const line of lines) {
    if (cursor > 0 && /^#{1,6}\s+\S/u.test(line)) {
      boundaries.push(cursor)
    }
    cursor += line.length + 1
  }

  return boundaries
}

function findHeadingBoundaryNearTarget(input: {
  cursor: number
  target: number
  headingBoundaries: number[]
}): number | undefined {
  const minUsefulBoundary = input.cursor +
    Math.floor((input.target - input.cursor) * RESOURCE_PACK_FALLBACK_MIN_BOUNDARY_RATIO)
  let candidate: number | undefined

  for (const boundary of input.headingBoundaries) {
    if (boundary <= input.cursor) continue
    if (boundary > input.target) break
    if (boundary >= minUsefulBoundary) {
      candidate = boundary
    }
  }

  return candidate
}

async function splitWithRecursiveChunker(text: string, maxChars: number): Promise<string[]> {
  const chunker = await getRecursiveChunker(maxChars)
  const chunks = await chunker.chunk(text)
  const chunkTexts = chunks.map((chunk) => normalizeText(chunk.text)).filter((entry) => entry.length > 0)

  if (chunkTexts.length > 1) return chunkTexts
  return splitByCharacterWindow(text, maxChars)
}

function getRecursiveChunker(maxChars: number): Promise<RecursiveChunker> {
  const existing = recursiveChunkerCache.get(maxChars)
  if (existing) return existing

  const created = RecursiveChunker.create({
    chunkSize: maxChars,
    tokenizer: "character",
    minCharactersPerChunk: RESOURCE_PACK_RECURSIVE_MIN_CHARS_PER_CHUNK,
  })
  recursiveChunkerCache.set(maxChars, created)
  return created
}

function splitByCharacterWindow(text: string, maxChars: number): string[] {
  const trimmed = normalizeText(text)
  if (!trimmed) return []
  if (trimmed.length <= maxChars) return [trimmed]

  const parts: string[] = []
  let cursor = 0

  while (cursor < trimmed.length) {
    if (trimmed.length - cursor <= maxChars) {
      const tail = normalizeText(trimmed.slice(cursor))
      if (tail) parts.push(tail)
      break
    }

    const target = cursor + maxChars
    const boundaryByParagraph = trimmed.lastIndexOf("\n\n", target)
    const boundaryByLine = trimmed.lastIndexOf("\n", target)
    const boundary = chooseSplitBoundary(cursor, target, boundaryByParagraph, boundaryByLine)
    const part = normalizeText(trimmed.slice(cursor, boundary))
    if (part) {
      parts.push(part)
      cursor = boundary
      while (cursor < trimmed.length && /\s/.test(trimmed[cursor] ?? "")) {
        cursor += 1
      }
      continue
    }

    const forced = normalizeText(trimmed.slice(cursor, target))
    if (forced) {
      parts.push(forced)
      cursor = target
      continue
    }

    break
  }

  return parts.length > 0 ? parts : [trimmed]
}

function chooseSplitBoundary(
  cursor: number,
  target: number,
  paragraphBoundary: number,
  lineBoundary: number,
): number {
  const minUsefulBoundary = cursor + Math.floor((target - cursor) * RESOURCE_PACK_FALLBACK_MIN_BOUNDARY_RATIO)
  if (paragraphBoundary >= minUsefulBoundary) return paragraphBoundary
  if (lineBoundary >= minUsefulBoundary) return lineBoundary
  return target
}

function chunkThresholdForUnit(unitKind: ResourceChunkUnitKind): ChunkThreshold {
  if (unitKind === RESOURCE_PACK_UNIT_KIND_CHAPTER) {
    return {
      maxTokens: RESOURCE_PACK_CHAPTER_MAX_TOKENS,
      maxChars: RESOURCE_PACK_CHAPTER_MAX_CHARS,
    }
  }
  return {
    maxTokens: RESOURCE_PACK_NON_CHAPTER_MAX_TOKENS,
    maxChars: RESOURCE_PACK_NON_CHAPTER_MAX_CHARS,
  }
}

function resolveUnitTitle(seed: ResourceChunkUnitSeed, defaultIndex: number): string {
  const provided = seed.unitTitle?.trim()
  if (provided) return provided
  if (seed.unitKind === RESOURCE_PACK_UNIT_KIND_PAGE_WINDOW) {
    const start = seed.pageStart ?? defaultIndex
    const end = seed.pageEnd ?? start
    return start === end ? `Page ${start}` : `Pages ${start}-${end}`
  }
  return `Unit ${seed.unitIndex ?? defaultIndex}`
}

function fileKindForUnit(unitKind: ResourceChunkUnitKind): ResourceChunkFileKind {
  if (unitKind === RESOURCE_PACK_UNIT_KIND_PAGE_WINDOW) return RESOURCE_PACK_FILE_KIND_PAGE_WINDOW
  if (unitKind === RESOURCE_PACK_UNIT_KIND_GENERIC) return RESOURCE_PACK_FILE_KIND_GENERIC_CHUNK
  return RESOURCE_PACK_FILE_KIND_UNIT
}

function buildUnitFilename(input: {
  unitIndex: number
  unitTitle: string
  partIndex: number
  partCount: number
  estTokens: number
  chars: number
}) {
  const unitIndex = padNumber(input.unitIndex, RESOURCE_PACK_FILENAME_INDEX_PAD)
  const titleSlug = slugify(input.unitTitle)
  const tokens = padNumber(input.estTokens, RESOURCE_PACK_FILENAME_TOKEN_PAD)
  const chars = padNumber(input.chars, RESOURCE_PACK_FILENAME_CHAR_PAD)
  const partSuffix = input.partCount > 1
    ? `-${RESOURCE_PACK_FILENAME_PART_LABEL}-${padNumber(input.partIndex, RESOURCE_PACK_FILENAME_INDEX_PAD)}-${RESOURCE_PACK_FILENAME_OF_LABEL}-${padNumber(input.partCount, RESOURCE_PACK_FILENAME_INDEX_PAD)}`
    : ""

  return [
    RESOURCE_PACK_UNIT_FILE_PREFIX,
    unitIndex,
    titleSlug,
  ].join("-") + `${partSuffix}-${RESOURCE_PACK_FILENAME_TOKEN_LABEL}-${tokens}-${RESOURCE_PACK_FILENAME_CHAR_LABEL}-${chars}.md`
}

function buildPageWindowFilename(input: {
  pageStart: number
  pageEnd: number
  partIndex: number
  partCount: number
  estTokens: number
  chars: number
}) {
  const partSuffix = input.partCount > 1
    ? `-${RESOURCE_PACK_FILENAME_PART_LABEL}-${padNumber(input.partIndex, RESOURCE_PACK_FILENAME_INDEX_PAD)}-${RESOURCE_PACK_FILENAME_OF_LABEL}-${padNumber(input.partCount, RESOURCE_PACK_FILENAME_INDEX_PAD)}`
    : ""
  return [
    RESOURCE_PACK_PAGE_WINDOW_FILE_PREFIX,
    padNumber(input.pageStart, RESOURCE_PACK_FILENAME_PAGE_PAD),
    padNumber(input.pageEnd, RESOURCE_PACK_FILENAME_PAGE_PAD),
  ].join("-") + `${partSuffix}-${RESOURCE_PACK_FILENAME_TOKEN_LABEL}-${padNumber(input.estTokens, RESOURCE_PACK_FILENAME_TOKEN_PAD)}-${RESOURCE_PACK_FILENAME_CHAR_LABEL}-${padNumber(input.chars, RESOURCE_PACK_FILENAME_CHAR_PAD)}.md`
}

function buildGenericFilename(input: {
  chunkIndex: number
  estTokens: number
  chars: number
}) {
  return [
    RESOURCE_PACK_GENERIC_FILE_PREFIX,
    padNumber(input.chunkIndex, RESOURCE_PACK_FILENAME_INDEX_PAD),
    RESOURCE_PACK_FILENAME_TOKEN_LABEL,
    padNumber(input.estTokens, RESOURCE_PACK_FILENAME_TOKEN_PAD),
    RESOURCE_PACK_FILENAME_CHAR_LABEL,
    padNumber(input.chars, RESOURCE_PACK_FILENAME_CHAR_PAD),
  ].join("-") + ".md"
}

function buildPartKey(unitIndex: number, partIndex: number) {
  return `unit-${padNumber(unitIndex, RESOURCE_PACK_FILENAME_INDEX_PAD)}-part-${padNumber(partIndex, RESOURCE_PACK_FILENAME_INDEX_PAD)}`
}

function padNumber(value: number, width: number) {
  return String(Math.max(0, Math.trunc(value))).padStart(width, "0")
}

function slugify(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

  const limited = normalized.slice(0, RESOURCE_PACK_TITLE_SLUG_MAX_CHARS)
  return limited.length > 0 ? limited : "unit"
}

function normalizeText(value: string) {
  return value.replace(/\r\n/g, "\n").trim()
}
