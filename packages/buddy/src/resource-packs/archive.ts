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

const XML_ENTITY_MAX_TOTAL_EXPANSIONS = 10_000
const XML_ENTITY_MAX_EXPANDED_LENGTH = 1_000_000

export type ResourceXmlRecord = Record<string, unknown>
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

export function isResourceXmlRecord(value: unknown): value is ResourceXmlRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
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
  const text = await entry.getData(new TextWriter())
  return typeof text === "string" ? text : String(text)
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

export function parseResourceXml(xml: string): ResourceXmlRecord {
  const parsed: unknown = resourceXMLParser.parse(xml)
  if (!isResourceXmlRecord(parsed)) throw new Error("Archive XML did not contain an object root.")
  return parsed
}

export function ensureResourceXmlArray(value: unknown): ResourceXmlRecord[] {
  if (Array.isArray(value)) return value.filter(isResourceXmlRecord)
  return isResourceXmlRecord(value) ? [value] : []
}

export function getResourceXmlValue(value: unknown, pathSegments: string[]): unknown {
  let current: unknown = value
  for (const segment of pathSegments) {
    if (!isResourceXmlRecord(current)) return undefined
    current = current[segment]
  }
  return current
}

export function resourceXmlStringValue(record: unknown, key: string): string {
  if (!isResourceXmlRecord(record)) return ""
  const value = record[key]
  if (typeof value === "string") return value
  if (typeof value === "number") return String(value)
  return ""
}

export function resourceXmlTextValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value)
  if (Array.isArray(value)) {
    return value.map(resourceXmlTextValue).filter(Boolean).join(" ")
  }
  if (!isResourceXmlRecord(value)) return ""
  if (typeof value["#text"] === "string") return value["#text"]
  if (typeof value.text === "string") return value.text
  return ""
}
