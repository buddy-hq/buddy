import {
  READER_ANCHOR_KIND_CFI_POSITION,
  readReaderLocation,
  readerPositionAnchorEquals,
  type ReaderLocation,
  type ReaderRelocation,
  type ReaderTrailEntry,
} from "@buddy/reader-contract"

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readOptionalString(value: unknown): string | undefined | null {
  if (value === undefined) return undefined
  return typeof value === "string" ? value : null
}

function readStatus(value: unknown): ReadingResourceStatus | undefined | null {
  if (value === undefined) return undefined
  if (
    value === "preparing" ||
    value === "ready" ||
    value === "unsupported" ||
    value === "error" ||
    value === "stale" ||
    value === "unprocessed"
  ) {
    return value
  }
  return null
}

function readLegacyLocation(value: Record<string, unknown>): ReaderLocation | undefined {
  if (typeof value.cfi !== "string" || value.cfi.length === 0) return undefined

  return readReaderLocation(
    Object.assign(
      Object.assign(
        {
          anchor: Object.assign(
            {
              kind: READER_ANCHOR_KIND_CFI_POSITION,
              cfi: value.cfi,
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

function readLocation(value: Record<string, unknown>): ReaderLocation | undefined {
  if (value.location !== undefined) return readReaderLocation(value.location)
  return readLegacyLocation(value)
}

function readTrailEntry(value: unknown): ReaderTrailEntry | undefined {
  if (!isRecord(value)) return undefined
  const label =
    typeof value.label === "string"
      ? value.label
      : typeof value.tocLabel === "string"
        ? value.tocLabel
        : undefined
  if (!label) return undefined

  const location =
    value.anchor !== undefined
      ? readReaderLocation(
          Object.assign(
            { anchor: value.anchor },
            value.fraction !== undefined ? { fraction: value.fraction } : undefined,
          ),
        )
      : readLegacyLocation(value)
  if (!location) return undefined

  return Object.assign(
    {
      label,
      anchor: location.anchor,
    },
    location.fraction !== undefined ? { fraction: location.fraction } : undefined,
  )
}

function readTrail(value: unknown): ReaderTrailEntry[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) return undefined
  const entries = value.flatMap((entry) => {
    const parsed = readTrailEntry(entry)
    return parsed ? [parsed] : []
  })
  return entries.length > 0 ? entries : undefined
}

function readAnnotationSummaryEntry(value: unknown): AnnotationSummaryEntry | undefined {
  if (!isRecord(value) || typeof value.text !== "string") return undefined
  const tocLabel = readOptionalString(value.tocLabel)
  const note = readOptionalString(value.note)
  if (tocLabel === null || note === null) return undefined
  return Object.assign(
    { text: value.text },
    tocLabel !== undefined ? { tocLabel } : undefined,
    note !== undefined ? { note } : undefined,
  )
}

function readAnnotationSummary(value: unknown): AnnotationSummaryEntry[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) return undefined
  const entries = value.flatMap((entry) => {
    const parsed = readAnnotationSummaryEntry(entry)
    return parsed ? [parsed] : []
  })
  return entries.length > 0 ? entries : undefined
}

export function readActiveReadingResourceState(
  value: unknown,
): ActiveReadingResourceState | undefined {
  if (!isRecord(value) || typeof value.name !== "string" || typeof value.path !== "string") {
    return undefined
  }

  const objectID = readOptionalString(value.objectID)
  const alias = readOptionalString(value.alias)
  const status = readStatus(value.status)
  const currentPassageText = readOptionalString(value.currentPassageText)
  const visibleStartText = readOptionalString(value.visibleStartText)
  const visibleEndText = readOptionalString(value.visibleEndText)
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

  const location = readLocation(value)
  const readingTrail = readTrail(value.readingTrail)
  const annotationSummary = readAnnotationSummary(value.annotationSummary)
  const state: ActiveReadingResourceState = Object.assign(
    Object.assign(
      Object.assign(
        {},
        objectID !== undefined ? { objectID } : undefined,
        alias !== undefined ? { alias } : undefined,
        { name: value.name, path: value.path },
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

export function readActiveReadingResourceRecord(
  value: unknown,
): Record<string, ActiveReadingResourceState> | undefined {
  if (!isRecord(value)) return undefined
  const result: Record<string, ActiveReadingResourceState> = {}
  for (const [key, entry] of Object.entries(value)) {
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
