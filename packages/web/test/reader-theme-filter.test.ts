import { describe, expect, test } from "bun:test"
import {
  READER_THEMES,
  resolveReaderContentFilter,
} from "../src/components/readers/foliate-reader-constants"

describe("reader theme filter", () => {
  test("does not apply PDF inversion to dark EPUB themes", () => {
    const nightTheme = READER_THEMES.find((theme) => theme.id === "night")
    expect(nightTheme).toBeDefined()
    if (!nightTheme) return

    expect(
      resolveReaderContentFilter({
        sourceIsPdf: false,
        isFixedLayout: false,
        pdfFilter: nightTheme.pdfFilter,
      }),
    ).toBe("none")
    expect(
      resolveReaderContentFilter({
        sourceIsPdf: true,
        isFixedLayout: true,
        pdfFilter: nightTheme.pdfFilter,
      }),
    ).toBe(nightTheme.pdfFilter)
  })
})
