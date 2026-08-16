import { parseTBoolean, parseTString, readNonEmptyString, readNonNegativeInt } from "./types"
import type { ToolState } from "./types"

export const INGEST_FULL_TEXT_REASON_CONTEXT_TOO_FULL = "context_too_full"
export const INGEST_FULL_TEXT_FALLBACK_SCOPED_READING = "scoped_reading"

/** Matches resource-pack token estimation (`chars / 4`). */
export const FULL_TEXT_TOKEN_ESTIMATE_CHARS_PER_TOKEN = 4

/** Rough English average for turning estimated characters into words. */
export const FULL_TEXT_ESTIMATE_CHARS_PER_WORD = 5

export function estimateApproxWordCountFromTokens(tokenCount: number): number {
  if (tokenCount <= 0) return 0

  const estimatedCharCount = tokenCount * FULL_TEXT_TOKEN_ESTIMATE_CHARS_PER_TOKEN
  return Math.round(estimatedCharCount / FULL_TEXT_ESTIMATE_CHARS_PER_WORD)
}

export type IngestFullTextMetadata = {
  resource?: string
  completed?: boolean
  reason?: typeof INGEST_FULL_TEXT_REASON_CONTEXT_TOO_FULL
  fallback?: typeof INGEST_FULL_TEXT_FALLBACK_SCOPED_READING
  fullTextEstimatedTokens?: number
  truncated: boolean
  fullTextPath?: string
}

export function isIngestFullTextScopedReadingFallback(metadata: IngestFullTextMetadata): boolean {
  return (
    metadata.completed === false &&
    metadata.reason === INGEST_FULL_TEXT_REASON_CONTEXT_TOO_FULL &&
    metadata.fallback === INGEST_FULL_TEXT_FALLBACK_SCOPED_READING
  )
}

export function isLegacyIngestFullTextScopedReadingError(error: string | undefined): boolean {
  if (!error) return false
  return (
    error.includes("because the live session context is too full.") &&
    error.includes("Use scoped reading instead of full-text ingestion in this session.")
  )
}

function readIngestFullTextReason<TValue>(value: TValue): IngestFullTextMetadata["reason"] {
  const reason = parseTString(value)
  return reason === INGEST_FULL_TEXT_REASON_CONTEXT_TOO_FULL ? reason : undefined
}

function readIngestFullTextFallback<TValue>(value: TValue): IngestFullTextMetadata["fallback"] {
  const fallback = parseTString(value)
  return fallback === INGEST_FULL_TEXT_FALLBACK_SCOPED_READING ? fallback : undefined
}

export function readIngestFullTextMetadata(state: ToolState): IngestFullTextMetadata {
  const resource = readNonEmptyString(state.metadata.resource)
  const completed = parseTBoolean(state.metadata.completed)
  const reason = readIngestFullTextReason(state.metadata.reason)
  const fallback = readIngestFullTextFallback(state.metadata.fallback)
  const fullTextEstimatedTokens = readNonNegativeInt(state.metadata.fullTextEstimatedTokens)
  const fullTextPath = readNonEmptyString(state.metadata.fullTextPath)
  return Object.assign(
    Object.assign(
      { truncated: state.metadata.truncated === true },
      resource !== undefined ? { resource } : undefined,
      completed !== undefined ? { completed } : undefined,
      reason !== undefined ? { reason } : undefined,
    ),
    fallback !== undefined ? { fallback } : undefined,
    fullTextEstimatedTokens !== undefined ? { fullTextEstimatedTokens } : undefined,
    fullTextPath !== undefined ? { fullTextPath } : undefined,
  )
}
