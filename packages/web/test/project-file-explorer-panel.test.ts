import { describe, expect, test } from "bun:test"
import { projectFileExplorerNodeLabel } from "../src/components/project-explorer/project-file-explorer-panel"

describe("Project file explorer presentation", () => {
  test("hides only Markdown extensions in the Obsidian variant", () => {
    expect(
      projectFileExplorerNodeLabel({
        name: "Daily note.md",
        nodeType: "file",
        variant: "obsidian",
      }),
    ).toBe("Daily note")
    expect(
      projectFileExplorerNodeLabel({
        name: "Canvas.canvas",
        nodeType: "file",
        variant: "obsidian",
      }),
    ).toBe("Canvas.canvas")
    expect(
      projectFileExplorerNodeLabel({
        name: "Templates.md",
        nodeType: "directory",
        variant: "obsidian",
      }),
    ).toBe("Templates.md")
  })

  test("keeps Markdown extensions in the default variant", () => {
    expect(
      projectFileExplorerNodeLabel({
        name: "Daily note.md",
        nodeType: "file",
        variant: "default",
      }),
    ).toBe("Daily note.md")
  })
})
