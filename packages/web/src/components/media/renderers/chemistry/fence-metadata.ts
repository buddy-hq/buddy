import { chemistryFormatLabel, type ChemistryFormat } from "./formats"

export type ChemistryFenceMetadataDiagnostic =
  | {
      kind: "duplicate-field"
      field: "alt" | "caption"
      offset: number
    }
  | {
      kind: "malformed-entry"
      offset: number
    }
  | {
      kind: "unknown-field"
      field: string
      offset: number
    }

export type ChemistryFenceMetadata = {
  rawMetadata: string
  alt: string | undefined
  caption: string | undefined
  diagnostics: ChemistryFenceMetadataDiagnostic[]
}

type ParsedMetadataEntry = {
  field: string
  value: string
  offset: number
  nextOffset: number
}

type MetadataEntryResult =
  | { kind: "valid"; entry: ParsedMetadataEntry }
  | { kind: "malformed"; nextOffset: number }

const CHEMISTRY_ACCESSIBLE_LABEL_MAX_CHARACTERS = 200
const CHEMISTRY_ACCESSIBLE_LABEL_MAX_SCAN_CODE_UNITS = 4_096
const ACCESSIBLE_WHITESPACE_RE = /\s/u
const METADATA_FIELD_RE = /[A-Za-z0-9_-]/u
const METADATA_FIELD_START_RE = /[A-Za-z_]/u
const METADATA_WHITESPACE_RE = /[ \t]/u

function skipMetadataWhitespace(rawMetadata: string, offset: number): number {
  let nextOffset = offset
  while (
    nextOffset < rawMetadata.length &&
    METADATA_WHITESPACE_RE.test(rawMetadata[nextOffset] ?? "")
  ) {
    nextOffset += 1
  }
  return nextOffset
}

function consumeMalformedEntry(rawMetadata: string, offset: number): number {
  let nextOffset = offset
  while (
    nextOffset < rawMetadata.length &&
    !METADATA_WHITESPACE_RE.test(rawMetadata[nextOffset] ?? "")
  ) {
    nextOffset += 1
  }
  return nextOffset === offset ? offset + 1 : nextOffset
}

function decodeMetadataEscape(character: string): string {
  switch (character) {
    case "n":
      return "\n"
    case "r":
      return "\r"
    case "t":
      return "\t"
    default:
      return character
  }
}

function parseQuotedMetadataValue(input: {
  rawMetadata: string
  offset: number
  quote: '"' | "'"
}): { value: string; nextOffset: number } | undefined {
  let value = ""
  let offset = input.offset + 1

  while (offset < input.rawMetadata.length) {
    const character = input.rawMetadata[offset] ?? ""
    if (character === input.quote) {
      return { value, nextOffset: offset + 1 }
    }
    if (character === "\\") {
      const escapedCharacter = input.rawMetadata[offset + 1]
      if (escapedCharacter === undefined) return undefined
      value += decodeMetadataEscape(escapedCharacter)
      offset += 2
      continue
    }
    value += character
    offset += 1
  }

  return undefined
}

function parseMetadataEntry(rawMetadata: string, offset: number): MetadataEntryResult {
  const fieldStart = offset
  const firstCharacter = rawMetadata[offset] ?? ""
  if (!METADATA_FIELD_START_RE.test(firstCharacter)) {
    return {
      kind: "malformed",
      nextOffset: consumeMalformedEntry(rawMetadata, fieldStart),
    }
  }

  offset += 1
  while (offset < rawMetadata.length && METADATA_FIELD_RE.test(rawMetadata[offset] ?? "")) {
    offset += 1
  }
  const field = rawMetadata.slice(fieldStart, offset).toLowerCase()
  offset = skipMetadataWhitespace(rawMetadata, offset)
  if (rawMetadata[offset] !== "=") {
    return {
      kind: "malformed",
      nextOffset: consumeMalformedEntry(rawMetadata, fieldStart),
    }
  }

  offset = skipMetadataWhitespace(rawMetadata, offset + 1)
  const valueStart = offset
  const quote = rawMetadata[offset]
  let parsedValue: { value: string; nextOffset: number } | undefined
  if (quote === '"' || quote === "'") {
    parsedValue = parseQuotedMetadataValue({ rawMetadata, offset, quote })
  } else {
    if (valueStart >= rawMetadata.length) {
      return { kind: "malformed", nextOffset: rawMetadata.length }
    }
    const valueEnd = consumeMalformedEntry(rawMetadata, valueStart)
    parsedValue = {
      value: rawMetadata.slice(valueStart, valueEnd),
      nextOffset: valueEnd,
    }
  }
  if (!parsedValue) {
    return { kind: "malformed", nextOffset: rawMetadata.length }
  }

  const nextCharacter = rawMetadata[parsedValue.nextOffset]
  if (nextCharacter !== undefined && !METADATA_WHITESPACE_RE.test(nextCharacter)) {
    return {
      kind: "malformed",
      nextOffset:
        quote === '"' || quote === "'"
          ? rawMetadata.length
          : consumeMalformedEntry(rawMetadata, fieldStart),
    }
  }

  return {
    kind: "valid",
    entry: {
      field,
      value: parsedValue.value,
      offset: fieldStart,
      nextOffset: parsedValue.nextOffset,
    },
  }
}

/**
 * Parses author-supplied chemistry fence metadata without rewriting the raw input.
 * The first valid `alt` or `caption` wins; later duplicates are diagnosed and ignored.
 */
export function parseChemistryFenceMetadata(rawMetadata: string): ChemistryFenceMetadata {
  const diagnostics: ChemistryFenceMetadataDiagnostic[] = []
  let alt: string | undefined
  let caption: string | undefined
  let offset = 0

  while (offset < rawMetadata.length) {
    offset = skipMetadataWhitespace(rawMetadata, offset)
    if (offset >= rawMetadata.length) break

    const entryOffset = offset
    const result = parseMetadataEntry(rawMetadata, entryOffset)
    if (result.kind === "malformed") {
      diagnostics.push({ kind: "malformed-entry", offset: entryOffset })
      offset = result.nextOffset
      continue
    }
    const entry = result.entry
    offset = entry.nextOffset

    if (entry.field === "alt") {
      if (alt === undefined) alt = entry.value
      else diagnostics.push({ kind: "duplicate-field", field: "alt", offset: entry.offset })
      continue
    }
    if (entry.field === "caption") {
      if (caption === undefined) caption = entry.value
      else
        diagnostics.push({
          kind: "duplicate-field",
          field: "caption",
          offset: entry.offset,
        })
      continue
    }
    diagnostics.push({ kind: "unknown-field", field: entry.field, offset: entry.offset })
  }

  return { rawMetadata, alt, caption, diagnostics }
}

function boundedAccessibleText(value: string): string {
  const characters: string[] = []
  let pendingSpace = false
  let scannedCodeUnits = 0
  let truncated = false

  for (const character of value) {
    scannedCodeUnits += character.length
    if (scannedCodeUnits > CHEMISTRY_ACCESSIBLE_LABEL_MAX_SCAN_CODE_UNITS) {
      truncated = true
      break
    }
    if (ACCESSIBLE_WHITESPACE_RE.test(character)) {
      pendingSpace = characters.length > 0
      continue
    }

    if (pendingSpace && characters.length < CHEMISTRY_ACCESSIBLE_LABEL_MAX_CHARACTERS) {
      characters.push(" ")
    }
    pendingSpace = false
    if (characters.length >= CHEMISTRY_ACCESSIBLE_LABEL_MAX_CHARACTERS) {
      truncated = true
      break
    }
    characters.push(character)

    if (
      characters.length >= CHEMISTRY_ACCESSIBLE_LABEL_MAX_CHARACTERS &&
      scannedCodeUnits < value.length
    ) {
      truncated = true
      break
    }
  }

  if (characters.length === 0) return ""
  if (!truncated) return characters.join("")
  return `${characters.slice(0, CHEMISTRY_ACCESSIBLE_LABEL_MAX_CHARACTERS - 1).join("")}…`
}

export function chemistryFenceAccessibleLabel(input: {
  format: ChemistryFormat
  source: string
  alt?: string
}): string {
  const authoredAlt = input.alt ? boundedAccessibleText(input.alt) : ""
  if (authoredAlt.length > 0) return authoredAlt

  const formatLabel = chemistryFormatLabel(input.format)
  const sourceSummary = boundedAccessibleText(input.source)
  return sourceSummary.length > 0
    ? boundedAccessibleText(`${formatLabel} chemistry structure: ${sourceSummary}`)
    : `${formatLabel} chemistry structure`
}
