import { describe, expect, test } from "bun:test"
import { shouldDismissPdfSelectionForRelocation } from "../src/components/readers/pdf/pdf-reader-state"
import type { PdfPositionAnchor, ReaderRelocation } from "../src/components/readers/reader-types"

const CURRENT_ANCHOR: PdfPositionAnchor = {
  kind: "pdf-position",
  pageIndex: 1,
  xRatio: 0,
  yRatio: 0.25,
}

const CURRENT_LOCATION: ReaderRelocation = {
  anchor: CURRENT_ANCHOR,
  fraction: 0.2,
  locationLabel: "Page 2 of 10",
}

describe("PDF reader relocation state", () => {
  test("keeps a selection when only display metadata changes", () => {
    expect(
      shouldDismissPdfSelectionForRelocation(CURRENT_LOCATION, {
        ...CURRENT_LOCATION,
        locationLabel: "Printed page iv",
      }),
    ).toBe(false)
  })

  test("keeps a selection while scrolling within its page", () => {
    expect(
      shouldDismissPdfSelectionForRelocation(CURRENT_LOCATION, {
        ...CURRENT_LOCATION,
        anchor: { ...CURRENT_ANCHOR, yRatio: 0.5 },
      }),
    ).toBe(false)
  })

  test("dismisses a selection after changing pages", () => {
    expect(
      shouldDismissPdfSelectionForRelocation(CURRENT_LOCATION, {
        ...CURRENT_LOCATION,
        anchor: { ...CURRENT_ANCHOR, pageIndex: 2 },
      }),
    ).toBe(true)
  })

  test("does not dismiss before the reader publishes its first location", () => {
    expect(shouldDismissPdfSelectionForRelocation(null, CURRENT_LOCATION)).toBe(false)
  })
})
