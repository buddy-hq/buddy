import { describe, expect, test } from "bun:test"
import {
  chemistryFenceAccessibleLabel,
  parseChemistryFenceMetadata,
} from "../src/components/media/renderers/chemistry/fence-metadata"

describe("chemistry fence metadata", () => {
  test("parses quoted labels and captions with escapes without rewriting metadata", () => {
    const rawMetadata = String.raw`alt="Lactic \"acid\"" caption='Line\nA \\ B'`

    expect(parseChemistryFenceMetadata(rawMetadata)).toEqual({
      rawMetadata,
      alt: 'Lactic "acid"',
      caption: "Line\nA \\ B",
      diagnostics: [],
    })
  })

  test("uses the first valid known field and diagnoses duplicates and unknown fields", () => {
    const parsed = parseChemistryFenceMetadata(
      'profile=publication alt="Primary" ALT="Secondary" caption="Legend"',
    )

    expect(parsed.alt).toBe("Primary")
    expect(parsed.caption).toBe("Legend")
    expect(parsed.diagnostics).toEqual([
      { kind: "unknown-field", field: "profile", offset: 0 },
      { kind: "duplicate-field", field: "alt", offset: 34 },
    ])
  })

  test("does not reinterpret text after a malformed quoted entry", () => {
    const parsed = parseChemistryFenceMetadata('alt="unterminated caption="Not a separate field"')

    expect(parsed).toEqual({
      rawMetadata: 'alt="unterminated caption="Not a separate field"',
      alt: undefined,
      caption: undefined,
      diagnostics: [{ kind: "malformed-entry", offset: 0 }],
    })
  })

  test("derives a bounded accessible label from the exact source when alt is absent", () => {
    const source = `  C[C@H](O)C(=O)O\r\n${"N".repeat(400)}`
    const label = chemistryFenceAccessibleLabel({ format: "smiles", source })

    expect(label.startsWith("SMILES chemistry structure: C[C@H](O)C(=O)O NNN")).toBe(true)
    expect(Array.from(label).length).toBeLessThanOrEqual(200)
    expect(label.endsWith("…")).toBe(true)
    expect(chemistryFenceAccessibleLabel({ format: "smiles", source, alt: "  Lactate  " })).toBe(
      "Lactate",
    )
  })
})
