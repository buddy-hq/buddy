import { describe, expect, test } from "bun:test"
import {
  READER_ANCHOR_KIND_CFI_TEXT,
  READER_ANCHOR_KIND_PDF_TEXT,
  type ReaderTextAnchor,
} from "@buddy/reader-contract"
import {
  collectPromptParts,
  createPromptPartsFromValue,
  extractResourceReferenceParts,
  extractWorkspaceFileReferenceParts,
  renderPromptParts,
  serializePromptParts,
} from "../../../src/components/prompt/prompt-parts"
import {
  BUDDY_PROMPT_PART_METADATA_KEY,
  READING_SELECTION_PART_TYPE,
  readPromptReadingSelectionMetadata,
  SELECTION_CONTEXT_PART_TYPE,
  type PromptReadingSelectionContextPart,
} from "../../../src/components/prompt/prompt-types"

const CFI_TEXT_ANCHOR: ReaderTextAnchor = {
  kind: READER_ANCHOR_KIND_CFI_TEXT,
  cfi: "epubcfi(/6/2)",
  sectionIndex: 1,
}

const PDF_TEXT_ANCHOR: ReaderTextAnchor = {
  kind: READER_ANCHOR_KIND_PDF_TEXT,
  segments: [
    {
      pageIndex: 2,
      quads: [
        {
          topLeft: { x: 10, y: 20 },
          topRight: { x: 40, y: 20 },
          bottomRight: { x: 40, y: 32 },
          bottomLeft: { x: 10, y: 32 },
        },
      ],
      startOffset: 4,
      endOffset: 12,
    },
  ],
  quote: {
    exact: "Selected PDF text",
    prefix: "Before ",
    suffix: " after",
  },
}

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

  test("round-trips v2 reference aliases without exposing their materialized path", () => {
    const parts = [
      { type: "text", text: "Use " },
      {
        type: "opencode-reference",
        name: "docs",
        path: "/reference-cache/docs",
      },
    ] as const
    const root = document.createElement("div")

    expect(serializePromptParts([...parts])).toBe("Use @docs")
    renderPromptParts(root, [...parts])

    expect(root.textContent).toBe("Use @docs\u200B")
    expect(collectPromptParts(root)).toEqual([...parts])
  })

  test("round-trips selection context cards", () => {
    const root = document.createElement("div")
    renderPromptParts(root, [
      { type: "text", text: "Revise " },
      {
        type: "selection-context",
        source: "markdown",
        text: "Selected worksheet prompt",
        selectionKey: "selection-1",
        path: "docs/worksheet.md",
        version: "v1",
        headingPath: ["Worksheet", "Prompt"],
      },
    ])

    expect(collectPromptParts(root)).toEqual([
      { type: "text", text: "Revise " },
      {
        type: "selection-context",
        source: "markdown",
        text: "Selected worksheet prompt",
        selectionKey: "selection-1",
        path: "docs/worksheet.md",
        version: "v1",
        headingPath: ["Worksheet", "Prompt"],
      },
    ])
  })

  test("round-trips PDF reading selections through validated reader-anchor data", () => {
    const root = document.createElement("div")
    const part: PromptReadingSelectionContextPart = {
      type: SELECTION_CONTEXT_PART_TYPE,
      source: "reading",
      text: "Selected PDF text",
      selectionKey: "selection-pdf",
      resourceKey: "pdf-book",
      anchor: PDF_TEXT_ANCHOR,
      pageLabel: "3",
    }

    renderPromptParts(root, [part])

    const card = root.firstElementChild
    if (!(card instanceof HTMLElement)) throw new Error("Expected a reading selection card")
    expect(card.dataset.readerAnchor).toBe(JSON.stringify(PDF_TEXT_ANCHOR))
    expect(card.hasAttribute("data-cfi")).toBe(false)
    expect(card.hasAttribute("data-index")).toBe(false)
    expect(collectPromptParts(root)).toEqual([part])
  })

  test("normalizes legacy CFI datasets without writing them back", () => {
    const root = document.createElement("div")
    const card = document.createElement("div")
    card.dataset.type = SELECTION_CONTEXT_PART_TYPE
    card.dataset.source = "reading"
    card.dataset.text = "Legacy selected text"
    card.dataset.selectionKey = "selection-legacy"
    card.dataset.cfi = "epubcfi(/6/2)"
    card.dataset.index = "1"
    root.append(card)

    expect(collectPromptParts(root)).toEqual([
      {
        type: SELECTION_CONTEXT_PART_TYPE,
        source: "reading",
        text: "Legacy selected text",
        selectionKey: "selection-legacy",
        anchor: CFI_TEXT_ANCHOR,
      },
    ])

    renderPromptParts(root, collectPromptParts(root))
    const normalizedCard = root.firstElementChild
    if (!(normalizedCard instanceof HTMLElement)) {
      throw new Error("Expected a normalized reading selection card")
    }
    expect(normalizedCard.dataset.readerAnchor).toBe(JSON.stringify(CFI_TEXT_ANCHOR))
    expect(normalizedCard.hasAttribute("data-cfi")).toBe(false)
    expect(normalizedCard.hasAttribute("data-index")).toBe(false)
  })

  test("rejects malformed reader-anchor data without falling back to legacy fields", () => {
    const root = document.createElement("div")
    const card = document.createElement("div")
    card.dataset.type = SELECTION_CONTEXT_PART_TYPE
    card.dataset.source = "reading"
    card.dataset.text = "Invalid selected text"
    card.dataset.selectionKey = "selection-invalid"
    card.dataset.readerAnchor = "{}"
    card.dataset.cfi = "epubcfi(/6/2)"
    card.dataset.index = "1"
    root.append(card)

    expect(collectPromptParts(root)).toEqual([])
  })

  test("normalizes historical reading-selection metadata to a CFI text anchor", () => {
    expect(
      readPromptReadingSelectionMetadata({
        [BUDDY_PROMPT_PART_METADATA_KEY]: {
          type: READING_SELECTION_PART_TYPE,
          text: "Legacy selected text",
          selectionKey: "selection-legacy",
          resourceKey: "book",
          cfi: "epubcfi(/6/2)",
          index: 1,
          tocLabel: "Chapter 1",
        },
      }),
    ).toEqual({
      type: READING_SELECTION_PART_TYPE,
      text: "Legacy selected text",
      selectionKey: "selection-legacy",
      resourceKey: "book",
      anchor: CFI_TEXT_ANCHOR,
      tocLabel: "Chapter 1",
    })
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
