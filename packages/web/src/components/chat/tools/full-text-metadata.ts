import { readNonEmptyString, readNonNegativeInt } from "./types"
import type { ToolState } from "./types"

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
  fullTextEstTokens?: number
  truncated: boolean
  outputPath?: string
}

export function readIngestFullTextMetadata(state: ToolState): IngestFullTextMetadata {
  return {
    resource: readNonEmptyString(state.metadata.resource),
    fullTextEstTokens: readNonNegativeInt(state.metadata.fullTextEstTokens),
    truncated: state.metadata.truncated === true,
    outputPath: readNonEmptyString(state.metadata.outputPath),
  }
}
