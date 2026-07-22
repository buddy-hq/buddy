import path from "node:path"
import {
  getResourceXmlValue,
  normalizeArchivePath,
  openResourceArchive,
  parseResourceXml,
  readArchiveEntryText,
  resourceXmlStringValue,
  type ResourceArchiveEntries,
} from "./archive"
import {
  RESOURCE_PACK_STATUS_READY,
  type ResourceChunkUnitSeed,
  type ResourceExtractionResult,
} from "./contracts"
import { RESOURCE_PACK_UNIT_KIND_SECTION } from "./chunking-config"
import { assertResourceChunkUnitCount, assertResourceTextCharacterCount } from "./budgets"
import { renderTocMarkdown } from "./markdown"

const PPTX_PRESENTATION_PATH = "ppt/presentation.xml"
const PPTX_PRESENTATION_RELATIONSHIPS_PATH = "ppt/_rels/presentation.xml.rels"
const PPTX_VISUAL_LIMITATION_WARNING =
  "PPTX text extraction does not represent positioning, animations, charts, SmartArt, or visual composition."
const PPTX_SLIDE_RELATIONSHIP_TYPE_SUFFIX = "/slide"
const PPTX_NOTES_RELATIONSHIP_TYPE_SUFFIX = "/notesSlide"
const XML_TEXT_ELEMENT_PATTERN = /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/giu
const PRESENTATION_SLIDE_RELATIONSHIP_PATTERN = /<p:sldId\b[^>]*\br:id="([^"]+)"[^>]*\/?\s*>/giu
const TABLE_PATTERN = /<a:tbl\b[\s\S]*?<\/a:tbl>/giu
const TABLE_ROW_PATTERN = /<a:tr\b[\s\S]*?<\/a:tr>/giu
const TABLE_CELL_PATTERN = /<a:tc\b[\s\S]*?<\/a:tc>/giu
const SHAPE_PATTERN = /<p:sp\b[\s\S]*?<\/p:sp>/giu
const TITLE_PLACEHOLDER_PATTERN = /<p:ph\b[^>]*\btype="(?:title|ctrTitle)"/iu
const NON_VISUAL_PROPERTY_PATTERN = /<(?:p|a):cNvPr\b([^>]*)\/?\s*>/giu
const XML_ATTRIBUTE_PATTERN = /([\w:.-]+)="([^"]*)"/gu

type OpenXmlRelationship = {
  id: string
  type: string
  target: string
}

function decodeXmlText(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/giu, (_match, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#([0-9]+);/gu, (_match, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)),
    )
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&")
}

function orderedText(markup: string): string[] {
  return Array.from(markup.matchAll(XML_TEXT_ELEMENT_PATTERN), (match) =>
    decodeXmlText(match[1] ?? "").trim(),
  ).filter((value) => value.length > 0)
}

function relationships(markup: string): OpenXmlRelationship[] {
  const document = parseResourceXml(markup)
  const root = getResourceXmlValue(document, ["Relationships", "Relationship"])
  const candidates = Array.isArray(root) ? root : root ? [root] : []
  return candidates.flatMap((candidate) => {
    const id = resourceXmlStringValue(candidate, "Id")
    const type = resourceXmlStringValue(candidate, "Type")
    const target = resourceXmlStringValue(candidate, "Target")
    return id && type && target ? [{ id, type, target }] : []
  })
}

function resolvePartTarget(sourcePart: string, target: string): string {
  if (target.startsWith("/")) return normalizeArchivePath(target.replace(/^\/+/, ""))
  return normalizeArchivePath(path.posix.join(path.posix.dirname(sourcePart), target))
}

function relationshipsPathForPart(partPath: string): string {
  return path.posix.join(
    path.posix.dirname(partPath),
    "_rels",
    `${path.posix.basename(partPath)}.rels`,
  )
}

async function readRelationships(
  entries: ResourceArchiveEntries,
  partPath: string,
): Promise<OpenXmlRelationship[]> {
  const relationshipPath = relationshipsPathForPart(partPath)
  if (!entries.has(relationshipPath)) return []
  return relationships(await readArchiveEntryText(entries, relationshipPath))
}

function slideTitle(markup: string, slideNumber: number): string {
  for (const shapeMatch of markup.matchAll(SHAPE_PATTERN)) {
    const shape = shapeMatch[0]
    if (!TITLE_PLACEHOLDER_PATTERN.test(shape)) continue
    TITLE_PLACEHOLDER_PATTERN.lastIndex = 0
    const title = orderedText(shape).join(" ").trim()
    if (title) return title
  }
  return orderedText(markup)[0] ?? `Slide ${slideNumber}`
}

function tableMarkdowns(markup: string): string[] {
  return Array.from(markup.matchAll(TABLE_PATTERN)).flatMap((tableMatch, tableIndex) => {
    const rows = Array.from(tableMatch[0].matchAll(TABLE_ROW_PATTERN), (rowMatch) =>
      Array.from(rowMatch[0].matchAll(TABLE_CELL_PATTERN), (cellMatch) =>
        orderedText(cellMatch[0]).join(" ").replaceAll("|", "\\|").trim(),
      ),
    ).filter((row) => row.length > 0)
    const width = Math.max(0, ...rows.map((row) => row.length))
    if (rows.length === 0 || width === 0) return []
    const normalizedRows = rows.map((row) => {
      const result = row.slice()
      while (result.length < width) result.push("")
      return result
    })
    const [header, ...body] = normalizedRows
    if (!header) return []
    return [
      [
        `### Table ${tableIndex + 1}`,
        "",
        `| ${header.join(" | ")} |`,
        `| ${header.map(() => "---").join(" | ")} |`,
        ...body.map((row) => `| ${row.join(" | ")} |`),
      ].join("\n"),
    ]
  })
}

function attributeMap(source: string): Record<string, string> {
  return Object.fromEntries(
    Array.from(source.matchAll(XML_ATTRIBUTE_PATTERN), (match) => [
      match[1] ?? "",
      decodeXmlText(match[2] ?? ""),
    ]).filter(([key]) => key.length > 0),
  )
}

function altTextLines(markup: string): string[] {
  const values = new Set<string>()
  for (const match of markup.matchAll(NON_VISUAL_PROPERTY_PATTERN)) {
    const attributes = attributeMap(match[1] ?? "")
    for (const key of ["descr", "title"]) {
      const value = attributes[key]?.trim()
      if (value) values.add(value)
    }
  }
  return Array.from(values)
}

async function notesText(entries: ResourceArchiveEntries, slidePath: string): Promise<string[]> {
  const slideRelationships = await readRelationships(entries, slidePath)
  const notesRelationship = slideRelationships.find((relationship) =>
    relationship.type.endsWith(PPTX_NOTES_RELATIONSHIP_TYPE_SUFFIX),
  )
  if (!notesRelationship) return []
  const notesPath = resolvePartTarget(slidePath, notesRelationship.target)
  if (!entries.has(notesPath)) return []
  return orderedText(await readArchiveEntryText(entries, notesPath))
}

function renderSlide(input: {
  number: number
  title: string
  text: string[]
  tables: string[]
  notes: string[]
  altText: string[]
}): string {
  const blocks = [`# Slide ${input.number}: ${input.title}`]
  if (input.text.length > 0) blocks.push(`## Text\n\n${input.text.join("\n\n")}`)
  if (input.tables.length > 0) blocks.push(`## Tables\n\n${input.tables.join("\n\n")}`)
  if (input.notes.length > 0) blocks.push(`## Speaker notes\n\n${input.notes.join("\n\n")}`)
  if (input.altText.length > 0) {
    blocks.push(`## Available alt text\n\n${input.altText.map((text) => `- ${text}`).join("\n")}`)
  }
  return blocks.join("\n\n")
}

export async function extractPptxResource(sourcePath: string): Promise<ResourceExtractionResult> {
  const archive = await openResourceArchive(sourcePath)
  try {
    const presentationMarkup = await readArchiveEntryText(archive.entries, PPTX_PRESENTATION_PATH)
    const presentationRelationships = relationships(
      await readArchiveEntryText(archive.entries, PPTX_PRESENTATION_RELATIONSHIPS_PATH),
    )
    const relationshipByID = new Map(
      presentationRelationships.map((relationship) => [relationship.id, relationship] as const),
    )
    const slideRelationshipIDs = Array.from(
      presentationMarkup.matchAll(PRESENTATION_SLIDE_RELATIONSHIP_PATTERN),
      (match) => match[1] ?? "",
    ).filter(Boolean)
    assertResourceChunkUnitCount(slideRelationshipIDs.length)
    if (slideRelationshipIDs.length === 0) {
      throw new Error("PPTX presentation contains no ordered slides.")
    }

    const chunkUnits: ResourceChunkUnitSeed[] = []
    const tocLines: string[] = []
    let fullTextCharacters = 0
    for (let index = 0; index < slideRelationshipIDs.length; index += 1) {
      const relationship = relationshipByID.get(slideRelationshipIDs[index] ?? "")
      if (!relationship || !relationship.type.endsWith(PPTX_SLIDE_RELATIONSHIP_TYPE_SUFFIX)) {
        throw new Error(`PPTX slide ${index + 1} has no valid presentation relationship.`)
      }
      const slidePath = resolvePartTarget(PPTX_PRESENTATION_PATH, relationship.target)
      const markup = await readArchiveEntryText(archive.entries, slidePath)
      const number = index + 1
      const title = slideTitle(markup, number)
      const tables = tableMarkdowns(markup)
      const textMarkup = markup.replace(TABLE_PATTERN, "")
      TABLE_PATTERN.lastIndex = 0
      const markdown = renderSlide({
        number,
        title,
        text: orderedText(textMarkup),
        tables,
        notes: await notesText(archive.entries, slidePath),
        altText: altTextLines(markup),
      })
      fullTextCharacters += markdown.length + (chunkUnits.length > 0 ? 2 : 0)
      assertResourceTextCharacterCount(fullTextCharacters)
      tocLines.push(`- Slide ${number}: ${title}`)
      chunkUnits.push({
        unitKind: RESOURCE_PACK_UNIT_KIND_SECTION,
        unitTitle: `Slide ${number}: ${title}`,
        unitIndex: number,
        text: markdown,
      })
    }

    return {
      status: RESOURCE_PACK_STATUS_READY,
      warnings: [PPTX_VISUAL_LIMITATION_WARNING],
      extractor: "@zip.js/zip.js + fast-xml-parser",
      fullText: chunkUnits.map((unit) => unit.text).join("\n\n"),
      chunkUnits,
      tocMarkdown: renderTocMarkdown(tocLines),
    }
  } finally {
    await archive.close()
  }
}
