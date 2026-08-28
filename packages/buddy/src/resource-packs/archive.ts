import { promises as fs } from "node:fs"
import path from "node:path"
import {
  BlobReader,
  BlobWriter,
  TextWriter,
  ZipReader,
  type Entry,
  type FileEntry,
} from "@zip.js/zip.js"
import { XMLParser } from "fast-xml-parser"
import {
  assertResourceArchiveBudget,
  RESOURCE_DEFAULT_ARCHIVE_BUDGET,
  type ResourceArchiveBudget,
} from "./budgets"
import {
  parseTJsonObject,
  parseTNumber,
  parseTString,
  type TJsonObject,
  type TJsonValue,
} from "./json-value"

const XML_ENTITY_MAX_TOTAL_EXPANSIONS = 10_000
const XML_ENTITY_MAX_EXPANDED_LENGTH = 1_000_000
const XML_TEXT_KEY = "#text"
const XML_TEXT_ALIAS_KEY = "text"

export type TResourceXmlValue = TJsonValue
export type TResourceXmlRecord = TJsonObject
export type ResourceArchiveEntry = FileEntry
export type ResourceArchiveEntries = Map<string, ResourceArchiveEntry>
export type OpenResourceArchive = {
  entries: ResourceArchiveEntries
  close: () => Promise<void>
}

const resourceXMLParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  trimValues: true,
  removeNSPrefix: true,
  processEntities: {
    enabled: true,
    maxTotalExpansions: XML_ENTITY_MAX_TOTAL_EXPANSIONS,
    maxExpandedLength: XML_ENTITY_MAX_EXPANDED_LENGTH,
  },
})

function isFileEntry(entry: Entry): entry is ResourceArchiveEntry {
  return entry.directory === false
}

export function parseTResourceXmlRecord<TValue>(value: TValue): TResourceXmlRecord | undefined {
  return parseTJsonObject(value)
}

export function normalizeArchivePath(filename: string): string {
  return path.posix.normalize(filename).replace(/^\.\//u, "")
}

export async function openResourceArchive(
  sourcePath: string,
  budget: ResourceArchiveBudget = RESOURCE_DEFAULT_ARCHIVE_BUDGET,
): Promise<OpenResourceArchive> {
  const bytes = await fs.readFile(sourcePath)
  return openResourceArchiveBytes(bytes, budget)
}

export async function openResourceArchiveBytes(
  bytes: Uint8Array,
  budget: ResourceArchiveBudget = RESOURCE_DEFAULT_ARCHIVE_BUDGET,
): Promise<OpenResourceArchive> {
  const blobBytes = new Uint8Array(new ArrayBuffer(bytes.byteLength))
  blobBytes.set(bytes)
  const reader = new ZipReader<Blob>(new BlobReader(new Blob([blobBytes])))
  try {
    const entries = await reader.getEntries()
    assertResourceArchiveBudget(entries, budget)
    return {
      entries: new Map(
        entries
          .filter(isFileEntry)
          .map((entry) => [normalizeArchivePath(entry.filename), entry] as const),
      ),
      close: async () => reader.close(),
    }
  } catch (error) {
    await reader.close().catch(() => undefined)
    throw error
  }
}

export async function assertResourceArchiveFileBudget(
  sourcePath: string,
  budget: ResourceArchiveBudget = RESOURCE_DEFAULT_ARCHIVE_BUDGET,
): Promise<void> {
  const archive = await openResourceArchive(sourcePath, budget)
  await archive.close()
}

export async function assertResourceArchiveBytesBudget(
  bytes: Uint8Array,
  budget: ResourceArchiveBudget = RESOURCE_DEFAULT_ARCHIVE_BUDGET,
): Promise<void> {
  const archive = await openResourceArchiveBytes(bytes, budget)
  await archive.close()
}

export async function readArchiveEntryText(
  entries: ResourceArchiveEntries,
  filename: string,
): Promise<string> {
  const entry = entries.get(normalizeArchivePath(filename))
  if (!entry) throw new Error(`Missing archive entry: ${filename}`)
  return entry.getData(new TextWriter())
}

export async function readArchiveEntryBytes(
  entries: ResourceArchiveEntries,
  filename: string,
): Promise<Uint8Array | undefined> {
  const entry = entries.get(normalizeArchivePath(filename))
  if (!entry) return undefined
  const blob = await entry.getData(new BlobWriter())
  if (!blob) return undefined
  return new Uint8Array(await blob.arrayBuffer())
}

export function parseResourceXml(xml: string): TResourceXmlRecord {
  const parsed = parseTResourceXmlRecord(resourceXMLParser.parse(xml))
  if (parsed === undefined) throw new Error("Archive XML did not contain an object root.")
  return parsed
}

export function ensureResourceXmlArray(value: TResourceXmlValue | undefined): TResourceXmlRecord[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      const record = parseTResourceXmlRecord(entry)
      return record === undefined ? [] : [record]
    })
  }
  const record = parseTResourceXmlRecord(value)
  return record === undefined ? [] : [record]
}

export function getResourceXmlValue(
  value: TResourceXmlValue | undefined,
  pathSegments: string[],
): TResourceXmlValue | undefined {
  let current: TResourceXmlValue | undefined = value
  for (const segment of pathSegments) {
    const record = parseTResourceXmlRecord(current)
    if (record === undefined) return undefined
    current = record[segment]
  }
  return current
}

export function resourceXmlStringValue(record: TResourceXmlValue | undefined, key: string): string {
  const parsed = parseTResourceXmlRecord(record)
  if (parsed === undefined) return ""
  return resourceXmlScalarText(parsed[key])
}

export function resourceXmlTextValue(value: TResourceXmlValue | undefined): string {
  const scalar = resourceXmlScalarText(value)
  if (scalar.length > 0) return scalar
  if (Array.isArray(value)) {
    return value.map(resourceXmlTextValue).filter(Boolean).join(" ")
  }
  const record = parseTResourceXmlRecord(value)
  if (record === undefined) return ""
  const textNode = parseTString(record[XML_TEXT_KEY])
  if (textNode !== undefined) return textNode
  const textAlias = parseTString(record[XML_TEXT_ALIAS_KEY])
  return textAlias ?? ""
}

function resourceXmlScalarText(value: TResourceXmlValue | undefined): string {
  const text = parseTString(value)
  if (text !== undefined) return text
  const numeric = parseTNumber(value)
  return numeric === undefined ? "" : String(numeric)
}
