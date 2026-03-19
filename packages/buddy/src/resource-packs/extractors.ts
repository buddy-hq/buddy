import { promises as fs } from "node:fs"
import path from "node:path"
import { BlobReader, TextWriter, ZipReader, type Entry, type FileEntry } from "@zip.js/zip.js"
import { XMLParser } from "fast-xml-parser"
import mammoth from "mammoth"
import TurndownService from "turndown"
import {
  RESOURCE_PACK_CONFIDENCE_HIGH,
  RESOURCE_PACK_CONFIDENCE_LOW,
  RESOURCE_PACK_CONFIDENCE_MEDIUM,
  RESOURCE_PACK_STATUS_READY,
  RESOURCE_PACK_STATUS_UNSUPPORTED,
  RESOURCE_PACK_UNSUPPORTED_WARNING,
  type ResourceClassification,
  type ResourcePackConfidence,
  type ResourceExtractionResult,
} from "./contracts"
import { buildHeadingTocMarkdown, renderNoTextMarkdown, renderPageMarkdown, renderTocMarkdown } from "./markdown"

type XmlRecord = Record<string, unknown>
type ResourcePackZipEntry = FileEntry

const resourcePackXMLParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  trimValues: true,
  removeNSPrefix: true,
})

const resourceTurndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
})

export async function extractResourcePack(
  sourcePath: string,
  classification: ResourceClassification,
): Promise<ResourceExtractionResult> {
  switch (classification.format) {
    case "pdf":
      return extractPdfResource(sourcePath)
    case "epub":
      return extractEpubResource(sourcePath)
    case "docx":
      return extractDocxResource(sourcePath)
    case "html":
    case "htm":
    case "xhtml":
      return extractHtmlResource(sourcePath, classification.format)
    default:
      return extractTextResource(sourcePath, classification.format)
  }
}

async function extractPdfResource(sourcePath: string): Promise<ResourceExtractionResult> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
  const bytes = new Uint8Array(await fs.readFile(sourcePath))
  const loadingTask = pdfjs.getDocument({
    data: bytes,
    useWorkerFetch: false,
    isEvalSupported: false,
  })
  const document = await loadingTask.promise
  const pageMarkdowns: Array<{ pageNumber: number; markdown: string }> = []
  const tocLines: string[] = []
  const warnings: string[] = []

  const outline = await document.getOutline().catch(() => undefined)
  if (outline && outline.length > 0) {
    flattenPdfOutline(outline, tocLines)
  }

  let extractedCharacters = 0
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    try {
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent()
      const pageText = renderPdfTextContent(content.items)
      extractedCharacters += pageText.replace(/\s+/g, "").length
      pageMarkdowns.push({
        pageNumber,
        markdown: renderPageMarkdown(pageNumber, pageText),
      })
    } catch (error) {
      warnings.push(`Failed to extract PDF page ${pageNumber}: ${errorMessage(error)}`)
    }
  }

  const fullText = pageMarkdowns.map((page) => page.markdown).join("\n\n")
  let status: ResourceExtractionResult["status"] = RESOURCE_PACK_STATUS_READY
  let confidence: ResourcePackConfidence = RESOURCE_PACK_CONFIDENCE_MEDIUM

  if (extractedCharacters === 0) {
    status = RESOURCE_PACK_STATUS_UNSUPPORTED
    confidence = RESOURCE_PACK_CONFIDENCE_LOW
    warnings.push(RESOURCE_PACK_UNSUPPORTED_WARNING)
  }

  return {
    status,
    confidence,
    warnings,
    extractor: "pdfjs-dist",
    fullText: fullText || renderNoTextMarkdown("PDF"),
    tocMarkdown: tocLines.length > 0 ? renderTocMarkdown(tocLines) : undefined,
    pageMarkdowns,
  }
}

async function extractEpubResource(sourcePath: string): Promise<ResourceExtractionResult> {
  const bytes = await fs.readFile(sourcePath)
  const zipReader = new ZipReader<Blob>(new BlobReader(new Blob([bytes])))
  const entries = await zipReader.getEntries()
  const entryByName = new Map(
    entries
      .filter(isFileEntry)
      .map((entry) => [normalizeZipPath(entry.filename), entry] as const),
  )

  try {
    const containerXml = await readZipEntryText(entryByName, "META-INF/container.xml")
    const container = resourcePackXMLParser.parse(containerXml) as XmlRecord
    const rootfiles = ensureXmlArray(getXmlValue(container, ["container", "rootfiles", "rootfile"]))
    const opfPath = stringValue(rootfiles[0], "full-path")
    if (!opfPath) {
      return unsupportedExtraction("EPUB container is missing OPF metadata.")
    }

    const opfXml = await readZipEntryText(entryByName, opfPath)
    const opf = resourcePackXMLParser.parse(opfXml) as XmlRecord
    const manifestItems = ensureXmlArray(getXmlValue(opf, ["package", "manifest", "item"]))
    const spineItems = ensureXmlArray(getXmlValue(opf, ["package", "spine", "itemref"]))
    const opfDir = path.posix.dirname(opfPath)
    const tocEntryName = resolveEpubTocEntry(manifestItems, opfDir)

    const tocMarkdown = tocEntryName
      ? await extractEpubTocMarkdown(entryByName, tocEntryName)
      : undefined
    const chapters: string[] = []

    for (let index = 0; index < spineItems.length; index += 1) {
      const spineItem = spineItems[index]
      const itemId = stringValue(spineItem, "idref")
      const manifestItem = manifestItems.find((entry) => stringValue(entry, "id") === itemId)
      const href = stringValue(manifestItem, "href")
      if (!href) continue

      const chapterPath = path.posix.normalize(path.posix.join(opfDir, href))
      const chapterMarkup = await readZipEntryText(entryByName, chapterPath)
      const chapterMarkdown = resourceTurndown.turndown(chapterMarkup).trim()
      if (!chapterMarkdown) continue
      const title = path.posix.basename(href)
      chapters.push(`# ${title}\n\n${chapterMarkdown}`)
    }

    if (chapters.length === 0) {
      return unsupportedExtraction("EPUB spine did not produce any readable text.")
    }

    return {
      status: RESOURCE_PACK_STATUS_READY,
      confidence: RESOURCE_PACK_CONFIDENCE_MEDIUM,
      warnings: [],
      extractor: "@zip.js/zip.js + fast-xml-parser + turndown",
      fullText: chapters.join("\n\n"),
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
    return unsupportedExtraction("DOCX conversion produced no readable text.")
  }

  const markdown = resourceTurndown.turndown(html).trim()
  const warnings = converted.messages.map((message) => message.message).filter((message) => message.trim().length > 0)
  return {
    status: RESOURCE_PACK_STATUS_READY,
    confidence: RESOURCE_PACK_CONFIDENCE_MEDIUM,
    warnings,
    extractor: "mammoth + turndown",
    fullText: markdown || renderNoTextMarkdown("DOCX"),
    tocMarkdown: buildHeadingTocMarkdown(markdown),
  }
}

async function extractHtmlResource(sourcePath: string, format: string): Promise<ResourceExtractionResult> {
  const html = await fs.readFile(sourcePath, "utf8")
  const markdown = resourceTurndown.turndown(html).trim()
  if (!markdown) {
    return unsupportedExtraction(`No readable text was found in the ${format.toUpperCase()} file.`)
  }

  return {
    status: RESOURCE_PACK_STATUS_READY,
    confidence: RESOURCE_PACK_CONFIDENCE_HIGH,
    warnings: [],
    extractor: "turndown",
    fullText: markdown,
    tocMarkdown: buildHeadingTocMarkdown(markdown),
  }
}

async function extractTextResource(sourcePath: string, format: string): Promise<ResourceExtractionResult> {
  const text = await fs.readFile(sourcePath, "utf8")
  const trimmed = text.trim()
  if (!trimmed) {
    return unsupportedExtraction(`No readable text was found in the ${format.toUpperCase()} file.`)
  }

  return {
    status: RESOURCE_PACK_STATUS_READY,
    confidence: RESOURCE_PACK_CONFIDENCE_HIGH,
    warnings: [],
    extractor: "plain-text",
    fullText: text,
    tocMarkdown: buildHeadingTocMarkdown(text),
  }
}

function unsupportedExtraction(reason: string): ResourceExtractionResult {
  return {
    status: RESOURCE_PACK_STATUS_UNSUPPORTED,
    confidence: RESOURCE_PACK_CONFIDENCE_LOW,
    warnings: [reason],
    extractor: "unsupported",
    fullText: renderNoTextMarkdown("Resource"),
  }
}

async function extractEpubTocMarkdown(
  entryByName: Map<string, ResourcePackZipEntry>,
  tocEntryName: string,
): Promise<string | undefined> {
  const tocMarkup = await readZipEntryText(entryByName, tocEntryName)
  const normalizedTocEntryName = tocEntryName.toLowerCase()
  if (normalizedTocEntryName.endsWith(".ncx") || /<\s*ncx\b/i.test(tocMarkup)) {
    const lines = buildNcxTocLines(tocMarkup)
    return lines.length > 0 ? renderTocMarkdown(lines) : undefined
  }
  const tocMarkdown = resourceTurndown.turndown(tocMarkup).trim()
  return tocMarkdown.length > 0 ? tocMarkdown : undefined
}

function resolveEpubTocEntry(manifestItems: XmlRecord[], opfDir: string): string | undefined {
  const navItem = manifestItems.find((item) => {
    const properties = stringValue(item, "properties")
    if (properties.length === 0) return false
    return properties.split(/\s+/).some((token) => token === "nav")
  })
  const navHref = stringValue(navItem, "href")
  if (navHref) {
    return path.posix.normalize(path.posix.join(opfDir, navHref))
  }

  const ncxItem = manifestItems.find((item) => stringValue(item, "media-type") === "application/x-dtbncx+xml")
  const ncxHref = stringValue(ncxItem, "href")
  if (ncxHref) {
    return path.posix.normalize(path.posix.join(opfDir, ncxHref))
  }

  return undefined
}

function flattenPdfOutline(nodes: unknown[], lines: string[], depth = 0) {
  for (const node of nodes) {
    if (!isPlainObject(node)) continue
    const title = stringValue(node, "title")
    if (title) {
      lines.push(`${"  ".repeat(depth)}- ${title}`)
    }
    const items = ensureArray(node.items)
    if (items.length > 0) {
      flattenPdfOutline(items, lines, depth + 1)
    }
  }
}

function renderPdfTextContent(items: unknown[]): string {
  const lines: string[] = []
  let currentLine = ""

  for (const item of items) {
    if (!isPlainObject(item) || typeof item.str !== "string") continue
    const text = item.str.trim()
    if (!text) continue

    if (currentLine.length === 0) {
      currentLine = text
    } else {
      currentLine += ` ${text}`
    }

    if (item.hasEOL) {
      lines.push(currentLine.trim())
      currentLine = ""
    }
  }

  if (currentLine.trim().length > 0) {
    lines.push(currentLine.trim())
  }

  return lines.join("\n").trim()
}

async function readZipEntryText(
  entryByName: Map<string, ResourcePackZipEntry>,
  filename: string,
) {
  const normalized = normalizeZipPath(filename)
  const entry = entryByName.get(normalized)
  if (!entry) {
    throw new Error(`Missing EPUB entry: ${filename}`)
  }

  const text = await entry.getData(new TextWriter())
  return typeof text === "string" ? text : String(text)
}

function normalizeZipPath(filename: string) {
  return path.posix.normalize(filename).replace(/^\.\//, "")
}

function isPlainObject(value: unknown): value is XmlRecord {
  return !!value && typeof value === "object" && !Array.isArray(value)
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
  if (!isPlainObject(record)) return ""
  const value = record[key]
  return typeof value === "string" ? value : ""
}

function buildNcxTocLines(ncxMarkup: string): string[] {
  const parsed = resourcePackXMLParser.parse(ncxMarkup) as XmlRecord
  const navPoints = ensureXmlArray(getXmlValue(parsed, ["ncx", "navMap", "navPoint"]))
  if (navPoints.length === 0) return []

  const lines: string[] = []
  appendNcxNavPoints(lines, navPoints, 0)
  return lines
}

function appendNcxNavPoints(lines: string[], navPoints: XmlRecord[], depth: number) {
  for (const navPoint of navPoints) {
    const title = xmlTextValue(getXmlValue(navPoint, ["navLabel", "text"])).trim()
    if (title) {
      lines.push(`${"  ".repeat(depth)}- ${title}`)
    }
    const children = ensureXmlArray(getXmlValue(navPoint, ["navPoint"]))
    if (children.length > 0) {
      appendNcxNavPoints(lines, children, depth + 1)
    }
  }
}

function xmlTextValue(value: unknown): string {
  if (typeof value === "string") return value
  if (Array.isArray(value)) {
    for (const entry of value) {
      const text = xmlTextValue(entry)
      if (text) return text
    }
    return ""
  }
  if (!isPlainObject(value)) return ""
  if (typeof value["#text"] === "string") return value["#text"]
  if (typeof value.text === "string") return value.text
  return ""
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) return error.message
  return String(error)
}
