import { readNonEmptyString, readNonNegativeInt } from "./types"
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

export function isIngestFullTextScopedReadingFallback(
  metadata: IngestFullTextMetadata,
): boolean {
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

function readIngestFullTextReason(value: unknown): IngestFullTextMetadata["reason"] {
  return value === INGEST_FULL_TEXT_REASON_CONTEXT_TOO_FULL ? value : undefined
}

function readIngestFullTextFallback(value: unknown): IngestFullTextMetadata["fallback"] {
  return value === INGEST_FULL_TEXT_FALLBACK_SCOPED_READING ? value : undefined
}

export function readIngestFullTextMetadata(state: ToolState): IngestFullTextMetadata {
  return {
    resource: readNonEmptyString(state.metadata.resource),
    completed:
      typeof state.metadata.completed === "boolean" ? state.metadata.completed : undefined,
    reason: readIngestFullTextReason(state.metadata.reason),
    fallback: readIngestFullTextFallback(state.metadata.fallback),
    fullTextEstimatedTokens: readNonNegativeInt(state.metadata.fullTextEstimatedTokens),
    truncated: state.metadata.truncated === true,
    fullTextPath: readNonEmptyString(state.metadata.fullTextPath),
  }
}
