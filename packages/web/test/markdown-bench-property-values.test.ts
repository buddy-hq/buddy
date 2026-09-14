import { describe, expect, test } from "bun:test"
import { parseMarkdownBenchProperties } from "../src/components/bench/markdown/property-values"

const NOTE_ID = "01K4Z7Q9M2C8V3N5B6X1R0T2YH"

describe("Markdown Bench property values", () => {
  test("types frontmatter values the way Obsidian's Properties view does", () => {
    const properties = parseMarkdownBenchProperties({
      type: "buddy-note",
      "buddy-id": NOTE_ID,
      aliases: ["One", "", null, 3],
      tags: "chemistry",
      rating: 4,
      done: false,
      due: "2026-09-14",
      reviewed: "2026-09-14T10:30",
      extra: { nested: true },
      blank: null,
    })

    expect(properties).toEqual([
      { name: "type", kind: "text", text: "buddy-note" },
      { name: "buddy-id", kind: "text", text: NOTE_ID },
      { name: "aliases", kind: "list", items: ["One", "3"] },
      { name: "tags", kind: "tags", items: ["chemistry"] },
      { name: "rating", kind: "number", text: "4" },
      { name: "done", kind: "checkbox", checked: false },
      {
        name: "due",
        kind: "date",
        text: expect.any(String),
        iso: "2026-09-14",
      },
      { name: "reviewed", kind: "datetime", text: expect.any(String), iso: "2026-09-14T10:30" },
      { name: "extra", kind: "text", text: '{"nested":true}' },
      { name: "blank", kind: "text", text: "" },
    ])
    const due = properties.find((property) => property.name === "due")
    const reviewed = properties.find((property) => property.name === "reviewed")
    expect(due?.kind === "date" ? due.text : undefined).not.toBe("2026-09-14")
    expect(reviewed?.kind === "datetime" ? reviewed.text : undefined).not.toBe(
      "2026-09-14T10:30",
    )
  })

  test("formats Obsidian datetimes with spaces and leaves impossible dates as text", () => {
    const properties = parseMarkdownBenchProperties({
      scheduled: "2026-09-14 10:30",
      rollover: "2026-02-31",
      invalid: "2026-13-45",
    })

    expect(properties).toEqual([
      {
        name: "scheduled",
        kind: "datetime",
        text: expect.any(String),
        iso: "2026-09-14 10:30",
      },
      { name: "rollover", kind: "text", text: "2026-02-31" },
      { name: "invalid", kind: "text", text: "2026-13-45" },
    ])
    const scheduled = properties.find((property) => property.name === "scheduled")
    expect(scheduled?.kind === "datetime" ? scheduled.text : undefined).not.toBe(
      "2026-09-14 10:30",
    )
  })

  test("shows no properties when a note has no frontmatter", () => {
    expect(parseMarkdownBenchProperties(undefined)).toEqual([])
  })
})
