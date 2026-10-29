import z from "zod"
import { parseJsonObjectFromText, type TJsonObject } from "@buddy/transcript-contract/parse-external"

export function parseMemoryObject<T>(text: string, schema: z.ZodType<T>) {
  return schema.safeParse(extractJsonFromText(text))
}

function extractJsonFromText(text: string): TJsonObject | undefined {
  if (!text || text.trim().length === 0) return undefined

  const codeBlockJson = extractSingleJsonObject(markdownCodeBlockContents(text))
  if (codeBlockJson !== undefined) {
    return codeBlockJson
  }

  const trimmed = text.trim()
  const wholeTextJson = parseJsonObjectFromText(trimmed)
  if (wholeTextJson !== undefined) {
    return wholeTextJson
  }

  return extractSingleJsonObject(jsonObjectCandidates(trimmed))
}

function markdownCodeBlockContents(text: string): string[] {
  const contents: string[] = []
  const codeBlockPattern = /```(?:json)?\s*([\s\S]*?)\s*```/giu
  let match = codeBlockPattern.exec(text)
  while (match) {
    contents.push(match[1])
    match = codeBlockPattern.exec(text)
  }
  return contents
}

function extractSingleJsonObject(candidates: Iterable<string>): TJsonObject | undefined {
  let parsed: TJsonObject | undefined
  for (const candidate of candidates) {
    const next = parseJsonObjectFromText(candidate.trim())
    if (next === undefined) continue
    if (parsed !== undefined) return undefined
    parsed = next
  }
  return parsed
}

function* jsonObjectCandidates(text: string): Generator<string> {
  let start = -1
  let depth = 0
  let inString = false
  let escaped = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]

    if (start === -1) {
      if (char === "{") {
        start = index
        depth = 1
        inString = false
        escaped = false
      }
      continue
    }

    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }
      if (char === "\\") {
        escaped = true
        continue
      }
      if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }

    if (char === "{") {
      depth += 1
      continue
    }

    if (char !== "}") {
      continue
    }

    depth -= 1
    if (depth === 0) {
      yield text.slice(start, index + 1)
      start = -1
    }
  }
}

