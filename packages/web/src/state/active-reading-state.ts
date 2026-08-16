import {
  READER_ANCHOR_KIND_CFI_POSITION,
  readReaderLocation,
  readerPositionAnchorEquals,
  type ReaderLocation,
  type ReaderRelocation,
  type ReaderTrailEntry,
} from "@buddy/reader-contract"
import { z } from "zod"
import {
  parseBuddyConfigObject,
  parseOptionalStringField,
  parseStringValue,
  parseWithSchema,
  type TBuddyConfigObject,
} from "./parse-external"

export type ReadingResourceStatus =
  | "preparing"
  | "ready"
  | "unsupported"
  | "error"
  | "stale"
  | "unprocessed"

export type AnnotationSummaryEntry = {
  text: string
  tocLabel?: string
  note?: string
}

export type ActiveReadingResourceState = {
  objectID?: string
  alias?: string
  name: string
  path: string
  status?: ReadingResourceStatus
  location?: ReaderLocation
  currentPassageText?: string
  visibleStartText?: string
  visibleEndText?: string
  readingTrail?: ReaderTrailEntry[]
  annotationSummary?: AnnotationSummaryEntry[]
}

export type ActiveReadingLocationUpdate = ReaderRelocation

export const READING_TRAIL_MAX_ENTRIES = 20

const readingStatusSchema = z.enum([
  "preparing",
  "ready",
  "unsupported",
  "error",
  "stale",
  "unprocessed",
])

function parseReadingStatus<TValue>(value: TValue): ReadingResourceStatus | undefined | null {
  if (value === undefined) return undefined
  return parseWithSchema(readingStatusSchema, value) ?? null
}

function readLegacyLocation(value: TBuddyConfigObject): ReaderLocation | undefined {
  const cfi = parseStringValue(value.cfi)
  if (cfi === undefined || cfi.length === 0) return undefined

  return readReaderLocation(
    Object.assign(
      Object.assign(
        {
          anchor: Object.assign(
            {
              kind: READER_ANCHOR_KIND_CFI_POSITION,
              cfi,
            },
            value.index !== undefined ? { sectionIndex: value.index } : undefined,
          ),
        },
        value.fraction !== undefined ? { fraction: value.fraction } : undefined,
        value.tocLabel !== undefined ? { tocLabel: value.tocLabel } : undefined,
        value.pageLabel !== undefined ? { pageLabel: value.pageLabel } : undefined,
      ),
      value.locationLabel !== undefined ? { locationLabel: value.locationLabel } : undefined,
    ),
  )
}

function readLocation(value: TBuddyConfigObject): ReaderLocation | undefined {
  if (value.location !== undefined) return readReaderLocation(value.location)
  return readLegacyLocation(value)
}

function readTrailEntry<TValue>(value: TValue): ReaderTrailEntry | undefined {
  const record = parseBuddyConfigObject(value)
  if (!record) return undefined
  const label = parseStringValue(record.label) ?? parseStringValue(record.tocLabel)
  if (!label) return undefined

  const location =
    record.anchor !== undefined
      ? readReaderLocation(
          Object.assign(
            { anchor: record.anchor },
            record.fraction !== undefined ? { fraction: record.fraction } : undefined,
          ),
        )
      : readLegacyLocation(record)
  if (!location) return undefined

  return Object.assign(
    {
      label,
      anchor: location.anchor,
    },
    location.fraction !== undefined ? { fraction: location.fraction } : undefined,
  )
}

function readTrail<TValue>(value: TValue): ReaderTrailEntry[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) return undefined
  const entries = value.flatMap((entry) => {
    const parsed = readTrailEntry(entry)
    return parsed ? [parsed] : []
  })
  return entries.length > 0 ? entries : undefined
}

function readAnnotationSummaryEntry<TValue>(value: TValue): AnnotationSummaryEntry | undefined {
  const record = parseBuddyConfigObject(value)
  const text = parseStringValue(record?.text)
  if (!record || text === undefined) return undefined
  const tocLabel = parseOptionalStringField(record.tocLabel)
  const note = parseOptionalStringField(record.note)
  if (tocLabel === null || note === null) return undefined
  return Object.assign(
    { text },
    tocLabel !== undefined ? { tocLabel } : undefined,
    note !== undefined ? { note } : undefined,
  )
}

function readAnnotationSummary<TValue>(value: TValue): AnnotationSummaryEntry[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) return undefined
  const entries = value.flatMap((entry) => {
    const parsed = readAnnotationSummaryEntry(entry)
    return parsed ? [parsed] : []
  })
  return entries.length > 0 ? entries : undefined
}

export function readActiveReadingResourceState<TValue>(
  value: TValue,
): ActiveReadingResourceState | undefined {
  const record = parseBuddyConfigObject(value)
  const name = parseStringValue(record?.name)
  const path = parseStringValue(record?.path)
  if (!record || name === undefined || path === undefined) {
    return undefined
  }

  const objectID = parseOptionalStringField(record.objectID)
  const alias = parseOptionalStringField(record.alias)
  const status = parseReadingStatus(record.status)
  const currentPassageText = parseOptionalStringField(record.currentPassageText)
  const visibleStartText = parseOptionalStringField(record.visibleStartText)
  const visibleEndText = parseOptionalStringField(record.visibleEndText)
  if (
    objectID === null ||
    alias === null ||
    status === null ||
    currentPassageText === null ||
    visibleStartText === null ||
    visibleEndText === null
  ) {
    return undefined
  }

  const location = readLocation(record)
  const readingTrail = readTrail(record.readingTrail)
  const annotationSummary = readAnnotationSummary(record.annotationSummary)
  const state: ActiveReadingResourceState = Object.assign(
    Object.assign(
      Object.assign(
        {},
        objectID !== undefined ? { objectID } : undefined,
        alias !== undefined ? { alias } : undefined,
        { name, path },
      ),
      Object.assign(
        {},
        status !== undefined ? { status } : undefined,
        location ? { location } : undefined,
        currentPassageText !== undefined ? { currentPassageText } : undefined,
      ),
      Object.assign(
        {},
        visibleStartText !== undefined ? { visibleStartText } : undefined,
        visibleEndText !== undefined ? { visibleEndText } : undefined,
        readingTrail ? { readingTrail } : undefined,
      ),
    ),
    annotationSummary ? { annotationSummary } : undefined,
  )
  return state
}

export function stripTransientActiveReadingResourceFields(
  value: ActiveReadingResourceState,
): ActiveReadingResourceState {
  const {
    currentPassageText: _currentPassageText,
    visibleStartText: _visibleStartText,
    visibleEndText: _visibleEndText,
    readingTrail: _readingTrail,
    annotationSummary: _annotationSummary,
    ...persisted
  } = value
  return persisted
}

export function readActiveReadingResourceRecord<TValue>(
  value: TValue,
): Record<string, ActiveReadingResourceState> | undefined {
  const record = parseBuddyConfigObject(value)
  if (!record) return undefined
  const result: Record<string, ActiveReadingResourceState> = {}
  for (const [key, entry] of Object.entries(record)) {
    const parsed = readActiveReadingResourceState(entry)
    if (parsed) result[key] = stripTransientActiveReadingResourceFields(parsed)
  }
  return result
}

export function readerTrailEntriesEqual(
  left: ReaderTrailEntry | undefined,
  right: ReaderTrailEntry,
): boolean {
  if (!left) return false
  return (
    left.label === right.label &&
    left.fraction === right.fraction &&
    readerPositionAnchorEquals(left.anchor, right.anchor)
  )
}

export function activeReadingLocationUpdatesEqual(
  left: ActiveReadingLocationUpdate | undefined,
  right: ActiveReadingLocationUpdate,
): boolean {
  if (!left) return false
  return (
    readerPositionAnchorEquals(left.anchor, right.anchor) &&
    left.fraction === right.fraction &&
    left.tocLabel === right.tocLabel &&
    left.pageLabel === right.pageLabel &&
    left.locationLabel === right.locationLabel &&
    left.currentPassageText === right.currentPassageText
  )
}
