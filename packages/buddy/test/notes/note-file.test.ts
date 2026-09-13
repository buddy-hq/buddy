import { describe, expect, test } from "bun:test"
import { parseNoteFile, parseNoteSource, renderNoteSource } from "../../src/notes/note-file"

const METADATA = {
  type: "buddy-note" as const,
  "buddy-id": "01K00000000000000000000000",
  "buddy-notebook-id": "notebook-test",
  notebook: "Research",
}
const EXECUTION_MARKER = "__buddyNotesFrontmatterExecuted"

describe("Notes frontmatter", () => {
  test("never executes frontmatter while reading or rendering Markdown", () => {
    const source = `---javascript\n({ ran: Reflect.set(globalThis, "${EXECUTION_MARKER}", true) })\n---\n# Imported note`
    try {
      expect(parseNoteFile({ root: "/notes", filepath: "/notes/imported.md", source, updatedAt: 0 }))
        .toMatchObject({ content: source, summary: { kind: "plain" } })
      expect(Reflect.has(globalThis, EXECUTION_MARKER)).toBe(false)
      const rendered = renderNoteSource(source, METADATA)
      expect(parseNoteSource(rendered)?.content).toBe(source)
      expect(Reflect.has(globalThis, EXECUTION_MARKER)).toBe(false)
    } finally {
      Reflect.deleteProperty(globalThis, EXECUTION_MARKER)
    }
  })

  test("keeps malformed and unsupported frontmatter as plain Markdown", () => {
    for (const source of [
      "---\nbroken: [\n---\n# Note",
      "---toml\ntitle = 'Note'\n---\n# Note",
      "---\ntype: buddy-note\n---\n# Missing identity",
      "---\ntitle: Missing closing delimiter",
    ]) {
      expect(parseNoteFile({ root: "/notes", filepath: "/notes/plain.md", source, updatedAt: 0 }))
        .toMatchObject({ content: source, summary: { kind: "plain" } })
    }
  })

  test("preserves edited bodies exactly, including Markdown that resembles frontmatter", () => {
    for (const content of ["", "Edited note", "Edited note\n", "\nEdited note\n\n", "---\ntitle: Body text\n---\nKeep this"]) {
      expect(parseNoteSource(renderNoteSource(content, METADATA))).toEqual({ content, metadata: METADATA })
    }
    const windowsSource = renderNoteSource("Body", METADATA).replaceAll("\n", "\r\n")
    expect(parseNoteSource(windowsSource)?.content).toBe("Body")
  })
})
