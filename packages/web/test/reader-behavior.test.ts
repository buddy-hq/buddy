import { beforeEach, describe, expect, test } from "bun:test"
import { READER_ANCHOR_KIND_CFI_TEXT } from "@buddy/reader-contract"
import type { PromptComposerAttachment } from "../src/components/prompt/prompt-types"
import {
  FLOW_PAGINATED,
  FLOW_SCROLLED,
  GLOBAL_PREFERENCES_STORAGE_KEY,
  READER_THEMES,
} from "../src/components/readers/foliate-reader-constants"
import { getOverlayPosition } from "../src/components/readers/utils/foliate-helpers"
import { READER_PREFERENCES_STORAGE_KEY } from "../src/components/readers/reader-storage"
import {
  READER_NAVIGATION_GO_LEFT,
  READER_NAVIGATION_GO_RIGHT,
  READER_NAVIGATION_NEXT,
  READER_NAVIGATION_PREVIOUS,
  resolveReaderArrowNavigation,
  resolveReaderWheelNavigation,
} from "../src/components/readers/utils/foliate-navigation"
import {
  appendReadingSelectionToDraft,
  removeReadingSelectionFromDraft,
} from "../src/components/readers/utils/reading-selection-draft"
import { loadGlobalPreferences } from "../src/components/readers/utils/foliate-storage"

describe("reader navigation", () => {
  test("uses physical page turns for fixed-layout content regardless of EPUB flow", () => {
    expect(
      resolveReaderArrowNavigation({
        flow: FLOW_SCROLLED,
        isFixedLayout: true,
        key: "ArrowLeft",
      }),
    ).toBe(READER_NAVIGATION_GO_LEFT)
    expect(
      resolveReaderArrowNavigation({
        flow: FLOW_SCROLLED,
        isFixedLayout: true,
        key: "ArrowRight",
      }),
    ).toBe(READER_NAVIGATION_GO_RIGHT)
  })

  test("uses vertical navigation only for reflowable section scroll", () => {
    expect(
      resolveReaderArrowNavigation({
        flow: FLOW_SCROLLED,
        isFixedLayout: false,
        key: "ArrowUp",
      }),
    ).toBe(READER_NAVIGATION_PREVIOUS)
    expect(
      resolveReaderArrowNavigation({
        flow: FLOW_SCROLLED,
        isFixedLayout: false,
        key: "ArrowDown",
      }),
    ).toBe(READER_NAVIGATION_NEXT)
    expect(
      resolveReaderArrowNavigation({
        flow: FLOW_SCROLLED,
        isFixedLayout: false,
        key: "ArrowLeft",
      }),
    ).toBeUndefined()
  })

  test("uses physical page turns for paginated EPUB content", () => {
    expect(
      resolveReaderArrowNavigation({
        flow: FLOW_PAGINATED,
        isFixedLayout: false,
        key: "ArrowLeft",
      }),
    ).toBe(READER_NAVIGATION_GO_LEFT)
  })

  test("turns sections when the wheel continues past a section-scroll boundary", () => {
    expect(
      resolveReaderWheelNavigation({
        flow: FLOW_SCROLLED,
        isFixedLayout: false,
        deltaY: 24,
        sectionStart: 600,
        sectionEnd: 1_000,
        sectionSize: 1_000,
      }),
    ).toBe(READER_NAVIGATION_NEXT)
    expect(
      resolveReaderWheelNavigation({
        flow: FLOW_SCROLLED,
        isFixedLayout: false,
        deltaY: -24,
        sectionStart: 0,
        sectionEnd: 400,
        sectionSize: 1_000,
      }),
    ).toBe(READER_NAVIGATION_PREVIOUS)
  })

  test("leaves wheel scrolling alone away from section boundaries", () => {
    expect(
      resolveReaderWheelNavigation({
        flow: FLOW_SCROLLED,
        isFixedLayout: false,
        deltaY: 24,
        sectionStart: 400,
        sectionEnd: 800,
        sectionSize: 1_000,
      }),
    ).toBeUndefined()
    expect(
      resolveReaderWheelNavigation({
        flow: FLOW_PAGINATED,
        isFixedLayout: false,
        deltaY: 24,
        sectionStart: 600,
        sectionEnd: 1_000,
        sectionSize: 1_000,
      }),
    ).toBeUndefined()
  })
})

describe("reader themes", () => {
  beforeEach(() => {
    localStorage.removeItem(GLOBAL_PREFERENCES_STORAGE_KEY)
    localStorage.removeItem(READER_PREFERENCES_STORAGE_KEY)
  })

  test("treats each theme as a complete appearance", () => {
    expect(
      READER_THEMES.map((theme) => ({
        id: theme.id,
        appearance: theme.appearance,
        pdfFilter: theme.pdfFilter,
      })),
    ).toEqual([
      { id: "paper", appearance: "light", pdfFilter: "none" },
      {
        id: "sepia",
        appearance: "light",
        pdfFilter: "sepia(0.22) saturate(0.92) brightness(0.98)",
      },
      {
        id: "night",
        appearance: "dark",
        pdfFilter: "brightness(0.78) saturate(0.9) contrast(1.04)",
      },
      {
        id: "mist",
        appearance: "light",
        pdfFilter: "brightness(0.99) saturate(0.96)",
      },
      {
        id: "graphite",
        appearance: "dark",
        pdfFilter: "grayscale(0.18) brightness(0.82) contrast(1.04)",
      },
    ])
  })

  test("ignores the legacy independent appearance preference", () => {
    localStorage.setItem(
      GLOBAL_PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        themeId: "night",
        flow: FLOW_PAGINATED,
        appearanceMode: "light",
      }),
    )

    expect(loadGlobalPreferences("paper", FLOW_SCROLLED)).not.toHaveProperty("appearanceMode")
    expect(loadGlobalPreferences("paper", FLOW_SCROLLED).themeId).toBe("night")
  })
})

describe("reader overlays", () => {
  test("returns coordinates local to the reader surface and clamps them to its edges", () => {
    const range = document.createRange()
    range.selectNodeContents(document.body)
    Object.defineProperty(range, "getBoundingClientRect", {
      value: () => new DOMRect(110, 70, 20, 10),
    })

    const container = document.createElement("div")
    Object.defineProperty(container, "getBoundingClientRect", {
      value: () => new DOMRect(100, 50, 300, 200),
    })

    expect(getOverlayPosition(range, container)).toEqual({ x: 24, y: 24 })
  })
})

describe("reading selection drafts", () => {
  const attachment: PromptComposerAttachment = {
    id: "attachment",
    filename: "notes.txt",
    mime: "text/plain",
    dataUrl: "data:text/plain,notes",
    kind: "file",
  }

  test("stages a structured selection without disturbing the existing draft", () => {
    const nextDraft = appendReadingSelectionToDraft(
      {
        value: "Ask ",
        parts: [{ type: "text", text: "Ask " }],
        attachments: [attachment],
        cursor: 4,
      },
      {
        text: "selected text",
        selectionKey: "selection-1",
        resourceKey: "book",
        anchor: {
          kind: READER_ANCHOR_KIND_CFI_TEXT,
          cfi: "epubcfi(/6/2)",
          sectionIndex: 1,
        },
      },
    )

    expect(nextDraft.parts).toEqual([
      { type: "text", text: "Ask " },
      {
        type: "selection-context",
        source: "reading",
        text: "selected text",
        selectionKey: "selection-1",
        resourceKey: "book",
        anchor: {
          kind: READER_ANCHOR_KIND_CFI_TEXT,
          cfi: "epubcfi(/6/2)",
          sectionIndex: 1,
        },
      },
    ])
    expect(nextDraft.attachments).toEqual([attachment])
    expect(nextDraft.cursor).toBe(nextDraft.value.length)
  })

  test("removes only the matching transient selection and preserves cursor bounds", () => {
    const nextDraft = removeReadingSelectionFromDraft(
      {
        value: "Ask first second",
        parts: [
          { type: "text", text: "Ask " },
          {
            type: "selection-context",
            source: "reading",
            text: "first",
            selectionKey: "selection-1",
            anchor: {
              kind: READER_ANCHOR_KIND_CFI_TEXT,
              cfi: "epubcfi(/6/2)",
              sectionIndex: 1,
            },
          },
          {
            type: "selection-context",
            source: "reading",
            text: "second",
            selectionKey: "selection-2",
            anchor: {
              kind: READER_ANCHOR_KIND_CFI_TEXT,
              cfi: "epubcfi(/6/4)",
              sectionIndex: 1,
            },
          },
        ],
        attachments: [attachment],
        cursor: 100,
      },
      "selection-1",
    )

    expect(nextDraft?.parts).toEqual([
      { type: "text", text: "Ask " },
      {
        type: "selection-context",
        source: "reading",
        text: "second",
        selectionKey: "selection-2",
        anchor: {
          kind: READER_ANCHOR_KIND_CFI_TEXT,
          cfi: "epubcfi(/6/4)",
          sectionIndex: 1,
        },
      },
    ])
    expect(nextDraft?.attachments).toEqual([attachment])
    expect(nextDraft?.cursor).toBe(nextDraft?.value.length)
  })
})
