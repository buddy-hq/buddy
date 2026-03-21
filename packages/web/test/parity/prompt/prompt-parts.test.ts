import { describe, expect, test } from "bun:test"
import {
  collectPromptParts,
  createPromptPartsFromValue,
  extractResourceReferenceParts,
  extractWorkspaceFileReferenceParts,
  renderPromptParts,
  serializePromptParts,
} from "../../../src/components/prompt/prompt-parts"

describe("prompt parts", () => {
  test("keeps manually typed file references as plain text while preserving selected agent pills", () => {
    const parts = createPromptPartsFromValue(
      "Review @buddy and @docs/book with spaces.pdf",
      new Set(["buddy"]),
    )

    expect(parts).toEqual([
      {
        type: "text",
        text: "Review ",
      },
      {
        type: "agent",
        name: "buddy",
      },
      {
        type: "text",
        text: " and @docs/book with spaces.pdf",
      },
    ])
  })

  test("keeps typed file paths with spaces as literal text", () => {
    const parts = createPromptPartsFromValue("Open @docs/book with spaces.pdf", new Set())

    expect(parts).toEqual([
      {
        type: "text",
        text: "Open @docs/book with spaces.pdf",
      },
    ])
    expect(serializePromptParts(parts)).toBe("Open @docs/book with spaces.pdf")
  })

  test("serializes workspace file references with spaces", () => {
    expect(
      serializePromptParts([
        { type: "text", text: "Read " },
        { type: "workspace-file-reference", path: "docs/book with spaces.pdf" },
      ]),
    ).toBe("Read @docs/book with spaces.pdf")
  })

  test("serializes and round-trips resource references", () => {
    const parts = [
      { type: "text", text: "Open " },
      { type: "resource-reference", key: "book" },
      { type: "text", text: " now" },
    ] as const

    expect(serializePromptParts([...parts])).toBe("Open resource:book now")

    const root = document.createElement("div")
    renderPromptParts(root, [...parts])

    expect(collectPromptParts(root)).toEqual([
      { type: "text", text: "Open " },
      { type: "resource-reference", key: "book" },
      { type: "text", text: " now" },
    ])
    expect(extractResourceReferenceParts([...parts])).toEqual([
      { type: "resource-reference", key: "book" },
    ])
  })

  test("round-trips structured editor parts", () => {
    const root = document.createElement("div")
    renderPromptParts(root, [
      { type: "text", text: "Read " },
      { type: "workspace-file-reference", path: "docs/book with spaces.pdf" },
      { type: "text", text: " with Buddy" },
    ])

    expect(collectPromptParts(root)).toEqual([
      { type: "text", text: "Read " },
      { type: "workspace-file-reference", path: "docs/book with spaces.pdf" },
      { type: "text", text: " with Buddy" },
    ])
  })

  test("adds a cursor anchor after a trailing structured part", () => {
    const root = document.createElement("div")
    renderPromptParts(root, [{ type: "workspace-file-reference", path: "docs/book.pdf" }])

    expect(root.lastChild?.nodeType).toBe(Node.TEXT_NODE)
    expect(root.lastChild?.textContent).toBe("\u200B")
  })

  test("extracts only workspace file references for submission", () => {
    expect(
      extractWorkspaceFileReferenceParts([
        { type: "text", text: "Read " },
        { type: "agent", name: "buddy" },
        { type: "workspace-file-reference", path: "docs/book.pdf" },
      ]),
    ).toEqual([{ type: "workspace-file-reference", path: "docs/book.pdf" }])
  })
})
