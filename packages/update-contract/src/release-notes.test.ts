import { describe, expect, test } from "bun:test"
import {
  MAX_RELEASE_NOTE_ITEMS,
  MAX_RELEASE_NOTE_ITEM_LENGTH,
  parseReleaseNote,
} from "./release-notes"

const RELEASE_URL = "https://example.com/releases/v1.1.0"

describe("published release bodies become plain text", () => {
  test("markup and links are rendered as the text they wrap", () => {
    const note = parseReleaseNote({
      version: "1.1.0",
      url: RELEASE_URL,
      body: "## What's Changed\n- **Bench** now opens [faster](https://example.com/pr/1)\n- <b>Fixes</b> a crash &amp; a leak",
    })

    expect(note.items).toEqual(["Bench now opens faster", "Fixes a crash & a leak"])
  })

  test("preserves punctuation inside code identifiers", () => {
    const note = parseReleaseNote({
      version: "1.1.0",
      url: RELEASE_URL,
      body: "- Fix `use_update` handling\n- Keep unmatched_name and unmatched*markers",
    })

    expect(note.items).toEqual([
      "Fix use_update handling",
      "Keep unmatched_name and unmatched*markers",
    ])
  })

  test("headings and blank lines are dropped", () => {
    const note = parseReleaseNote({
      version: "1.1.0",
      url: RELEASE_URL,
      body: "# Release 1.1.0\n\n### Fixes\n\n- One real change\n\n",
    })

    expect(note.items).toEqual(["One real change"])
  })

  test("generated attribution suffixes are dropped", () => {
    const note = parseReleaseNote({
      version: "1.1.0",
      url: RELEASE_URL,
      body: "* Fix the reader by @someone in https://example.com/pull/12",
    })

    expect(note.items).toEqual(["Fix the reader"])
  })

  test("repeated lines are kept once", () => {
    const note = parseReleaseNote({
      version: "1.1.0",
      url: RELEASE_URL,
      body: "- Same change\n- same change\n- Another change",
    })

    expect(note.items).toEqual(["Same change", "Another change"])
  })

  test("long lines are truncated to a readable length", () => {
    const note = parseReleaseNote({ version: "1.1.0", url: RELEASE_URL, body: `- ${"a".repeat(400)}` })
    const [item] = note.items

    expect(item).toBeDefined()
    expect(item?.length).toBe(MAX_RELEASE_NOTE_ITEM_LENGTH)
    expect(item?.endsWith("…")).toBe(true)
  })

  test("overflow is reported rather than hidden", () => {
    const body = Array.from({ length: 12 }, (_, index) => `- Change ${index}`).join("\n")
    const note = parseReleaseNote({ version: "1.1.0", url: RELEASE_URL, body })

    expect(note.items).toHaveLength(MAX_RELEASE_NOTE_ITEMS)
    expect(note.totalItems).toBe(12)
  })

  test("decodes numeric entities and leaves malformed ones alone", () => {
    const note = parseReleaseNote({
      version: "1.1.0",
      url: RELEASE_URL,
      body: "- Renders &#8212; correctly and &#9999999999; safely",
    })

    expect(note.items).toEqual(["Renders — correctly and &#9999999999; safely"])
  })
})
