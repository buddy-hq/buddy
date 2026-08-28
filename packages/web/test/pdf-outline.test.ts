import { describe, expect, test } from "bun:test"
import { parsePdfOutline } from "../src/components/readers/pdf/pdf-outline"

describe("PDF outline parsing", () => {
  test("keeps valid outline nodes when one sibling has a null destination", () => {
    const outline = parsePdfOutline([
      { title: "Chapter 1", dest: "chapter-1", url: null, items: [] },
      { title: "Broken dest", dest: null, url: null, items: [] },
      { title: "Chapter 2", dest: ["page", 2], url: "https://example.test", items: [] },
    ])

    expect(outline.map((item) => item.title)).toEqual(["Chapter 1", "Broken dest", "Chapter 2"])
    expect(outline[0]?.destination).toBe("chapter-1")
    expect(outline[1]?.destination).toBeUndefined()
    expect(outline[2]?.href).toBe("https://example.test")
  })

  test("skips a malformed node without dropping the rest of the outline", () => {
    const outline = parsePdfOutline([
      { title: "Keep me", dest: "keep", items: [] },
      { dest: "missing-title", items: [] },
      {
        title: "Parent",
        dest: "parent",
        items: [
          { title: "Child", dest: "child", items: [] },
          { title: 12, dest: "bad-child" },
        ],
      },
    ])

    expect(outline.map((item) => item.title)).toEqual(["Keep me", "Parent"])
    expect(outline[1]?.items.map((item) => item.title)).toEqual(["Child"])
  })
})
