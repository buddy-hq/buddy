import { describe, expect, test } from "bun:test"
import { pdfLocationLabel } from "../src/components/readers/pdf/pdf-location-label"

describe("PDF location labels", () => {
  test("uses the file page ordinal when its printed label is identical", () => {
    expect(pdfLocationLabel({ pageIndex: 2, pageCount: 16, pageLabel: "3" })).toBe("Page 3 of 16")
  })

  test("separates a printed page label from the file page ordinal", () => {
    expect(pdfLocationLabel({ pageIndex: 0, pageCount: 16, pageLabel: "7" })).toBe(
      "Page 1 of 16 · Label 7",
    )
  })
})
