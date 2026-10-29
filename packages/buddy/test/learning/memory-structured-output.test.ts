import { describe, expect, test } from "bun:test"
import z from "zod"
import { parseMemoryObject } from "../../src/learning/features/memory/structured-output"

function extractJsonFromText(text: string) {
  const result = parseMemoryObject(text, z.record(z.string(), z.unknown()))
  return result.success ? result.data : undefined
}

describe("memory generation JSON boundary", () => {
  test("extracts one balanced JSON object from prose", () => {
    expect(extractJsonFromText('Here is the result: {"schemaVersion":1,"patches":[]}')).toEqual({
      schemaVersion: 1,
      patches: [],
    })
  })

  test("preserves braces inside JSON strings while scanning", () => {
    expect(extractJsonFromText('Result: {"schemaVersion":1,"body":"Use {x} literally."}')).toEqual({
      schemaVersion: 1,
      body: "Use {x} literally.",
    })
  })

  test("rejects ambiguous multi-object prose instead of guessing", () => {
    expect(
      extractJsonFromText(
        'Draft: {"schemaVersion":1,"patches":[{"title":"wrong"}]}\nFinal: {"schemaVersion":1,"patches":[]}',
      ),
    ).toBeUndefined()
  })

  test("prefers a single JSON markdown code block", () => {
    expect(
      extractJsonFromText(
        ["Final:", "```json", '{"schemaVersion":1,"patches":[{"title":"right"}]}', "```"].join(
          "\n",
        ),
      ),
    ).toEqual({
      schemaVersion: 1,
      patches: [{ title: "right" }],
    })
  })
})
