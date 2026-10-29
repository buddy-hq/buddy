import { Schema } from "effect"
import { parseJsonObject, parseStringValue } from "./parse-external"

export const REFERENCE_PART_TYPE = "reference" as const
export const LEGACY_REFERENCE_PART_TYPE = "opencode-reference" as const

export type ReferencePart = {
  readonly type: typeof REFERENCE_PART_TYPE
  readonly name: string
  readonly path: string
}

export const PromptSegment = Schema.Struct({
  start: Schema.Number,
  end: Schema.Number,
  synthetic: Schema.optional(Schema.Boolean),
  ignored: Schema.optional(Schema.Boolean),
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
})
export type PromptSegment = typeof PromptSegment.Type

export const PromptPresentation = Schema.Struct({
  segments: Schema.Array(PromptSegment),
  system: Schema.optional(Schema.String),
})
export type PromptPresentation = typeof PromptPresentation.Type

export function readPromptPresentation<TValue>(
  metadata: TValue,
  text: string,
): PromptPresentation | undefined {
  const buddy = parseJsonObject(parseJsonObject(metadata)?.buddy)
  const prompt = buddy?.prompt
  if (!Schema.is(PromptPresentation)(prompt)) return undefined
  let end = 0
  for (const segment of prompt.segments) {
    if (
      !Number.isSafeInteger(segment.start) ||
      !Number.isSafeInteger(segment.end) ||
      segment.start < end ||
      segment.end < segment.start ||
      segment.end > text.length
    )
      return undefined
    end = segment.end
  }
  return prompt
}

export function readCommandDisplay<TValue>(metadata: TValue): string | undefined {
  const buddy = parseJsonObject(parseJsonObject(metadata)?.buddy)
  const command = parseJsonObject(buddy?.command)
  return parseStringValue(command?.display)
}
