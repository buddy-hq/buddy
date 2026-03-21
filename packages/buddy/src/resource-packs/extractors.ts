import { promises as fs } from 'node:fs'
import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import { BlobReader, TextWriter, ZipReader, type Entry, type FileEntry } from '@zip.js/zip.js'
import { XMLParser } from 'fast-xml-parser'
import mammoth from 'mammoth'
import TurndownService from 'turndown'
import {
  RESOURCE_PACK_STATUS_READY,
  RESOURCE_PACK_STATUS_UNSUPPORTED,
  RESOURCE_PACK_UNSUPPORTED_WARNING,
  type ResourceChunkUnitKind,
  type ResourceChunkUnitSeed,
  type ResourceClassification,
  type ResourceExtractionResult,
} from './contracts'
import {
  RESOURCE_PACK_NON_CHAPTER_MAX_CHARS,
  RESOURCE_PACK_SPLIT_REASON_FALLBACK_STRUCTURE,
  RESOURCE_PACK_UNIT_KIND_CHAPTER,
  RESOURCE_PACK_UNIT_KIND_GENERIC,
  RESOURCE_PACK_UNIT_KIND_PAGE_WINDOW,
} from './chunking-config'
import {
  buildHeadingTocMarkdown,
  renderNoTextMarkdown,
  renderPageMarkdown,
  renderTocMarkdown,
} from './markdown'

type XmlRecord = Record<string, unknown>
type ResourcePackZipEntry = FileEntry
type PdfOutlinePoint = {
  title: string
  depth: number
  pageNumber: number
}
type PdfTextContentLike = {
  items: unknown[]
}
type PdfPageLike = {
  getTextContent(): Promise<PdfTextContentLike>
}
type PdfDocumentLike = {
  numPages: number
  getOutline(): Promise<unknown>
  getPage(pageNumber: number): Promise<PdfPageLike>
  getDestination(name: string): Promise<unknown>
  getPageIndex(reference: unknown): Promise<number>
}

const execFileAsync = promisify(execFile)
const PDF_TEXT_COMMAND_BUFFER_BYTES = 128 * 1024 * 1024
const PDF_PAGE_DELIMITER_REGEX = /\f/g
const PDF_HEADING_SCAN_MAX_LINES = 18
const PDF_HEADING_SCAN_MAX_LENGTH = 200
const PDF_TOC_HINT_REGEX = /\btable of contents\b/i
const PDF_CHUNKING_FALLBACK_WARNING =
  'No PDF outline or chapter headings were found; using page-window chunking.'
const PDF_CHUNKING_GENERIC_WARNING =
  'Structured chunking was unavailable; using generic paragraph chunking.'
const PDF_HEADING_PATTERNS = [
  /^chapter\s+([0-9ivxlcdm]+)\b[:.\-\s]*(.*)$/i,
  /^part\s+([0-9ivxlcdm]+)\b[:.\-\s]*(.*)$/i,
]

const resourcePackXMLParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  trimValues: true,
  removeNSPrefix: true,
})

const resourceTurndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
})

export async function extractResourcePack(
  sourcePath: string,
  classification: ResourceClassification,
): Promise<ResourceExtractionResult> {
  switch (classification.format) {
    case 'pdf':
      return extractPdfResource(sourcePath)
    case 'epub':
      return extractEpubResource(sourcePath)
    case 'docx':
      return extractDocxResource(sourcePath)
    case 'html':
    case 'htm':
    case 'xhtml':
      return extractHtmlResource(sourcePath, classification.format)
    default:
      return extractTextResource(sourcePath, classification.format)
  }
}

async function extractPdfResource(sourcePath: string): Promise<ResourceExtractionResult> {
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const bytes = new Uint8Array(await fs.readFile(sourcePath))
    const loadingTask = pdfjs.getDocument({
      data: bytes,
      useWorkerFetch: false,
      isEvalSupported: false,
    })
    const document = asPdfDocument(await loadingTask.promise)
    const pageMarkdowns: Array<{ pageNumber: number; markdown: string }> = []
    const pageTexts: string[] = []
    const tocLines: string[] = []
    const warnings: string[] = []

    const outline = await document.getOutline().catch(() => undefined)
    const outlineNodes = Array.isArray(outline) ? outline : []
    if (outlineNodes.length > 0) {
      flattenPdfOutline(outlineNodes, tocLines)
    }
    const outlinePoints = await buildPdfOutlinePoints(document, outlineNodes)

    let extractedCharacters = 0
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      try {
        const page = await document.getPage(pageNumber)
        const content = await page.getTextContent()
        const pageText = renderPdfTextContent(content.items)
        pageTexts.push(pageText)
        extractedCharacters += pageText.replace(/\s+/g, '').length
        pageMarkdowns.push({
          pageNumber,
          markdown: renderPageMarkdown(pageNumber, pageText),
        })
      } catch (error) {
        warnings.push(`Failed to extract PDF page ${pageNumber}: ${errorMessage(error)}`)
      }
    }

    const fullText = pageMarkdowns.map((page) => page.markdown).join('\n\n')
    let status: ResourceExtractionResult['status'] = RESOURCE_PACK_STATUS_READY
    let chunkUnits = buildPdfOutlineChunkUnits({
      outlinePoints,
      pageTexts,
    })
    if (chunkUnits.length === 0) {
      chunkUnits = buildPdfInferredHeadingChunkUnits(pageTexts)
    }
    if (chunkUnits.length === 0) {
      chunkUnits = buildPdfPageWindowChunkUnits(pageTexts)
      if (chunkUnits.length > 0) {
        warnings.push(PDF_CHUNKING_FALLBACK_WARNING)
      }
    }
    if (chunkUnits.length === 0 && fullText.trim().length > 0) {
      chunkUnits = [
        {
          unitKind: RESOURCE_PACK_UNIT_KIND_GENERIC,
          unitTitle: 'Chunk 1',
          unitIndex: 1,
          text: fullText,
          splitReason: RESOURCE_PACK_SPLIT_REASON_FALLBACK_STRUCTURE,
        },
      ]
      if (chunkUnits.length > 0) {
        warnings.push(PDF_CHUNKING_GENERIC_WARNING)
      }
    }

    if (extractedCharacters === 0) {
      status = RESOURCE_PACK_STATUS_UNSUPPORTED
      warnings.push(RESOURCE_PACK_UNSUPPORTED_WARNING)
    }

    return {
      status,
      warnings,
      extractor: 'pdfjs-dist',
      fullText: fullText || renderNoTextMarkdown('PDF'),
      chunkUnits,
      tocMarkdown: tocLines.length > 0 ? renderTocMarkdown(tocLines) : undefined,
      pageMarkdowns,
    }
  } catch (error) {
    return extractPdfResourceWithSystemFallback(sourcePath, errorMessage(error))
  }
}

async function extractPdfResourceWithSystemFallback(
  sourcePath: string,
  pdfjsError: string,
): Promise<ResourceExtractionResult> {
  const fallbackWarnings = [`pdfjs-dist failed: ${pdfjsError}`]
  const attempts: Array<{ command: string; args: string[]; extractor: string }> = [
    {
      command: 'pdftotext',
      args: ['-enc', 'UTF-8', '-layout', sourcePath, '-'],
      extractor: 'pdftotext',
    },
    {
      command: 'mutool',
      args: ['draw', '-F', 'txt', sourcePath],
      extractor: 'mutool draw',
    },
  ]

  for (const attempt of attempts) {
    const commandResult = await runPdfTextCommand(attempt.command, attempt.args)
    if (!commandResult.ok) {
      fallbackWarnings.push(commandResult.error)
      continue
    }

    const extractedText = commandResult.output.trim()
    if (extractedText.length === 0) {
      fallbackWarnings.push(`${attempt.command} returned no text.`)
      continue
    }

    const pageTexts = extractedText
      .split(PDF_PAGE_DELIMITER_REGEX)
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
    const pageMarkdowns = pageTexts.map((text, index) => ({
      pageNumber: index + 1,
      markdown: renderPageMarkdown(index + 1, text),
    }))
    const chunkUnits = buildPdfPageWindowChunkUnits(pageTexts)
    const fullText =
      pageMarkdowns.length > 0
        ? pageMarkdowns.map((page) => page.markdown).join('\n\n')
        : extractedText

    return {
      status: RESOURCE_PACK_STATUS_READY,
      warnings: [
        ...fallbackWarnings,
        `Used ${attempt.extractor} fallback.`,
        ...(chunkUnits.length > 0
          ? [PDF_CHUNKING_FALLBACK_WARNING]
          : [PDF_CHUNKING_GENERIC_WARNING]),
      ],
      extractor: attempt.extractor,
      fullText,
      chunkUnits: chunkUnits.length > 0 ? chunkUnits : undefined,
      pageMarkdowns,
    }
  }

  return {
    status: RESOURCE_PACK_STATUS_UNSUPPORTED,
    warnings: [...fallbackWarnings, RESOURCE_PACK_UNSUPPORTED_WARNING],
    extractor: 'unsupported',
    fullText: renderNoTextMarkdown('PDF'),
  }
}

async function runPdfTextCommand(
  command: string,
  args: string[],
): Promise<{ ok: true; output: string } | { ok: false; error: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      encoding: 'utf8',
      maxBuffer: PDF_TEXT_COMMAND_BUFFER_BYTES,
    })
    const output = `${stdout ?? ''}`.trim()
    if (output.length === 0 && typeof stderr === 'string' && stderr.trim().length > 0) {
      return { ok: false, error: `${command} produced no output: ${stderr.trim()}` }
    }
    return { ok: true, output }
  } catch (error) {
    return {
      ok: false,
      error: `${command} failed: ${errorMessage(error)}`,
    }
  }
}

async function extractEpubResource(sourcePath: string): Promise<ResourceExtractionResult> {
  const bytes = await fs.readFile(sourcePath)
  const zipReader = new ZipReader<Blob>(new BlobReader(new Blob([Uint8Array.from(bytes)])))
  const entries = await zipReader.getEntries()
  const entryByName = new Map(
    entries.filter(isFileEntry).map((entry) => [normalizeZipPath(entry.filename), entry] as const),
  )

  try {
    const containerXml = await readZipEntryText(entryByName, 'META-INF/container.xml')
    const container = resourcePackXMLParser.parse(containerXml) as XmlRecord
    const rootfiles = ensureXmlArray(getXmlValue(container, ['container', 'rootfiles', 'rootfile']))
    const opfPath = stringValue(rootfiles[0], 'full-path')
    if (!opfPath) {
      return unsupportedExtraction('EPUB container is missing OPF metadata.')
    }

    const opfXml = await readZipEntryText(entryByName, opfPath)
    const opf = resourcePackXMLParser.parse(opfXml) as XmlRecord
    const manifestItems = ensureXmlArray(getXmlValue(opf, ['package', 'manifest', 'item']))
    const spineItems = ensureXmlArray(getXmlValue(opf, ['package', 'spine', 'itemref']))
    const opfDir = path.posix.dirname(opfPath)
    const tocEntryName = resolveEpubTocEntry(manifestItems, opfDir)

    const tocMarkdown = tocEntryName
      ? await extractEpubTocMarkdown(entryByName, tocEntryName)
      : undefined
    const chapters: Array<{ title: string; body: string }> = []

    for (let index = 0; index < spineItems.length; index += 1) {
      const spineItem = spineItems[index]
      const itemId = stringValue(spineItem, 'idref')
      const manifestItem = manifestItems.find((entry) => stringValue(entry, 'id') === itemId)
      const href = stringValue(manifestItem, 'href')
      if (!href) continue

      const chapterPath = path.posix.normalize(path.posix.join(opfDir, href))
      const chapterMarkup = await readZipEntryText(entryByName, chapterPath)
      const chapterMarkdown = resourceTurndown.turndown(chapterMarkup).trim()
      if (!chapterMarkdown) continue
      const title = path.posix.basename(href)
      chapters.push({ title, body: chapterMarkdown })
    }

    if (chapters.length === 0) {
      return unsupportedExtraction('EPUB spine did not produce any readable text.')
    }

    const fullText = chapters.map((chapter) => `# ${chapter.title}\n\n${chapter.body}`).join('\n\n')
    const chunkUnits = buildStructuredChunkUnits(chapters, RESOURCE_PACK_UNIT_KIND_CHAPTER)

    return {
      status: RESOURCE_PACK_STATUS_READY,
      warnings: [],
      extractor: '@zip.js/zip.js + fast-xml-parser + turndown',
      fullText,
      chunkUnits: chunkUnits.length > 0 ? chunkUnits : undefined,
      tocMarkdown,
    }
  } finally {
    await zipReader.close()
  }
}

async function extractDocxResource(sourcePath: string): Promise<ResourceExtractionResult> {
  const converted = await mammoth.convertToHtml({ path: sourcePath })
  const html = converted.value.trim()
  if (!html) {
    return unsupportedExtraction('DOCX conversion produced no readable text.')
  }

  const markdown = resourceTurndown.turndown(html).trim()
  const warnings = converted.messages
    .map((message) => message.message)
    .filter((message) => message.trim().length > 0)
  return {
    status: RESOURCE_PACK_STATUS_READY,
    warnings,
    extractor: 'mammoth + turndown',
    fullText: markdown || renderNoTextMarkdown('DOCX'),
    tocMarkdown: buildHeadingTocMarkdown(markdown),
  }
}

async function extractHtmlResource(
  sourcePath: string,
  format: string,
): Promise<ResourceExtractionResult> {
  const html = await fs.readFile(sourcePath, 'utf8')
  const markdown = resourceTurndown.turndown(html).trim()
  if (!markdown) {
    return unsupportedExtraction(`No readable text was found in the ${format.toUpperCase()} file.`)
  }

  return {
    status: RESOURCE_PACK_STATUS_READY,
    warnings: [],
    extractor: 'turndown',
    fullText: markdown,
    tocMarkdown: buildHeadingTocMarkdown(markdown),
  }
}

async function extractTextResource(
  sourcePath: string,
  format: string,
): Promise<ResourceExtractionResult> {
  const text = await fs.readFile(sourcePath, 'utf8')
  const trimmed = text.trim()
  if (!trimmed) {
    return unsupportedExtraction(`No readable text was found in the ${format.toUpperCase()} file.`)
  }

  return {
    status: RESOURCE_PACK_STATUS_READY,
    warnings: [],
    extractor: 'plain-text',
    fullText: text,
    tocMarkdown: buildHeadingTocMarkdown(text),
  }
}

function unsupportedExtraction(reason: string): ResourceExtractionResult {
  return {
    status: RESOURCE_PACK_STATUS_UNSUPPORTED,
    warnings: [reason],
    extractor: 'unsupported',
    fullText: renderNoTextMarkdown('Resource'),
  }
}

async function extractEpubTocMarkdown(
  entryByName: Map<string, ResourcePackZipEntry>,
  tocEntryName: string,
): Promise<string | undefined> {
  const tocMarkup = await readZipEntryText(entryByName, tocEntryName)
  const normalizedTocEntryName = tocEntryName.toLowerCase()
  if (normalizedTocEntryName.endsWith('.ncx') || /<\s*ncx\b/i.test(tocMarkup)) {
    const lines = buildNcxTocLines(tocMarkup)
    return lines.length > 0 ? renderTocMarkdown(lines) : undefined
  }
  const tocMarkdown = resourceTurndown.turndown(tocMarkup).trim()
  return tocMarkdown.length > 0 ? tocMarkdown : undefined
}

function resolveEpubTocEntry(manifestItems: XmlRecord[], opfDir: string): string | undefined {
  const navItem = manifestItems.find((item) => {
    const properties = stringValue(item, 'properties')
    if (properties.length === 0) return false
    return properties.split(/\s+/).some((token) => token === 'nav')
  })
  const navHref = stringValue(navItem, 'href')
  if (navHref) {
    return path.posix.normalize(path.posix.join(opfDir, navHref))
  }

  const ncxItem = manifestItems.find(
    (item) => stringValue(item, 'media-type') === 'application/x-dtbncx+xml',
  )
  const ncxHref = stringValue(ncxItem, 'href')
  if (ncxHref) {
    return path.posix.normalize(path.posix.join(opfDir, ncxHref))
  }

  return undefined
}

function asPdfDocument(value: unknown): PdfDocumentLike {
  if (!isPlainObject(value)) {
    throw new Error('Invalid PDF document result.')
  }

  const numPages = value.numPages
  const getOutline = value.getOutline
  const getPage = value.getPage
  const getDestination = value.getDestination
  const getPageIndex = value.getPageIndex

  if (
    typeof numPages !== 'number' ||
    typeof getOutline !== 'function' ||
    typeof getPage !== 'function' ||
    typeof getDestination !== 'function' ||
    typeof getPageIndex !== 'function'
  ) {
    throw new Error('Invalid PDF document contract.')
  }

  return {
    numPages,
    getOutline: getOutline as PdfDocumentLike['getOutline'],
    getPage: getPage as PdfDocumentLike['getPage'],
    getDestination: getDestination as PdfDocumentLike['getDestination'],
    getPageIndex: getPageIndex as PdfDocumentLike['getPageIndex'],
  }
}

function flattenPdfOutline(nodes: unknown[], lines: string[], depth = 0) {
  for (const node of nodes) {
    if (!isPlainObject(node)) continue
    const title = stringValue(node, 'title')
    if (title) {
      lines.push(`${'  '.repeat(depth)}- ${title}`)
    }
    const items = ensureArray(node.items)
    if (items.length > 0) {
      flattenPdfOutline(items, lines, depth + 1)
    }
  }
}

async function buildPdfOutlinePoints(
  document: PdfDocumentLike,
  nodes: unknown[],
  depth = 0,
): Promise<PdfOutlinePoint[]> {
  const points: PdfOutlinePoint[] = []

  for (const node of nodes) {
    if (!isPlainObject(node)) continue
    const title = stringValue(node, 'title').trim()
    const pageNumber = await resolvePdfOutlinePageNumber(document, node.dest)
    if (title.length > 0 && pageNumber !== undefined) {
      points.push({ title, depth, pageNumber })
    }

    const children = ensureArray(node.items as unknown[] | undefined)
    if (children.length > 0) {
      points.push(...(await buildPdfOutlinePoints(document, children, depth + 1)))
    }
  }

  return points
}

async function resolvePdfOutlinePageNumber(
  document: PdfDocumentLike,
  destination: unknown,
): Promise<number | undefined> {
  if (destination === undefined || destination === null) return undefined

  let resolvedDestination: unknown = destination
  if (typeof destination === 'string') {
    try {
      resolvedDestination = await document.getDestination(destination)
    } catch {
      resolvedDestination = undefined
    }
  }

  if (!Array.isArray(resolvedDestination) || resolvedDestination.length === 0) return undefined
  const reference = resolvedDestination[0]
  if (!reference) return undefined

  const pageIndex = await document.getPageIndex(reference).catch(() => undefined)
  if (typeof pageIndex !== 'number' || !Number.isInteger(pageIndex) || pageIndex < 0)
    return undefined
  return pageIndex + 1
}

function buildPdfOutlineChunkUnits(input: {
  outlinePoints: PdfOutlinePoint[]
  pageTexts: string[]
}): ResourceChunkUnitSeed[] {
  if (input.outlinePoints.length === 0 || input.pageTexts.length === 0) return []

  const chapterDepth = Math.min(...input.outlinePoints.map((point) => point.depth))
  const chapters = input.outlinePoints
    .filter((point) => point.depth === chapterDepth)
    .filter((point) => point.pageNumber >= 1 && point.pageNumber <= input.pageTexts.length)
    .toSorted((left, right) => left.pageNumber - right.pageNumber)

  const dedupedChapters: PdfOutlinePoint[] = []
  for (const chapter of chapters) {
    const previous = dedupedChapters[dedupedChapters.length - 1]
    if (previous && previous.pageNumber === chapter.pageNumber) continue
    dedupedChapters.push(chapter)
  }

  if (dedupedChapters.length === 0) return []

  const units: ResourceChunkUnitSeed[] = []
  for (let index = 0; index < dedupedChapters.length; index += 1) {
    const chapter = dedupedChapters[index]!
    const nextChapter = dedupedChapters[index + 1]
    const startPage = chapter.pageNumber
    const endPage = Math.max(startPage, (nextChapter?.pageNumber ?? input.pageTexts.length + 1) - 1)
    const chapterPages = input.pageTexts.slice(startPage - 1, endPage)
    if (chapterPages.length === 0) continue

    const chapterBody = chapterPages
      .map((pageText, pageOffset) => renderPageMarkdown(startPage + pageOffset, pageText))
      .join('\n\n')
    units.push({
      unitKind: RESOURCE_PACK_UNIT_KIND_CHAPTER,
      unitTitle: chapter.title,
      unitIndex: index + 1,
      text: chapterBody,
      pageStart: startPage,
      pageEnd: endPage,
    })
  }

  return units
}

type PdfHeadingMarker = {
  title: string
  pageNumber: number
}

function buildPdfInferredHeadingChunkUnits(pageTexts: string[]): ResourceChunkUnitSeed[] {
  if (pageTexts.length === 0) return []

  const markers: PdfHeadingMarker[] = []

  for (let pageIndex = 0; pageIndex < pageTexts.length; pageIndex += 1) {
    const pageNumber = pageIndex + 1
    const pageText = pageTexts[pageIndex] ?? ''
    const markerTitle = inferPdfHeadingFromPage(pageText)
    if (!markerTitle) continue

    const previous = markers[markers.length - 1]
    if (previous && previous.title.toLowerCase() === markerTitle.toLowerCase()) {
      continue
    }

    markers.push({
      title: markerTitle,
      pageNumber,
    })
  }

  if (markers.length === 0) return []

  const units: ResourceChunkUnitSeed[] = []
  for (let index = 0; index < markers.length; index += 1) {
    const marker = markers[index]!
    const nextMarker = markers[index + 1]
    const startPage = marker.pageNumber
    const endPage = Math.max(startPage, (nextMarker?.pageNumber ?? pageTexts.length + 1) - 1)
    const sectionPages = pageTexts.slice(startPage - 1, endPage)
    if (sectionPages.length === 0) continue

    const sectionBody = sectionPages
      .map((pageText, pageOffset) => renderPageMarkdown(startPage + pageOffset, pageText))
      .join('\n\n')
    units.push({
      unitKind: RESOURCE_PACK_UNIT_KIND_CHAPTER,
      unitTitle: marker.title,
      unitIndex: index + 1,
      text: sectionBody,
      pageStart: startPage,
      pageEnd: endPage,
    })
  }

  return units
}

function inferPdfHeadingFromPage(pageText: string): string | undefined {
  const lines = pageText
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\s+/g, ' '))
    .filter((line) => line.length > 0)
    .slice(0, PDF_HEADING_SCAN_MAX_LINES)

  if (lines.length === 0) return undefined
  if (lines.some((line) => PDF_TOC_HINT_REGEX.test(line))) return undefined

  for (const line of lines) {
    if (line.length > PDF_HEADING_SCAN_MAX_LENGTH) continue
    for (const pattern of PDF_HEADING_PATTERNS) {
      const match = line.match(pattern)
      if (!match) continue

      const kind = pattern === PDF_HEADING_PATTERNS[0] ? 'Chapter' : 'Part'
      const index = (match[1] ?? '').trim()
      const titleSuffix = (match[2] ?? '').trim()
      if (!index) continue

      return titleSuffix.length > 0 ? `${kind} ${index}: ${titleSuffix}` : `${kind} ${index}`
    }
  }

  return undefined
}

function buildPdfPageWindowChunkUnits(pageTexts: string[]): ResourceChunkUnitSeed[] {
  if (pageTexts.length === 0) return []

  const units: ResourceChunkUnitSeed[] = []
  let currentStartPage = 1
  let currentEndPage = 0
  let currentPages: string[] = []
  let currentChars = 0
  let currentIndex = 1

  const flush = () => {
    if (currentPages.length === 0) return
    const title =
      currentStartPage === currentEndPage
        ? `Page ${currentStartPage}`
        : `Pages ${currentStartPage}-${currentEndPage}`
    const body = currentPages.join('\n\n')
    units.push({
      unitKind: RESOURCE_PACK_UNIT_KIND_PAGE_WINDOW,
      unitTitle: title,
      unitIndex: currentIndex,
      text: body,
      pageStart: currentStartPage,
      pageEnd: currentEndPage,
      splitReason: RESOURCE_PACK_SPLIT_REASON_FALLBACK_STRUCTURE,
    })
    currentIndex += 1
    currentPages = []
    currentChars = 0
  }

  for (let index = 0; index < pageTexts.length; index += 1) {
    const pageNumber = index + 1
    const pageMarkdown = renderPageMarkdown(pageNumber, pageTexts[index] ?? '')
    const pageChars = pageMarkdown.length
    if (currentChars > 0 && currentChars + pageChars > RESOURCE_PACK_NON_CHAPTER_MAX_CHARS) {
      flush()
      currentStartPage = pageNumber
    }
    if (currentPages.length === 0) {
      currentStartPage = pageNumber
    }
    currentEndPage = pageNumber
    currentPages.push(pageMarkdown)
    currentChars += pageChars
  }

  flush()
  return units
}

function buildStructuredChunkUnits(
  segments: Array<{ title: string; body: string }>,
  unitKind: ResourceChunkUnitKind,
): ResourceChunkUnitSeed[] {
  const units: ResourceChunkUnitSeed[] = []
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]
    if (!segment) continue
    const title = segment.title.trim() || 'Section'
    const body = segment.body.trim()
    if (!body) continue

    units.push({
      unitKind,
      unitTitle: title,
      unitIndex: index + 1,
      text: body,
    })
  }
  return units
}

function renderPdfTextContent(items: unknown[]): string {
  const lines: string[] = []
  let currentLine = ''

  for (const item of items) {
    if (!isPlainObject(item) || typeof item.str !== 'string') continue
    const text = item.str.trim()
    if (!text) continue

    if (currentLine.length === 0) {
      currentLine = text
    } else {
      currentLine += ` ${text}`
    }

    if (item.hasEOL) {
      lines.push(currentLine.trim())
      currentLine = ''
    }
  }

  if (currentLine.trim().length > 0) {
    lines.push(currentLine.trim())
  }

  return lines.join('\n').trim()
}

async function readZipEntryText(entryByName: Map<string, ResourcePackZipEntry>, filename: string) {
  const normalized = normalizeZipPath(filename)
  const entry = entryByName.get(normalized)
  if (!entry) {
    throw new Error(`Missing EPUB entry: ${filename}`)
  }

  const text = await entry.getData(new TextWriter())
  return typeof text === 'string' ? text : String(text)
}

function normalizeZipPath(filename: string) {
  return path.posix.normalize(filename).replace(/^\.\//, '')
}

function isPlainObject(value: unknown): value is XmlRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function ensureArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return []
  return Array.isArray(value) ? value : [value]
}

function ensureXmlArray(value: unknown): XmlRecord[] {
  return ensureArray<XmlRecord>(value as XmlRecord | XmlRecord[] | undefined)
}

function isFileEntry(entry: Entry): entry is ResourcePackZipEntry {
  return entry.directory === false
}

function getXmlValue(value: unknown, pathSegments: string[]): unknown {
  let current: unknown = value
  for (const segment of pathSegments) {
    if (!isPlainObject(current)) return undefined
    current = current[segment]
  }
  return current
}

function stringValue(record: unknown, key: string) {
  if (!isPlainObject(record)) return ''
  const value = record[key]
  return typeof value === 'string' ? value : ''
}

function buildNcxTocLines(ncxMarkup: string): string[] {
  const parsed = resourcePackXMLParser.parse(ncxMarkup) as XmlRecord
  const navPoints = ensureXmlArray(getXmlValue(parsed, ['ncx', 'navMap', 'navPoint']))
  if (navPoints.length === 0) return []

  const lines: string[] = []
  appendNcxNavPoints(lines, navPoints, 0)
  return lines
}

function appendNcxNavPoints(lines: string[], navPoints: XmlRecord[], depth: number) {
  for (const navPoint of navPoints) {
    const title = xmlTextValue(getXmlValue(navPoint, ['navLabel', 'text'])).trim()
    if (title) {
      lines.push(`${'  '.repeat(depth)}- ${title}`)
    }
    const children = ensureXmlArray(getXmlValue(navPoint, ['navPoint']))
    if (children.length > 0) {
      appendNcxNavPoints(lines, children, depth + 1)
    }
  }
}

function xmlTextValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    for (const entry of value) {
      const text = xmlTextValue(entry)
      if (text) return text
    }
    return ''
  }
  if (!isPlainObject(value)) return ''
  if (typeof value['#text'] === 'string') return value['#text']
  if (typeof value.text === 'string') return value.text
  return ''
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) return error.message
  return String(error)
}
